/**
 * Stripe Customer Portal Session API — flow_data Deep Links
 *
 * Creates a Stripe Customer Portal session with a specific flow_data deep link
 * targeting exactly one action. Generic portal sessions are never created.
 *
 * The target price for billing cycle switches is always derived server-side
 * from the customer's accountType in DynamoDB + STRIPE_PRICES constant,
 * making cross-tier switching structurally impossible.
 *
 * Valid flows: switch_to_annual, switch_to_monthly, adjust_seats,
 *             update_payment, cancel
 *
 * Requires Authorization header with Cognito ID token.
 *
 * @see PLG User Journey - Section 2.6
 * @see Bugfix: Stripe silently ignores products param on portal config
 */

import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-verify";
import { getStripeClient } from "@/lib/stripe";
import { getStripeSecrets } from "@/lib/secrets";
import { getCustomerByEmail } from "@/lib/dynamodb";
import { createApiLogger } from "@/lib/api-log";
import { STRIPE_PRICES } from "@/lib/constants";

/** Valid flow values accepted by this endpoint */
const VALID_FLOWS = new Set([
  "switch_to_annual",
  "switch_to_monthly",
  "adjust_seats",
  "update_payment",
  "cancel",
]);

/** Valid endpoint modes */
const VALID_MODES = new Set([
  "main_portal",
  "deep_flow",
]);

/** Flows that require an active Stripe subscription to proceed */
const SUBSCRIPTION_FLOWS = new Set([
  "switch_to_annual",
  "switch_to_monthly",
  "adjust_seats",
  "cancel",
]);

/**
 * Builds the flow_data object for a billing cycle switch.
 * Target price is derived server-side from accountType + STRIPE_PRICES —
 * never from user input — preventing cross-tier switching.
 *
 * @param {string} targetCycle - "annual" or "monthly"
 * @param {string} accountType - "individual" or "business"
 * @param {object} subscription - Active Stripe subscription object
 * @returns {object} flow_data for subscription_update_confirm
 */
function buildCycleSwitchFlowData(targetCycle, accountType, subscription) {
  const targetPriceId = STRIPE_PRICES[accountType]?.[targetCycle];
  const item = subscription.items.data[0];

  return {
    type: "subscription_update_confirm",
    subscription_update_confirm: {
      subscription: subscription.id,
      items: [{
        id: item.id,
        price: targetPriceId,
        quantity: item.quantity,
      }],
    },
  };
}

/**
 * Builds the flow_data object for a seat quantity adjustment.
 *
 * @param {number} quantity - Validated seat count (integer 1-99)
 * @param {object} subscription - Active Stripe subscription object
 * @returns {object} flow_data for subscription_update_confirm
 */
function buildSeatAdjustFlowData(quantity, subscription) {
  const item = subscription.items.data[0];

  return {
    type: "subscription_update_confirm",
    subscription_update_confirm: {
      subscription: subscription.id,
      items: [{
        id: item.id,
        price: item.price.id,
        quantity,
      }],
    },
  };
}

/**
 * Builds the flow_data object for a subscription cancellation.
 *
 * @param {object} subscription - Active Stripe subscription object
 * @returns {object} flow_data for subscription_cancel
 */
function buildCancelFlowData(subscription) {
  return {
    type: "subscription_cancel",
    subscription_cancel: {
      subscription: subscription.id,
    },
  };
}

/**
 * POST /api/portal/stripe-session
 *
 * Creates a Stripe Billing Portal session with flow_data deep link.
 * Requires JSON body with { flow: string, quantity?: number }.
 *
 * @param {Request} request - Incoming request with JSON body
 * @returns {NextResponse} JSON response with { url } or error
 */
export async function POST(request) {
  const log = createApiLogger({
    service: "plg-api-portal-stripe-session",
    request,
    operation: "portal_stripe_session",
  });

  log.requestReceived();

  try {
    // --- Auth (preserved) ---
    const tokenPayload = await verifyAuthToken();
    if (!tokenPayload) {
      log.decision("auth_failed", "Portal stripe session rejected", {
        reason: "unauthorized",
      });
      log.response(401, "Portal stripe session rejected", {
        reason: "unauthorized",
      });
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // --- Customer lookup (preserved) ---
    const customer = await getCustomerByEmail(tokenPayload.email);

    if (!customer?.stripeCustomerId) {
      log.decision("customer_not_found", "Portal stripe session rejected", {
        reason: "missing_stripe_customer",
      });
      log.response(404, "Portal stripe session rejected", {
        reason: "missing_stripe_customer",
      });
      return NextResponse.json(
        { error: "No Stripe customer found. Please purchase a license first." },
        { status: 404 },
      );
    }

    // --- Parse and validate request body contract ---
    let body;
    try {
      body = await request.json();
    } catch {
      log.decision("invalid_body", "Portal stripe session rejected", {
        reason: "invalid_json_body",
      });
      log.response(400, "Portal stripe session rejected", {
        reason: "invalid_json_body",
      });
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { mode, flow, quantity } = body || {};

    if (!mode || !VALID_MODES.has(mode)) {
      log.decision("invalid_mode", "Portal stripe session rejected", {
        reason: "missing_or_invalid_mode",
        mode,
      });
      log.response(400, "Portal stripe session rejected", {
        reason: "missing_or_invalid_mode",
      });
      return NextResponse.json(
        { error: "Missing or invalid mode parameter. Valid values: main_portal, deep_flow" },
        { status: 400 },
      );
    }

    const stripe = await getStripeClient();
    const stripeSecrets = await getStripeSecrets();

    // --- Tier-specific portal config is mandatory ---
    const portalConfigId = customer.accountType === "business"
      ? stripeSecrets.STRIPE_PORTAL_CONFIG_BUSINESS
      : stripeSecrets.STRIPE_PORTAL_CONFIG_INDIVIDUAL;

    if (!portalConfigId) {
      log.decision("missing_portal_config", "Portal stripe session rejected", {
        reason: "missing_tier_portal_config",
        accountType: customer.accountType,
      });
      log.response(500, "Portal stripe session rejected", {
        reason: "missing_tier_portal_config",
      });
      return NextResponse.json(
        { error: "Stripe portal configuration is missing for account tier" },
        { status: 500 },
      );
    }

    const sessionParams = {
      customer: customer.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/billing?updated=true`,
      configuration: portalConfigId,
    };

    if (mode === "main_portal") {
      const portalSession = await stripe.billingPortal.sessions.create(sessionParams);

      log.response(200, "Portal stripe session created", {
        mode,
        hasPortalUrl: Boolean(portalSession.url),
      });
      return NextResponse.json({ url: portalSession.url });
    }

    if (!flow || !VALID_FLOWS.has(flow)) {
      log.decision("invalid_flow", "Portal stripe session rejected", {
        reason: "missing_or_invalid_flow",
        flow,
      });
      log.response(400, "Portal stripe session rejected", {
        reason: "missing_or_invalid_flow",
      });
      return NextResponse.json(
        { error: "Missing or invalid flow parameter. Valid values: switch_to_annual, switch_to_monthly, adjust_seats, update_payment, cancel" },
        { status: 400 },
      );
    }

    // --- Fetch active subscription for deep-flow actions that need it ---
    let subscription = null;
    if (SUBSCRIPTION_FLOWS.has(flow)) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.stripeCustomerId,
        status: "active",
        limit: 1,
      });

      subscription = subscriptions.data[0] || null;

      if (!subscription) {
        log.decision("no_active_subscription", "Portal stripe session rejected", {
          reason: "no_active_subscription",
          flow,
        });
        log.response(404, "Portal stripe session rejected", {
          reason: "no_active_subscription",
        });
        return NextResponse.json(
          { error: "No active subscription found" },
          { status: 404 },
        );
      }
    }

    // --- Build flow_data based on flow type ---
    let flowData;

    if (flow === "switch_to_annual" || flow === "switch_to_monthly") {
      const targetCycle = flow === "switch_to_annual" ? "annual" : "monthly";
      const currentPriceId = subscription.items.data[0].price.id;
      const targetPriceId = STRIPE_PRICES[customer.accountType]?.[targetCycle];

      if (currentPriceId === targetPriceId) {
        log.decision("already_on_target_cycle", "Portal stripe session rejected", {
          reason: "already_on_target_cycle",
          flow,
          currentPriceId,
        });
        log.response(400, "Portal stripe session rejected", {
          reason: "already_on_target_cycle",
        });
        return NextResponse.json(
          { error: "Already on the requested billing cycle" },
          { status: 400 },
        );
      }

      flowData = buildCycleSwitchFlowData(targetCycle, customer.accountType, subscription);
    } else if (flow === "adjust_seats") {
      if (customer.accountType === "individual") {
        log.decision("individual_seat_adjust", "Portal stripe session rejected", {
          reason: "individual_cannot_adjust_seats",
        });
        log.response(400, "Portal stripe session rejected", {
          reason: "individual_cannot_adjust_seats",
        });
        return NextResponse.json(
          { error: "Seat adjustment is only available for Business accounts" },
          { status: 400 },
        );
      }

      if (
        quantity == null ||
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        log.decision("invalid_quantity", "Portal stripe session rejected", {
          reason: "invalid_quantity",
          quantity,
        });
        log.response(400, "Portal stripe session rejected", {
          reason: "invalid_quantity",
        });
        return NextResponse.json(
          { error: "Quantity must be an integer between 1 and 99" },
          { status: 400 },
        );
      }

      flowData = buildSeatAdjustFlowData(quantity, subscription);
    } else if (flow === "update_payment") {
      flowData = { type: "payment_method_update" };
    } else if (flow === "cancel") {
      flowData = buildCancelFlowData(subscription);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      ...sessionParams,
      flow_data: flowData,
    });

    log.response(200, "Portal stripe session created", {
      mode,
      flow,
      flowDataType: flowData.type,
      hasPortalUrl: Boolean(portalSession.url),
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    log.exception(error, "portal_stripe_session_failed", "Portal stripe session failed");
    log.response(500, "Portal stripe session failed", {
      reason: "unhandled_error",
    });
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
