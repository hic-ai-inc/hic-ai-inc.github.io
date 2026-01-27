/**
 * Portal Devices API
 *
 * GET /api/portal/devices
 * DELETE /api/portal/devices (deactivate)
 *
 * Fetches and manages devices for the authenticated user's license.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCustomerByAuth0Id,
  getCustomerLicenses,
  getLicenseDevices,
} from "@/lib/dynamodb";
import { getLicenseMachines, deactivateDevice } from "@/lib/keygen";
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
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // In development with mock user, return mock data
    if (
      process.env.NODE_ENV === "development" &&
      session.user.sub === "auth0|dev-preview-user"
    ) {
      return NextResponse.json({
        devices: MOCK_DEVICES,
        maxDevices: 5,
        licenseId: "license_preview_123",
      });
    }

    // Get customer and licenses
    const customer = await getCustomerByAuth0Id(session.user.sub);
    if (!customer) {
      return NextResponse.json({ devices: [], maxDevices: 0 });
    }

    // Get licenses
    const licenses = await getCustomerLicenses(session.user.sub);
    if (licenses.length === 0) {
      return NextResponse.json({ devices: [], maxDevices: 0 });
    }

    // Get devices for the primary license
    const primaryLicense = licenses[0];
    const devices = await getLicenseDevices(primaryLicense.keygenLicenseId);

    // Also fetch from Keygen for the most accurate data
    let keygenDevices = [];
    try {
      keygenDevices = await getLicenseMachines(primaryLicense.keygenLicenseId);
    } catch (e) {
      console.error("Failed to fetch from Keygen:", e);
    }

    // Merge data, preferring Keygen for accurate heartbeat info
    const mergedDevices = devices.map((device) => {
      const keygenDevice = keygenDevices.find(
        (kd) => kd.id === device.keygenMachineId,
      );
      return {
        id: device.keygenMachineId,
        name: keygenDevice?.name || device.name,
        platform: keygenDevice?.platform || device.platform,
        fingerprint: device.fingerprint,
        lastSeen: keygenDevice?.lastHeartbeat || device.lastSeenAt,
        createdAt: keygenDevice?.createdAt || device.createdAt,
      };
    });

    // Get max devices from customer's plan using PRICING constants
    const planConfig = PRICING[customer.accountType];
    const maxDevices =
      planConfig?.maxDevices || planConfig?.maxDevicesPerSeat || 3;

    return NextResponse.json({
      devices: mergedDevices,
      maxDevices,
      licenseId: primaryLicense.keygenLicenseId,
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
    const session = await getSession();
    if (!session?.user) {
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

    // In development with mock user, simulate success
    if (
      process.env.NODE_ENV === "development" &&
      session.user.sub === "auth0|dev-preview-user"
    ) {
      return NextResponse.json({ success: true });
    }

    // Verify user owns this license
    const licenses = await getCustomerLicenses(session.user.sub);
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
