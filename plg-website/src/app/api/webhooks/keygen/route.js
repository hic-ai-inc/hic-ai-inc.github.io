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
import { sendPaymentFailedEmail } from "@/lib/ses";
import crypto from "crypto";

const KEYGEN_WEBHOOK_SECRET = process.env.KEYGEN_WEBHOOK_SECRET;

/**
 * Verify Keygen webhook signature
 */
function verifySignature(payload, signature) {
  if (!KEYGEN_WEBHOOK_SECRET) {
    console.warn("KEYGEN_WEBHOOK_SECRET not set, skipping verification");
    return true;
  }

  const expectedSignature = crypto
    .createHmac("sha256", KEYGEN_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

export async function POST(request) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("keygen-signature");

    // Verify webhook signature
    if (signature && !verifySignature(payload, signature)) {
      console.error("Invalid Keygen webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(payload);
    const { data, meta } = event;

    console.log(`Keygen webhook: ${meta.event}`, data.id);

    switch (meta.event) {
      // License Events
      case "license.created":
        // License created - usually handled in checkout flow
        console.log("License created:", data.id);
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
        // Device heartbeat - could update last seen in DynamoDB
        break;

      case "machine.heartbeat.dead":
        // Device failed heartbeat - could mark as inactive
        console.log("Machine heartbeat dead:", data.id);
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
    // Send notification email
    // await sendEmail("licenseExpired", license.email, { licenseId });
  }
}

async function handleLicenseSuspended(data) {
  const licenseId = data.id;
  console.log("License suspended:", licenseId);

  await updateLicenseStatus(licenseId, "suspended", {
    suspendedAt: new Date().toISOString(),
  });

  // Get license to find owner email
  const license = await getLicense(licenseId);
  if (license?.email) {
    // This usually happens due to payment failure
    // await sendPaymentFailedEmail(license.email, 3, null);
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

  await updateLicenseStatus(licenseId, "revoked", {
    revokedAt: new Date().toISOString(),
  });
}

async function handleMachineDeleted(data) {
  const machineId = data.id;
  const licenseId = data.relationships?.license?.data?.id;

  console.log("Machine deleted:", machineId, "license:", licenseId);

  if (licenseId) {
    await removeDeviceActivation(licenseId, machineId);
  }
}
