/**
 * Keygen Webhook Handler
 *
 * POST /api/webhooks/keygen
 *
 * Handles license lifecycle events from Keygen:
 * - License expiration
 * - License suspension
 * - Machine deactivation
 *
 * @see Security Considerations for Keygen Licensing
 */

import { NextResponse } from "next/server";
import {
  updateLicenseStatus,
  removeDeviceActivation,
  getLicense,
} from "@/lib/dynamodb";
// NOTE: Emails are sent via event-driven architecture:
// updateLicenseStatus() with eventType → DynamoDB Streams → StreamProcessor → SNS → EmailSender → SES
import crypto from "crypto";
import { createApiLogger } from "@/lib/api-log";

// Ed25519 public key from KeyGen webhook configuration
// Format: base64-encoded public key
const KEYGEN_WEBHOOK_PUBLIC_KEY = process.env.KEYGEN_WEBHOOK_PUBLIC_KEY;

/**
 * Verify Keygen webhook signature using Ed25519
 *
 * KeyGen sends signatures in the format:
 * Keygen-Signature: keyid="..." algorithm="ed25519" signature="<base64-signature>" headers="..."
 *
 * @param {string} payload - Raw request body
 * @param {string} signatureHeader - Value of Keygen-Signature header
 * @param {Request} request - Original request for reconstructing signing string
 * @returns {boolean} - Whether signature is valid
 */
function verifySignature(payload, signatureHeader, request, log) {
  if (!KEYGEN_WEBHOOK_PUBLIC_KEY) {
    log.error(
      "webhook_public_key_missing",
      "KEYGEN_WEBHOOK_PUBLIC_KEY not configured - rejecting request",
      null,
      { reason: "missing_public_key" },
    );
    return false;
  }

  if (!signatureHeader) {
    log.warn("signature_missing", "No Keygen-Signature header present");
    return false;
  }

  try {
    const parts = {};
    const regex = /(\w+)="([^"]+)"/g;
    let match;
    while ((match = regex.exec(signatureHeader)) !== null) {
      parts[match[1]] = match[2];
    }

    const { algorithm, signature, headers } = parts;

    if (!algorithm || !signature || !headers) {
      log.error(
        "signature_parts_missing",
        "Missing required Keygen signature parts",
        null,
        {
          hasAlgorithm: Boolean(algorithm),
          hasSignature: Boolean(signature),
          hasHeaders: Boolean(headers),
        },
      );
      return false;
    }

    if (algorithm !== "ed25519") {
      log.error("signature_algorithm_invalid", "Unexpected Keygen signature algorithm", null, {
        algorithm,
      });
      return false;
    }

    const headerList = headers.split(" ");
    const signingParts = [];

    for (const header of headerList) {
      if (header === "(request-target)") {
        signingParts.push(`(request-target): post /api/webhooks/keygen`);
      } else if (header === "digest") {
        const digest = crypto
          .createHash("sha256")
          .update(payload)
          .digest("base64");
        signingParts.push(`digest: sha-256=${digest}`);
      } else if (header === "host") {
        signingParts.push(
          `host: ${request.headers.get("host") || "hic-ai.com"}`,
        );
      } else if (header === "date") {
        signingParts.push(`date: ${request.headers.get("date") || ""}`);
      } else {
        const value = request.headers.get(header);
        if (value) {
          signingParts.push(`${header}: ${value}`);
        }
      }
    }

    const signingString = signingParts.join("\n");

    const publicKey = crypto.createPublicKey({
      key: Buffer.from(KEYGEN_WEBHOOK_PUBLIC_KEY, "base64"),
      format: "der",
      type: "spki",
    });

    const isValid = crypto.verify(
      null,
      Buffer.from(signingString),
      publicKey,
      Buffer.from(signature, "base64"),
    );

    return isValid;
  } catch (error) {
    log.error(
      "signature_verification_error",
      "Keygen signature verification error",
      error,
      { errorMessage: error?.message },
    );
    return false;
  }
}

export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-webhooks-keygen",
    request,
    operation: "webhook_keygen",
  });

  log.requestReceived();

  try {
    const payload = await request.text();
    const signatureHeader = request.headers.get("keygen-signature");

    if (!verifySignature(payload, signatureHeader, request, log)) {
      log.decision("signature_invalid", "Invalid Keygen webhook signature", {
        reason: "signature_invalid",
      });
      log.response(401, "Keygen webhook rejected", { reason: "signature_invalid" });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(payload);
    const { data, meta } = event;

    log.info("keygen_webhook_received", "Keygen webhook event received", {
      eventType: meta?.event,
      resourceId: data?.id,
    });

    switch (meta.event) {
      case "license.created":
        log.info("license_created_acknowledged", "Keygen license.created acknowledged", {
          licenseId: data.id,
        });
        break;

      case "license.deleted":
        log.info("license_deleted_acknowledged", "Keygen license.deleted acknowledged", {
          licenseId: data.id,
        });
        break;

      case "license.expired":
        await handleLicenseExpired(data, log);
        break;

      case "license.suspended":
        await handleLicenseSuspended(data, log);
        break;

      case "license.reinstated":
        await handleLicenseReinstated(data, log);
        break;

      case "license.renewed":
        await handleLicenseRenewed(data, log);
        break;

      case "license.revoked":
        await handleLicenseRevoked(data, log);
        break;

      case "machine.created":
        log.info("machine_created_acknowledged", "Machine activated event acknowledged", {
          machineId: data.id,
        });
        break;

      case "machine.deleted":
        await handleMachineDeleted(data, log);
        break;

      case "machine.heartbeat.ping":
        log.info("machine_heartbeat_ping", "Machine heartbeat ping received", {
          machineId: data.id,
        });
        break;

      case "machine.heartbeat.dead":
        log.info("machine_heartbeat_dead", "Machine heartbeat dead event received", {
          machineId: data.id,
        });
        break;

      case "policy.updated":
        log.info("policy_updated_acknowledged", "Policy updated event acknowledged", {
          policyId: data.id,
        });
        break;

      default:
        log.info("event_unhandled", "Unhandled Keygen webhook event", {
          eventType: meta.event,
        });
    }

    log.response(200, "Keygen webhook processed", { eventType: meta?.event });
    return NextResponse.json({ received: true });
  } catch (error) {
    log.exception(error, "keygen_webhook_failed", "Keygen webhook processing failed");
    log.response(500, "Keygen webhook processing failed", {
      reason: "unhandled_error",
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

// ===========================================
// EVENT HANDLERS
// ===========================================

async function handleLicenseExpired(data, log) {
  const licenseId = data.id;
  log.info("license_expired", "License expired event received", { licenseId });

  await updateLicenseStatus(licenseId, "expired", {
    expiredAt: new Date().toISOString(),
  });

  const license = await getLicense(licenseId);
  if (license?.email) {
    log.info("license_expired_processed", "License expiration processed", {
      hasEmail: true,
      licenseId,
    });
  }
}

async function handleLicenseSuspended(data, log) {
  const licenseId = data.id;
  log.info("license_suspended", "License suspended event received", { licenseId });

  const license = await getLicense(licenseId);

  await updateLicenseStatus(licenseId, "suspended", {
    suspendedAt: new Date().toISOString(),
    eventType: "LICENSE_SUSPENDED",
    email: license?.email,
  });

  if (license?.email) {
    log.info("license_suspended_email_pipeline_triggered", "License suspension email will be sent via event pipeline", {
      hasEmail: true,
      licenseId,
    });
  }
}

async function handleLicenseReinstated(data, log) {
  const licenseId = data.id;
  log.info("license_reinstated", "License reinstated event received", { licenseId });

  await updateLicenseStatus(licenseId, "active", {
    reinstatedAt: new Date().toISOString(),
  });
}

async function handleLicenseRenewed(data, log) {
  const licenseId = data.id;
  const newExpiry = data.attributes.expiry;
  log.info("license_renewed", "License renewed event received", {
    licenseId,
    hasNewExpiry: Boolean(newExpiry),
  });

  await updateLicenseStatus(licenseId, "active", {
    expiresAt: newExpiry,
    renewedAt: new Date().toISOString(),
  });
}

async function handleLicenseRevoked(data, log) {
  const licenseId = data.id;
  log.info("license_revoked", "License revoked event received", { licenseId });

  const license = await getLicense(licenseId);

  await updateLicenseStatus(licenseId, "revoked", {
    revokedAt: new Date().toISOString(),
    eventType: "LICENSE_REVOKED",
    email: license?.email,
    organizationName: license?.organizationName,
  });

  log.info("license_revoked_email_pipeline_triggered", "License revocation email will be sent via event pipeline", {
    licenseId,
    hasEmail: Boolean(license?.email),
  });
}

async function handleMachineDeleted(data, log) {
  const machineId = data.id;
  const licenseId = data.relationships?.license?.data?.id;

  log.info("machine_deleted", "Machine deleted event received", {
    machineId,
    hasLicenseId: Boolean(licenseId),
  });

  if (licenseId) {
    await removeDeviceActivation(licenseId, machineId);
  }
}
