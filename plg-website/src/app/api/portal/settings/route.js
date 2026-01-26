/**
 * Portal Settings API
 *
 * GET /api/portal/settings - Get user settings
 * PATCH /api/portal/settings - Update settings
 *
 * Manages user profile and notification preferences.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomerByAuth0Id, upsertCustomer } from "@/lib/dynamodb";

/**
 * GET - Retrieve user settings
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customer = await getCustomerByAuth0Id(session.user.sub);

    // Default notification preferences
    const defaultNotifications = {
      productUpdates: true,
      usageAlerts: true,
      billingReminders: true,
      marketingEmails: false,
    };

    return NextResponse.json({
      profile: {
        name: session.user.name || customer?.name || "",
        email: session.user.email,
        picture: session.user.picture || null,
        accountType: customer?.accountType || "individual",
        createdAt: customer?.createdAt || null,
      },
      notifications: customer?.notificationPreferences || defaultNotifications,
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

/**
 * PATCH - Update user settings
 */
export async function PATCH(request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, notifications } = body;

    // Get existing customer
    const customer = await getCustomerByAuth0Id(session.user.sub);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Build update object
    const updates = {};

    // Update name if provided
    if (name !== undefined) {
      if (typeof name !== "string" || name.length > 100) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      updates.name = name.trim();
    }

    // Update notification preferences if provided
    if (notifications !== undefined) {
      if (typeof notifications !== "object") {
        return NextResponse.json(
          { error: "Invalid notification preferences" },
          { status: 400 },
        );
      }

      // Validate and sanitize notification preferences
      const validKeys = [
        "productUpdates",
        "usageAlerts",
        "billingReminders",
        "marketingEmails",
      ];
      const sanitizedNotifications = {};

      for (const key of validKeys) {
        if (key in notifications) {
          sanitizedNotifications[key] = Boolean(notifications[key]);
        }
      }

      updates.notificationPreferences = {
        ...(customer.notificationPreferences || {}),
        ...sanitizedNotifications,
      };
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await upsertCustomer({
        auth0Id: session.user.sub,
        email: customer.email,
        stripeCustomerId: customer.stripeCustomerId,
        keygenLicenseId: customer.keygenLicenseId,
        accountType: customer.accountType,
        subscriptionStatus: customer.subscriptionStatus,
        metadata: updates,
      });
    }

    return NextResponse.json({
      success: true,
      updated: Object.keys(updates),
    });
  } catch (error) {
    console.error("Settings PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
