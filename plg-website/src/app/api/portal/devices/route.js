/**
 * Portal Devices API
 *
 * GET /api/portal/devices
 * DELETE /api/portal/devices (deactivate)
 *
 * Fetches and manages devices for the authenticated user's license.
 * Requires Authorization header with Cognito ID token.
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByEmail,
  getCustomerLicensesByEmail,
  getLicenseDevices,
} from "@/lib/dynamodb";
import { deactivateDevice } from "@/lib/keygen";
import { PRICING } from "@/lib/constants";

// Mock data for development preview
const MOCK_DEVICES = [
  {
    id: "machine_preview_1",
    name: 'MacBook Pro 16"',
    platform: "macOS",
    fingerprint: "abc123def456",
    lastSeen: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
  },
  {
    id: "machine_preview_2",
    name: "Windows Desktop",
    platform: "Windows",
    fingerprint: "xyz789ghi012",
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(), // 14 days ago
  },
  {
    id: "machine_preview_3",
    name: "Ubuntu Dev Container",
    platform: "Linux",
    fingerprint: "lnx456container",
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(), // 10 days ago (inactive)
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(), // 60 days ago
  },
];

export async function GET() {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email from verified token
    const userEmail = tokenPayload.email;
    if (!userEmail) {
      console.error("[Devices] No email in token");
      return NextResponse.json({ devices: [], maxDevices: 0 });
    }

    const customer = await getCustomerByEmail(userEmail);
    if (!customer) {
      return NextResponse.json({ devices: [], maxDevices: 0 });
    }

    // Get license ID directly from customer record
    // The customer record has keygenLicenseId from checkout webhook
    const licenseId = customer.keygenLicenseId;
    if (!licenseId) {
      console.log("[Devices] Customer has no license:", userEmail);
      return NextResponse.json({ devices: [], maxDevices: 0 });
    }

    // Get devices for the license from DynamoDB
    // DynamoDB is the authoritative source - heartbeat API updates lastSeenAt there
    const devices = await getLicenseDevices(licenseId);

    // Map DynamoDB device records to response format
    const mappedDevices = devices.map((device) => ({
      id: device.keygenMachineId,
      name: device.name,
      platform: device.platform,
      fingerprint: device.fingerprint,
      lastSeen: device.lastSeenAt,
      createdAt: device.createdAt,
    }));

    // Get max devices from customer's plan using PRICING constants
    const planConfig = PRICING[customer.accountType];
    const maxDevices =
      planConfig?.maxConcurrentMachinesPerSeat || planConfig?.maxConcurrentMachines || 3;

    return NextResponse.json({
      devices: mappedDevices,
      maxDevices,
      licenseId,
    });
  } catch (error) {
    console.error("Portal devices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    // Verify JWT from Authorization header
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { machineId, licenseId } = body;

    if (!machineId || !licenseId) {
      return NextResponse.json(
        { error: "Machine ID and License ID required" },
        { status: 400 },
      );
    }

    // Verify user owns this license by checking their licenses
    const userEmail = tokenPayload.email;
    const licenses = await getCustomerLicensesByEmail(userEmail);
    const ownsLicense = licenses.some((l) => l.keygenLicenseId === licenseId);
    if (!ownsLicense) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Deactivate via Keygen
    await deactivateDevice(machineId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Device deactivation error:", error);
    return NextResponse.json(
      { error: "Failed to deactivate device" },
      { status: 500 },
    );
  }
}
