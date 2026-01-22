/**
 * Portal Devices API
 *
 * GET /api/portal/devices
 * DELETE /api/portal/devices (deactivate)
 *
 * Fetches and manages devices for the authenticated user's license.
 */

import { NextResponse } from "next/server";
import { getSession } from "@auth0/nextjs-auth0";
import {
  getCustomerByAuth0Id,
  getCustomerLicenses,
  getLicenseDevices,
} from "@/lib/dynamodb";
import { getLicenseMachines, deactivateDevice } from "@/lib/keygen";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Get max devices from customer's plan
    const maxDevices =
      customer.accountType === "enterprise"
        ? 10
        : customer.accountType === "individual"
          ? 3
          : 2;

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
