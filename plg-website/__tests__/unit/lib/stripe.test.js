/**
 * Stripe Client Tests
 *
 * Tests the stripe.js module that provides Stripe payment integration.
 *
 * Behaviors tested:
 * - Client injection for testing
 * - Checkout session creation
 * - Portal session creation
 * - Subscription quantity updates
 * - Webhook signature verification
 * - Product and coupon constants
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";
import { createStripeMock } from "../../../../dm/facade/helpers/stripe.js";

import {
  getStripeClient,
  __setStripeClientForTests,
  __resetStripeClientForTests,
  createCheckoutSession,
  createPortalSession,
  updateSubscriptionQuantity,
  verifyWebhookSignature,
  STRIPE_PRODUCTS,
  STRIPE_COUPONS,
} from "../../../src/lib/stripe.js";

describe("stripe.js", () => {
  let stripeMock;

  beforeEach(() => {
    stripeMock = createStripeMock();
    __setStripeClientForTests(stripeMock);
  });

  afterEach(() => {
    __resetStripeClientForTests();
  });

  describe("getStripeClient", () => {
    it("should return the injected mock client during tests", () => {
      const client = getStripeClient();
      expect(client).toBe(stripeMock);
    });
  });

  describe("STRIPE_PRODUCTS", () => {
    it("should have INDIVIDUAL_MONTHLY price ID", () => {
      expect(STRIPE_PRODUCTS.INDIVIDUAL_MONTHLY).toBe(
        "price_individual_monthly",
      );
    });

    it("should have INDIVIDUAL_ANNUAL price ID", () => {
      expect(STRIPE_PRODUCTS.INDIVIDUAL_ANNUAL).toBe("price_individual_annual");
    });

    // v4.2: Business tier has monthly/annual pricing
    it("should have BUSINESS_MONTHLY price ID", () => {
      expect(STRIPE_PRODUCTS.BUSINESS_MONTHLY).toBe("price_business_monthly");
    });

    it("should have BUSINESS_ANNUAL price ID", () => {
      expect(STRIPE_PRODUCTS.BUSINESS_ANNUAL).toBe("price_business_annual");
    });
  });

  describe("STRIPE_COUPONS", () => {
    it("should have EARLY_ADOPTER coupon code", () => {
      expect(STRIPE_COUPONS.EARLY_ADOPTER).toBe("EARLYADOPTER20");
    });
  });

  describe("createCheckoutSession", () => {
    it("should create checkout session with required parameters", async () => {
      const mockSession = {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/test",
      };
      stripeMock.checkout.sessions.create.mockResolvedValue(mockSession);

      const result = await createCheckoutSession({
        priceId: "price_individual_monthly",
        successUrl: "https://hic-ai.com/success",
        cancelUrl: "https://hic-ai.com/cancel",
      });

      expect(result.id).toBe("cs_test_123");
      expect(result.url).toBe("https://checkout.stripe.com/test");
      expect(stripeMock.checkout.sessions.create.calls.length).toBe(1);
    });

    it("should pass priceId in line_items", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_123" });

      await createCheckoutSession({
        priceId: "price_individual_annual",
        successUrl: "https://hic-ai.com/success",
        cancelUrl: "https://hic-ai.com/cancel",
      });

      const callArgs = stripeMock.checkout.sessions.create.calls[0][0];
      expect(callArgs.line_items[0].price).toBe("price_individual_annual");
      expect(callArgs.line_items[0].quantity).toBe(1);
    });

    it("should set mode to subscription", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_123" });

      await createCheckoutSession({
        priceId: "price_individual_monthly",
        successUrl: "https://hic-ai.com/success",
        cancelUrl: "https://hic-ai.com/cancel",
      });

      const callArgs = stripeMock.checkout.sessions.create.calls[0][0];
      expect(callArgs.mode).toBe("subscription");
    });

    it("should include success and cancel URLs", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_123" });

      await createCheckoutSession({
        priceId: "price_individual_monthly",
        successUrl:
          "https://hic-ai.com/success?session_id={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://hic-ai.com/pricing",
      });

      const callArgs = stripeMock.checkout.sessions.create.calls[0][0];
      expect(callArgs.success_url).toBe(
        "https://hic-ai.com/success?session_id={CHECKOUT_SESSION_ID}",
      );
      expect(callArgs.cancel_url).toBe("https://hic-ai.com/pricing");
    });

    it("should attach to existing customer when customerId provided", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_123" });

      await createCheckoutSession({
        priceId: "price_individual_monthly",
        customerId: "cus_existing_123",
        successUrl: "https://hic-ai.com/success",
        cancelUrl: "https://hic-ai.com/cancel",
      });

      const callArgs = stripeMock.checkout.sessions.create.calls[0][0];
      expect(callArgs.customer).toBe("cus_existing_123");
    });

    it("should set customer_creation to always when no customerId", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_123" });

      await createCheckoutSession({
        priceId: "price_individual_monthly",
        successUrl: "https://hic-ai.com/success",
        cancelUrl: "https://hic-ai.com/cancel",
      });

      const callArgs = stripeMock.checkout.sessions.create.calls[0][0];
      expect(callArgs.customer_creation).toBe("always");
      expect(callArgs.customer).toBeUndefined();
    });

    it("should include metadata when provided", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_123" });

      await createCheckoutSession({
        priceId: "price_individual_monthly",
        successUrl: "https://hic-ai.com/success",
        cancelUrl: "https://hic-ai.com/cancel",
        metadata: { planType: "individual", source: "pricing_page" },
      });

      const callArgs = stripeMock.checkout.sessions.create.calls[0][0];
      expect(callArgs.metadata.planType).toBe("individual");
      expect(callArgs.metadata.source).toBe("pricing_page");
    });

    it("should throw error when Stripe API fails", async () => {
      stripeMock.checkout.sessions.create.mockRejectedValue(
        new Error("Invalid price ID"),
      );

      let error;
      try {
        await createCheckoutSession({
          priceId: "invalid_price",
          successUrl: "https://hic-ai.com/success",
          cancelUrl: "https://hic-ai.com/cancel",
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("Invalid price ID");
    });
  });

  describe("createPortalSession", () => {
    it("should create portal session for customer", async () => {
      const mockSession = {
        id: "bps_test_123",
        url: "https://billing.stripe.com/session/test",
      };
      stripeMock.billingPortal.sessions.create.mockResolvedValue(mockSession);

      const result = await createPortalSession(
        "cus_abc123",
        "https://hic-ai.com/portal",
      );

      expect(result.id).toBe("bps_test_123");
      expect(result.url).toBe("https://billing.stripe.com/session/test");
    });

    it("should pass customer ID to Stripe", async () => {
      stripeMock.billingPortal.sessions.create.mockResolvedValue({
        id: "bps_123",
      });

      await createPortalSession(
        "cus_customer_456",
        "https://hic-ai.com/portal",
      );

      const callArgs = stripeMock.billingPortal.sessions.create.calls[0][0];
      expect(callArgs.customer).toBe("cus_customer_456");
    });

    it("should pass return URL to Stripe", async () => {
      stripeMock.billingPortal.sessions.create.mockResolvedValue({
        id: "bps_123",
      });

      await createPortalSession(
        "cus_abc123",
        "https://hic-ai.com/portal/billing",
      );

      const callArgs = stripeMock.billingPortal.sessions.create.calls[0][0];
      expect(callArgs.return_url).toBe("https://hic-ai.com/portal/billing");
    });

    it("should throw error when customer not found", async () => {
      stripeMock.billingPortal.sessions.create.mockRejectedValue(
        new Error("No such customer: cus_invalid"),
      );

      let error;
      try {
        await createPortalSession("cus_invalid", "https://hic-ai.com/portal");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("No such customer");
    });
  });

  describe("updateSubscriptionQuantity", () => {
    it("should update subscription seat quantity", async () => {
      // Mock subscription retrieval
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: "sub_enterprise_123",
        items: {
          data: [{ id: "si_item_123", quantity: 10 }],
        },
      });

      // Mock subscription update
      const updatedSubscription = {
        id: "sub_enterprise_123",
        items: {
          data: [{ id: "si_item_123", quantity: 25 }],
        },
      };
      stripeMock.subscriptions.update.mockResolvedValue(updatedSubscription);

      const result = await updateSubscriptionQuantity("sub_enterprise_123", 25);

      expect(result.items.data[0].quantity).toBe(25);
    });

    it("should retrieve subscription to get item ID", async () => {
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: "sub_123",
        items: { data: [{ id: "si_456", quantity: 10 }] },
      });
      stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_123" });

      await updateSubscriptionQuantity("sub_123", 50);

      expect(stripeMock.subscriptions.retrieve.calls.length).toBe(1);
      expect(stripeMock.subscriptions.retrieve.calls[0][0]).toBe("sub_123");
    });

    it("should update with correct subscription item and quantity", async () => {
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: "sub_123",
        items: { data: [{ id: "si_item_abc", quantity: 10 }] },
      });
      stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_123" });

      await updateSubscriptionQuantity("sub_123", 100);

      const updateArgs = stripeMock.subscriptions.update.calls[0];
      expect(updateArgs[0]).toBe("sub_123");
      expect(updateArgs[1].items[0].id).toBe("si_item_abc");
      expect(updateArgs[1].items[0].quantity).toBe(100);
    });

    it("should set proration_behavior to create_prorations", async () => {
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: "sub_123",
        items: { data: [{ id: "si_456", quantity: 10 }] },
      });
      stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_123" });

      await updateSubscriptionQuantity("sub_123", 50);

      const updateArgs = stripeMock.subscriptions.update.calls[0][1];
      expect(updateArgs.proration_behavior).toBe("create_prorations");
    });

    it("should throw error when subscription not found", async () => {
      stripeMock.subscriptions.retrieve.mockRejectedValue(
        new Error("No such subscription: sub_invalid"),
      );

      let error;
      try {
        await updateSubscriptionQuantity("sub_invalid", 25);
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("No such subscription");
    });
  });

  describe("verifyWebhookSignature", () => {
    it("should verify and return event when signature is valid", () => {
      const mockEvent = {
        id: "evt_test_123",
        type: "checkout.session.completed",
        data: { object: { id: "cs_123" } },
      };
      stripeMock.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = verifyWebhookSignature(
        '{"id":"evt_test_123"}',
        "whsec_signature_123",
      );

      expect(result.id).toBe("evt_test_123");
      expect(result.type).toBe("checkout.session.completed");
    });

    it("should pass payload and signature to Stripe", () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({ id: "evt_123" });

      verifyWebhookSignature("raw_payload_body", "stripe_signature_header");

      const callArgs = stripeMock.webhooks.constructEvent.calls[0];
      expect(callArgs[0]).toBe("raw_payload_body");
      expect(callArgs[1]).toBe("stripe_signature_header");
    });

    it("should throw error when signature is invalid", () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error("Webhook signature verification failed");
      });

      let error;
      try {
        verifyWebhookSignature("payload", "invalid_signature");
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain("signature verification failed");
    });
  });
});
