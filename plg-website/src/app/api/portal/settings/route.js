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
import { createApiLogger } from "@/lib/api-log";

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
  const log = createApiLogger({
    service: "plg-api-portal-settings",
    request,
    operation: "portal_settings_get",
  });

  log.requestReceived();

  try {
    const user = await getUserFromRequest();
    if (!user) {
      log.decision("auth_failed", "Settings GET rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Settings GET rejected", { reason: "unauthorized" });
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

    log.response(200, "Settings returned", {
      hasCustomer: Boolean(customer),
      accountType: customer?.accountType || "individual",
    });
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
    log.exception(error, "portal_settings_get_failed", "Settings GET failed");
    log.response(500, "Settings GET failed", { reason: "unhandled_error" });
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
  const log = createApiLogger({
    service: "plg-api-portal-settings",
    request,
    operation: "portal_settings_update",
  });

  log.requestReceived();

  try {
    const user = await getUserFromRequest();
    if (!user) {
      log.decision("auth_failed", "Settings PATCH rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Settings PATCH rejected", { reason: "unauthorized" });
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
      log.info("customer_profile_created", "Customer profile created during settings PATCH");
    }

    // Build update object
    const updates = {};

    // Update name fields if provided
    if (givenName !== undefined) {
      if (typeof givenName !== "string" || givenName.length > 50) {
        log.decision("invalid_given_name", "Settings PATCH rejected", {
          reason: "invalid_given_name",
        });
        log.response(400, "Settings PATCH rejected", { reason: "invalid_given_name" });
        return NextResponse.json({ error: "Invalid first name" }, { status: 400 });
      }
      updates.givenName = givenName.trim();
    }

    if (middleName !== undefined) {
      if (typeof middleName !== "string" || middleName.length > 10) {
        log.decision("invalid_middle_name", "Settings PATCH rejected", {
          reason: "invalid_middle_name",
        });
        log.response(400, "Settings PATCH rejected", { reason: "invalid_middle_name" });
        return NextResponse.json({ error: "Invalid middle initial" }, { status: 400 });
      }
      updates.middleName = middleName.trim();
    }

    if (familyName !== undefined) {
      if (typeof familyName !== "string" || familyName.length > 50) {
        log.decision("invalid_family_name", "Settings PATCH rejected", {
          reason: "invalid_family_name",
        });
        log.response(400, "Settings PATCH rejected", { reason: "invalid_family_name" });
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
        log.decision("invalid_notification_preferences", "Settings PATCH rejected", {
          reason: "invalid_notification_preferences",
        });
        log.response(400, "Settings PATCH rejected", {
          reason: "invalid_notification_preferences",
        });
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
      log.info("settings_updated", "Settings updated", {
        updatedFields: Object.keys(updates),
      });
    }

    log.response(200, "Settings PATCH succeeded", {
      updatedFields: Object.keys(updates),
    });
    return NextResponse.json({
      success: true,
      updated: Object.keys(updates),
    });
  } catch (error) {
    log.exception(error, "portal_settings_update_failed", "Settings PATCH failed");
    log.response(500, "Settings PATCH failed", { reason: "unhandled_error" });
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
