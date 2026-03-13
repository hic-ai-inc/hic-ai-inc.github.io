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
import { getCustomerByUserId, upsertCustomer, updateCustomerProfile, getUserOrgMembership, getOrganization, getOrgNameReservation, createOrgNameReservation, deleteOrgNameReservation, updateOrganization } from "@/lib/dynamodb";
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

    // Load organization context for Business users
    let organization = null;
    const orgMembership = await getUserOrgMembership(user.sub);
    if (orgMembership) {
      const org = await getOrganization(orgMembership.orgId);
      organization = {
        id: orgMembership.orgId,
        name: org?.name || null,
        role: orgMembership.role,
        canEdit: orgMembership.role === "owner",
      };
    }

    log.response(200, "Settings returned", {
      hasCustomer: Boolean(customer),
      accountType: customer?.accountType || "individual",
      hasOrganization: Boolean(organization),
    });

    const response = {
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
    };

    if (organization) {
      response.organization = organization;
    }

    return NextResponse.json(response);
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
    const { givenName, middleName, familyName, notifications, organizationName } = body;

    // Handle organization name update if requested
    if (organizationName !== undefined) {
      // Validate type
      if (typeof organizationName !== "string") {
        log.response(400, "Settings PATCH rejected", { reason: "org_name_not_string" });
        return NextResponse.json({ error: "Organization name must be a string" }, { status: 400 });
      }

      const trimmedName = organizationName.trim();

      // Validate non-empty
      if (!trimmedName) {
        log.response(400, "Settings PATCH rejected", { reason: "org_name_empty" });
        return NextResponse.json({ error: "Organization name cannot be empty" }, { status: 400 });
      }

      // Validate length
      if (trimmedName.length > 120) {
        log.response(400, "Settings PATCH rejected", { reason: "org_name_too_long" });
        return NextResponse.json({ error: "Organization name must be 120 characters or fewer" }, { status: 400 });
      }

      // Enforce role: must be Business Owner
      const orgMembership = await getUserOrgMembership(user.sub);
      if (!orgMembership || orgMembership.role !== "owner") {
        log.response(403, "Settings PATCH rejected", { reason: "not_org_owner" });
        return NextResponse.json({ error: "Only the organization owner can update the business name" }, { status: 403 });
      }

      const org = await getOrganization(orgMembership.orgId);
      const currentName = org?.name || "";
      const nameChanged = currentName.trim().toUpperCase() !== trimmedName.toUpperCase();

      if (nameChanged) {
        // Check uniqueness via reservation record
        const reservation = await getOrgNameReservation(trimmedName);
        if (reservation.exists && reservation.orgId !== orgMembership.orgId) {
          log.response(409, "Settings PATCH rejected", { reason: "org_name_taken" });
          return NextResponse.json({ error: "This business name is already registered." }, { status: 409 });
        }

        // Delete old reservation if org had one
        if (currentName.trim()) {
          try {
            await deleteOrgNameReservation(currentName);
          } catch (deleteErr) {
            log.warn("old_reservation_delete_failed", "Failed to delete old org name reservation", {
              errorMessage: deleteErr?.message,
            });
          }
        }

        // Create new reservation
        await createOrgNameReservation(trimmedName, orgMembership.orgId);
      }

      // Update org record with the trimmed name (preserves user's casing)
      await updateOrganization({ orgId: orgMembership.orgId, name: trimmedName });

      log.info("org_name_updated", "Organization name updated", {
        orgId: orgMembership.orgId,
        nameChanged,
      });

      // Return updated organization block
      return NextResponse.json({
        success: true,
        updated: ["organizationName"],
        organization: {
          id: orgMembership.orgId,
          name: trimmedName,
          role: orgMembership.role,
          canEdit: true,
        },
      });
    }

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
