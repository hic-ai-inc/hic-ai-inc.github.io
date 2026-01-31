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
function verifySignature(payload, signatureHeader, request) {
  if (!KEYGEN_WEBHOOK_PUBLIC_KEY) {
    console.error("KEYGEN_WEBHOOK_PUBLIC_KEY not configured - rejecting request");
    return false;
  }

  if (!signatureHeader) {
    console.warn("No Keygen-Signature header present");
    return false;
  }

  try {
    // Parse the signature header
    // Format: keyid="..." algorithm="ed25519" signature="<base64>" headers="(request-target) host date digest"
    const parts = {};
    const regex = /(\w+)="([^"]+)"/g;
    let match;
    while ((match = regex.exec(signatureHeader)) !== null) {
      parts[match[1]] = match[2];
    }

    const { algorithm, signature, headers } = parts;

    if (!algorithm || !signature || !headers) {
      console.error("Missing required signature parts:", {
        algorithm: !!algorithm,
        signature: !!signature,
        headers: !!headers,
      });
      return false;
    }

    if (algorithm !== "ed25519") {
      console.error(`Unexpected algorithm: ${algorithm}`);
      return false;
    }

    // Reconstruct the signing string based on headers
    const headerList = headers.split(" ");
    const signingParts = [];

    for (const header of headerList) {
      if (header === "(request-target)") {
        signingParts.push(`(request-target): post /api/webhooks/keygen`);
      } else if (header === "digest") {
        // Digest is SHA-256 of the body
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

    // Verify the Ed25519 signature
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(KEYGEN_WEBHOOK_PUBLIC_KEY, "base64"),
      format: "der",
      type: "spki",
    });

    const isValid = crypto.verify(
      null, // Ed25519 doesn't use a separate hash algorithm
      Buffer.from(signingString),
      publicKey,
      Buffer.from(signature, "base64"),
    );

    return isValid;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

export async function POST(request) {
  try {
    const payload = await request.text();
    const signatureHeader = request.headers.get("keygen-signature");

    // Verify webhook signature (Ed25519)
    if (!verifySignature(payload, signatureHeader, request)) {
      console.error("Invalid Keygen webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(payload);
    const { data, meta } = event;

    console.log(`Keygen webhook: ${meta.event}`, data.id);

    switch (meta.event) {
      // License Events
      case "license.created":
        // License created - handled in checkout flow
        // Webhook just acknowledges; actual customer record is created by Stripe webhook
        console.log("Keygen license.created acknowledged:", data.id);
        break;

      case "license.deleted":
        // License deleted - cleanup any orphaned records
        console.log("Keygen license.deleted acknowledged:", data.id);
        // Note: Actual deletion is handled by admin scripts or Stripe cancellation flow
        break;

      case "license.expired":
        await handleLicenseExpired(data);
        break;

      case "license.suspended":
        await handleLicenseSuspended(data);
        break;

      case "license.reinstated":
        await handleLicenseReinstated(data);
        break;

      case "license.renewed":
        await handleLicenseRenewed(data);
        break;

      case "license.revoked":
        await handleLicenseRevoked(data);
        break;

      // Machine Events
      case "machine.created":
        console.log("Machine activated:", data.id);
        break;

      case "machine.deleted":
        await handleMachineDeleted(data);
        break;

      case "machine.heartbeat.ping":
        // Device heartbeat received - Keygen tracks this internally
        // DynamoDB lastSeen is updated via our heartbeat API endpoint
        break;

      case "machine.heartbeat.dead":
        // Device missed heartbeat deadline - Keygen will auto-deactivate
        // (DEACTIVATE_DEAD strategy) and send machine.deleted webhook
        console.log(
          "Machine heartbeat dead:",
          data.id,
          "- will be auto-deactivated",
        );
        break;

      // Policy Events
      case "policy.updated":
        console.log("Policy updated:", data.id);
        break;

      default:
        console.log(`Unhandled Keygen event: ${meta.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Keygen webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

// ===========================================
// EVENT HANDLERS
// ===========================================

async function handleLicenseExpired(data) {
  const licenseId = data.id;
  console.log("License expired:", licenseId);

  await updateLicenseStatus(licenseId, "expired", {
    expiredAt: new Date().toISOString(),
  });

  // Get license to find owner email
  const license = await getLicense(licenseId);
  if (license?.email) {
    // Note: License expiration is handled by Stripe subscription end
    // No separate notification needed - user already got cancellation email
    console.log(`License ${licenseId} expired for ${license.email}`);
  }
}

async function handleLicenseSuspended(data) {
  const licenseId = data.id;
  console.log("License suspended:", licenseId);

  // Get license first to include email in update (for event-driven email)
  const license = await getLicense(licenseId);

  // Update with eventType to trigger email via DynamoDB Streams pipeline
  await updateLicenseStatus(licenseId, "suspended", {
    suspendedAt: new Date().toISOString(),
    eventType: "LICENSE_SUSPENDED",
    email: license?.email,
  });

  // Suspension email is sent via event-driven pipeline:
  // updateLicenseStatus() → DynamoDB Stream → StreamProcessor → SNS → EmailSender → SES
  if (license?.email) {
    console.log(
      `License ${licenseId} suspended - email will be sent via event pipeline`,
    );
  }
}

async function handleLicenseReinstated(data) {
  const licenseId = data.id;
  console.log("License reinstated:", licenseId);

  await updateLicenseStatus(licenseId, "active", {
    reinstatedAt: new Date().toISOString(),
  });
}

async function handleLicenseRenewed(data) {
  const licenseId = data.id;
  const newExpiry = data.attributes.expiry;
  console.log("License renewed:", licenseId, "new expiry:", newExpiry);

  await updateLicenseStatus(licenseId, "active", {
    expiresAt: newExpiry,
    renewedAt: new Date().toISOString(),
  });
}

async function handleLicenseRevoked(data) {
  const licenseId = data.id;
  console.log("License revoked:", licenseId);

  // Get license first to include email in update (for event-driven email)
  const license = await getLicense(licenseId);

  // Update with eventType to trigger email via DynamoDB Streams pipeline
  await updateLicenseStatus(licenseId, "revoked", {
    revokedAt: new Date().toISOString(),
    eventType: "LICENSE_REVOKED",
    email: license?.email,
    organizationName: license?.organizationName,
  });

  // Revocation email is sent via event-driven pipeline:
  // updateLicenseStatus() → DynamoDB Stream → StreamProcessor → SNS → EmailSender → SES
  console.log(
    `License ${licenseId} revoked - email will be sent via event pipeline`,
  );
}

async function handleMachineDeleted(data) {
  const machineId = data.id;
  const licenseId = data.relationships?.license?.data?.id;

  console.log("Machine deleted:", machineId, "license:", licenseId);

  if (licenseId) {
    await removeDeviceActivation(licenseId, machineId);
  }
}
