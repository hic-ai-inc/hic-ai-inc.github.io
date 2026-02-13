/**
 * Portal Devices API
 *
 * GET /api/portal/devices
 *
 * Fetches device status for the authenticated user's license.
 * Returns per-user devices (scoped by Cognito userId).
 * For business accounts, includes totalActiveDevices across the license.
 *
 * Requires Authorization header with Cognito ID token.
 *
 * Phase 3F: Read-only endpoint. No DELETE — device lifecycle is
 * managed by HIC via heartbeat enforcement (2-hour sliding window).
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import {
  getCustomerByEmail,
  getUserDevices,
  getActiveDevicesInWindow,
} from "@/lib/dynamodb";
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

    // Phase 3F: Per-user device scoping
    // Each user sees only their own devices, scoped by Cognito userId
    const userId = tokenPayload.sub;
    const devices = await getUserDevices(licenseId, userId);

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
      planConfig?.maxConcurrentMachinesPerSeat ||
      planConfig?.maxConcurrentMachines ||
      3;

    // For business accounts, include total active devices across the license
    // so Owner/Admin can see team-wide usage
    const response = {
      devices: mappedDevices,
      maxDevices,
      licenseId,
    };

    if (customer.accountType === "business") {
      const allActiveDevices = await getActiveDevicesInWindow(licenseId);
      response.totalActiveDevices = allActiveDevices.length;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Portal devices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 },
    );
  }
}
