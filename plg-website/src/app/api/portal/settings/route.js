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
import { getSession } from "@/lib/auth";
import { getCustomerByAuth0Id, upsertCustomer } from "@/lib/dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";

// Create Cognito JWT verifier (lazily initialized)
let jwtVerifier = null;
function getJwtVerifier() {
  if (!jwtVerifier && process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID && process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID) {
    jwtVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
      tokenUse: "access",
      clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    });
  }
  return jwtVerifier;
}

/**
 * Get user from Authorization header token or fallback to session
 */
async function getUserFromRequest(request) {
  // Try Authorization header first (Cognito access token)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const verifier = getJwtVerifier();
    if (verifier) {
      try {
        const payload = await verifier.verify(token);
        return {
          sub: payload.sub,
          email: payload.email || payload.username,
          name: payload.name || null,
        };
      } catch (err) {
        console.error("[Settings API] Token verification failed:", err.message);
        // Fall through to session check
      }
    }
  }
  
  // Fallback to session (dev mode or legacy)
  const session = await getSession();
  return session?.user || null;
}

/**
 * GET - Retrieve user settings
 */
export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customer = await getCustomerByAuth0Id(user.sub);

    // Default notification preferences
    const defaultNotifications = {
      productUpdates: true,
      usageAlerts: true,
      billingReminders: true,
      marketingEmails: false,
    };

    return NextResponse.json({
      profile: {
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
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, notifications } = body;

    // Get existing customer or create one if doesn't exist
    let customer = await getCustomerByAuth0Id(user.sub);
    
    // If customer doesn't exist, create a new record
    // This happens for new users who haven't purchased yet
    if (!customer) {
      customer = await upsertCustomer({
        auth0Id: user.sub,
        email: user.email,
        accountType: "individual",
        subscriptionStatus: "none",
      });
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
        auth0Id: user.sub,
        email: customer.email || user.email,
        stripeCustomerId: customer.stripeCustomerId,
        keygenLicenseId: customer.keygenLicenseId,
        accountType: customer.accountType || "individual",
        subscriptionStatus: customer.subscriptionStatus || "none",
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
