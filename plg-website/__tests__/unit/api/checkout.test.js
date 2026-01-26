/**
 * Checkout API Route Tests
 *
 * Tests the checkout flow logic including:
 * - Plan validation
 * - Price ID selection based on plan/billing cycle
 * - Enterprise seat requirements
 * - Session parameter building
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { PRICING, STRIPE_PRICES } from "../../../src/lib/constants.js";

// Helper to create mock Auth0 session
function createMockSession(userOverrides = {}) {
  return {
    user: {
      sub: "auth0|test123",
      email: "test@example.com",
      email_verified: true,
      ...userOverrides,
    },
  };
}

describe("checkout API logic", () => {
  // Mock functions that simulate route handler logic
  function validatePlan(plan) {
    if (!plan || !["individual", "team"].includes(plan)) {
      return { valid: false, error: "Invalid plan specified" };
    }
    return { valid: true };
  }

  function validateEnterpriseSeats(plan, seats) {
    if (plan === "team" && seats < PRICING.team.minSeats) {
      return {
        valid: false,
        error: `Team plan requires minimum ${PRICING.team.minSeats} seats`,
      };
    }
    return { valid: true };
  }

  function getPriceId(plan, billingCycle = "monthly", seats = 1) {
    if (plan === "individual") {
      return billingCycle === "annual"
        ? STRIPE_PRICES.individual.annual
        : STRIPE_PRICES.individual.monthly;
    }

    // Team - select tier based on seat count
    if (seats >= 500) {
      return STRIPE_PRICES.team.seats500;
    } else if (seats >= 100) {
      return STRIPE_PRICES.team.seats100;
    } else {
      return STRIPE_PRICES.team.seats5;
    }
  }

  function getQuantity(plan, seats = 1) {
    return plan === "individual" ? 1 : seats; // team has variable seats
  }

  function getCustomerEmail(session, bodyEmail) {
    return session?.user?.email || bodyEmail;
  }

  function buildCheckoutParams(priceId, quantity, customerEmail, promoCode) {
    const baseUrl = "https://hic-ai.com";
    return {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      success_url: `${baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?cancelled=true`,
      customer_email: customerEmail,
      allow_promotion_codes: !promoCode,
    };
  }

  describe("plan validation", () => {
    it("should reject missing plan", () => {
      const result = validatePlan(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Invalid plan specified");
    });

    it("should reject empty plan", () => {
      const result = validatePlan("");
      assert.strictEqual(result.valid, false);
    });

    it("should reject invalid plan types", () => {
      const result = validatePlan("premium");
      assert.strictEqual(result.valid, false);
    });

    it("should accept individual plan", () => {
      const result = validatePlan("individual");
      assert.strictEqual(result.valid, true);
    });

    it("should accept team plan", () => {
      const result = validatePlan("team");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("team seat validation", () => {
    it("should reject team with too few seats", () => {
      const result = validateEnterpriseSeats("team", 3);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes("minimum"));
    });

    it("should accept team with minimum seats", () => {
      const result = validateEnterpriseSeats(
        "team",
        PRICING.team.minSeats,
      );
      assert.strictEqual(result.valid, true);
    });

    it("should accept team with more than minimum seats", () => {
      const result = validateEnterpriseSeats("team", 50);
      assert.strictEqual(result.valid, true);
    });

    it("should not validate seats for individual plan", () => {
      const result = validateEnterpriseSeats("individual", 1);
      assert.strictEqual(result.valid, true);
    });
  });

  describe("price ID selection", () => {
    it("should return monthly price for individual monthly", () => {
      const priceId = getPriceId("individual", "monthly");
      assert.strictEqual(priceId, STRIPE_PRICES.individual.monthly);
    });

    it("should return annual price for individual annual", () => {
      const priceId = getPriceId("individual", "annual");
      assert.strictEqual(priceId, STRIPE_PRICES.individual.annual);
    });

    it("should return seats10 price for enterprise with 10-99 seats", () => {
      const priceId = getPriceId("enterprise", "monthly", 10);
      assert.strictEqual(priceId, STRIPE_PRICES.enterprise.seats10);

      const priceId2 = getPriceId("enterprise", "monthly", 99);
      assert.strictEqual(priceId2, STRIPE_PRICES.enterprise.seats10);
    });

    it("should return seats100 price for enterprise with 100-499 seats", () => {
      const priceId = getPriceId("enterprise", "monthly", 100);
      assert.strictEqual(priceId, STRIPE_PRICES.enterprise.seats100);

      const priceId2 = getPriceId("enterprise", "monthly", 499);
      assert.strictEqual(priceId2, STRIPE_PRICES.enterprise.seats100);
    });

    it("should return seats500 price for enterprise with 500+ seats", () => {
      const priceId = getPriceId("enterprise", "monthly", 500);
      assert.strictEqual(priceId, STRIPE_PRICES.enterprise.seats500);

      const priceId2 = getPriceId("enterprise", "monthly", 1000);
      assert.strictEqual(priceId2, STRIPE_PRICES.enterprise.seats500);
    });
  });

  describe("quantity calculation", () => {
    it("should return 1 for individual plan", () => {
      const quantity = getQuantity("individual", 1);
      assert.strictEqual(quantity, 1);
    });

    it("should return seat count for enterprise plan", () => {
      const quantity = getQuantity("enterprise", 25);
      assert.strictEqual(quantity, 25);
    });
  });

  describe("customer email resolution", () => {
    it("should use session email when available", () => {
      const session = createMockSession({ email: "session@example.com" });
      const email = getCustomerEmail(session, "body@example.com");
      assert.strictEqual(email, "session@example.com");
    });

    it("should fall back to body email when no session", () => {
      const email = getCustomerEmail(null, "body@example.com");
      assert.strictEqual(email, "body@example.com");
    });

    it("should return undefined when neither available", () => {
      const email = getCustomerEmail(null, undefined);
      assert.strictEqual(email, undefined);
    });
  });

  describe("checkout params building", () => {
    it("should build correct params structure", () => {
      const params = buildCheckoutParams(
        "price_123",
        1,
        "test@example.com",
        null,
      );

      assert.strictEqual(params.mode, "subscription");
      assert.deepStrictEqual(params.payment_method_types, ["card"]);
      assert.strictEqual(params.line_items[0].price, "price_123");
      assert.strictEqual(params.line_items[0].quantity, 1);
      assert.strictEqual(params.customer_email, "test@example.com");
    });

    it("should include success and cancel URLs", () => {
      const params = buildCheckoutParams(
        "price_123",
        1,
        "test@example.com",
        null,
      );

      assert.ok(params.success_url.includes("/welcome"));
      assert.ok(params.success_url.includes("session_id"));
      assert.ok(params.cancel_url.includes("/pricing"));
      assert.ok(params.cancel_url.includes("cancelled=true"));
    });

    it("should allow promotion codes when no promo code specified", () => {
      const params = buildCheckoutParams(
        "price_123",
        1,
        "test@example.com",
        null,
      );
      assert.strictEqual(params.allow_promotion_codes, true);
    });

    it("should disable promotion codes when promo code specified", () => {
      const params = buildCheckoutParams(
        "price_123",
        1,
        "test@example.com",
        "DISCOUNT10",
      );
      assert.strictEqual(params.allow_promotion_codes, false);
    });

    it("should set correct quantity for enterprise", () => {
      const params = buildCheckoutParams(
        "price_enterprise",
        50,
        "admin@acme.com",
        null,
      );
      assert.strictEqual(params.line_items[0].quantity, 50);
    });
  });
});

describe("checkout verify API logic", () => {
  function validateSessionId(sessionId) {
    if (!sessionId) {
      return { valid: false, error: "Session ID is required" };
    }
    return { valid: true };
  }

  function checkPaymentStatus(session) {
    if (session.payment_status !== "paid") {
      return { valid: false, error: "Payment not completed" };
    }
    return { valid: true };
  }

  function getPlanName(planType) {
    if (planType === "individual") return "Individual";
    if (planType === "enterprise") return "Enterprise";
    return "Open Source";
  }

  function extractVerificationData(session) {
    const planType = session.metadata?.planType || "individual";
    return {
      valid: true,
      email: session.customer_email || session.customer_details?.email,
      planType,
      planName: getPlanName(planType),
      subscriptionId: session.subscription?.id,
      customerId: session.customer,
    };
  }

  describe("session ID validation", () => {
    it("should reject missing session ID", () => {
      const result = validateSessionId(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Session ID is required");
    });

    it("should accept valid session ID", () => {
      const result = validateSessionId("cs_test_123");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("payment status check", () => {
    it("should reject unpaid session", () => {
      const result = checkPaymentStatus({ payment_status: "unpaid" });
      assert.strictEqual(result.valid, false);
    });

    it("should accept paid session", () => {
      const result = checkPaymentStatus({ payment_status: "paid" });
      assert.strictEqual(result.valid, true);
    });
  });

  describe("plan name resolution", () => {
    it("should return Individual for individual plan", () => {
      assert.strictEqual(getPlanName("individual"), "Individual");
    });

    it("should return Enterprise for enterprise plan", () => {
      assert.strictEqual(getPlanName("enterprise"), "Enterprise");
    });

    it("should return Open Source for oss plan", () => {
      assert.strictEqual(getPlanName("oss"), "Open Source");
    });
  });

  describe("verification data extraction", () => {
    it("should extract correct data from session", () => {
      const session = {
        payment_status: "paid",
        customer_email: "test@example.com",
        customer: "cus_123",
        subscription: { id: "sub_456" },
        metadata: { planType: "individual" },
      };

      const result = extractVerificationData(session);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.email, "test@example.com");
      assert.strictEqual(result.planType, "individual");
      assert.strictEqual(result.planName, "Individual");
      assert.strictEqual(result.subscriptionId, "sub_456");
      assert.strictEqual(result.customerId, "cus_123");
    });

    it("should use customer_details email as fallback", () => {
      const session = {
        payment_status: "paid",
        customer_email: null,
        customer_details: { email: "fallback@example.com" },
        customer: "cus_123",
        subscription: { id: "sub_456" },
        metadata: {},
      };

      const result = extractVerificationData(session);
      assert.strictEqual(result.email, "fallback@example.com");
    });

    it("should default to individual plan when metadata missing", () => {
      const session = {
        payment_status: "paid",
        customer_email: "test@example.com",
        customer: "cus_123",
        subscription: { id: "sub_456" },
        metadata: {},
      };

      const result = extractVerificationData(session);
      assert.strictEqual(result.planType, "individual");
      assert.strictEqual(result.planName, "Individual");
    });
  });
});
