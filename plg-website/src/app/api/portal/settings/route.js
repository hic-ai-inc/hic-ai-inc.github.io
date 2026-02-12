/**
 * Portal Settings API
 *
 * GET /api/portal/settings - Get user settings
 * PATCH /api/portal/settings - Update settings
 *
 * Manages user profile and notification preferences.
 * Accepts Cognito access token via Authorization header.
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import { getCustomerByUserId, upsertCustomer, updateCustomerProfile } from "@/lib/dynamodb";

/**
 * Get user from Cognito ID token
 */
async function getUserFromRequest() {
  const payload = await verifyAuthToken();
  if (!payload) return null;

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.given_name || null,
  };
}

/**
 * GET - Retrieve user settings
 */
export async function GET(request) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customer = await getCustomerByUserId(user.sub);

    // Default notification preferences
    const defaultNotifications = {
      productUpdates: true,
      usageAlerts: true,
      billingReminders: true,
      marketingEmails: false,
    };

    return NextResponse.json({
      profile: {
        // Return individual name fields from DynamoDB (for email signups)
        givenName: customer?.givenName || "",
        middleName: customer?.middleName || "",
        familyName: customer?.familyName || "",
        name: user.name || customer?.name || "",
        email: user.email,
        picture: user.picture || null,
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
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { givenName, middleName, familyName, notifications } = body;

    // Get existing customer or create one if doesn't exist
    let customer = await getCustomerByUserId(user.sub);
    
    // If customer doesn't exist, create a new record
    // This happens for new users who haven't purchased yet
    if (!customer) {
      customer = await upsertCustomer({
        userId: user.sub,
        email: user.email,
        accountType: "individual",
        subscriptionStatus: "none",
      });
    }

    // Build update object
    const updates = {};

    // Update name fields if provided
    if (givenName !== undefined) {
      if (typeof givenName !== "string" || givenName.length > 50) {
        return NextResponse.json({ error: "Invalid first name" }, { status: 400 });
      }
      updates.givenName = givenName.trim();
    }

    if (middleName !== undefined) {
      if (typeof middleName !== "string" || middleName.length > 10) {
        return NextResponse.json({ error: "Invalid middle initial" }, { status: 400 });
      }
      updates.middleName = middleName.trim();
    }

    if (familyName !== undefined) {
      if (typeof familyName !== "string" || familyName.length > 50) {
        return NextResponse.json({ error: "Invalid last name" }, { status: 400 });
      }
      updates.familyName = familyName.trim();
    }

    // Construct full name for backward compatibility
    if (givenName !== undefined || middleName !== undefined || familyName !== undefined) {
      const gn = updates.givenName ?? customer?.givenName ?? "";
      const mn = updates.middleName ?? customer?.middleName ?? "";
      const fn = updates.familyName ?? customer?.familyName ?? "";
      updates.name = mn ? `${gn} ${mn} ${fn}`.trim() : `${gn} ${fn}`.trim();
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

    // Apply updates using UpdateCommand (preserves existing fields)
    if (Object.keys(updates).length > 0) {
      await updateCustomerProfile(user.sub, updates);
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
