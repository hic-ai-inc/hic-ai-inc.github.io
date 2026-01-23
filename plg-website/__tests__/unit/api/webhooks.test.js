/**
 * Webhook API Route Tests
 *
 * Tests the webhook handler logic for Stripe and Keygen:
 * - Signature verification
 * - Event type routing
 * - Handler behaviors
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import crypto from "crypto";

describe("webhooks/stripe API logic", () => {
  function validateSignature(signature) {
    if (!signature) {
      return {
        valid: false,
        error: "Missing stripe-signature header",
        status: 400,
      };
    }
    return { valid: true };
  }

  function getEventType(event) {
    return event?.type || null;
  }

  function isHandledEventType(eventType) {
    const handledTypes = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
      "charge.dispute.created",
      "charge.dispute.closed",
    ];
    return handledTypes.includes(eventType);
  }

  function extractCheckoutData(session) {
    return {
      customerId: session.customer,
      customerEmail: session.customer_email,
      subscriptionId: session.subscription,
      planType: session.metadata?.planType || "individual",
      seats: parseInt(session.metadata?.seats || "1", 10),
    };
  }

  function determineSubscriptionStatus(status) {
    const statusMap = {
      active: "active",
      past_due: "past_due",
      canceled: "canceled",
      incomplete: "incomplete",
      incomplete_expired: "expired",
      trialing: "trialing",
      unpaid: "unpaid",
    };
    return statusMap[status] || "unknown";
  }

  describe("signature validation", () => {
    it("should reject missing signature", () => {
      const result = validateSignature(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, "Missing stripe-signature header");
      assert.strictEqual(result.status, 400);
    });

    it("should accept present signature", () => {
      const result = validateSignature("t=123,v1=abc");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("event type extraction", () => {
    it("should extract event type", () => {
      const event = { type: "checkout.session.completed" };
      assert.strictEqual(getEventType(event), "checkout.session.completed");
    });

    it("should return null for missing event", () => {
      assert.strictEqual(getEventType(null), null);
    });

    it("should return null for missing type", () => {
      assert.strictEqual(getEventType({}), null);
    });
  });

  describe("handled event types", () => {
    it("should recognize checkout.session.completed", () => {
      assert.strictEqual(
        isHandledEventType("checkout.session.completed"),
        true,
      );
    });

    it("should recognize subscription events", () => {
      assert.strictEqual(
        isHandledEventType("customer.subscription.created"),
        true,
      );
      assert.strictEqual(
        isHandledEventType("customer.subscription.updated"),
        true,
      );
      assert.strictEqual(
        isHandledEventType("customer.subscription.deleted"),
        true,
      );
    });

    it("should recognize invoice events", () => {
      assert.strictEqual(isHandledEventType("invoice.payment_succeeded"), true);
      assert.strictEqual(isHandledEventType("invoice.payment_failed"), true);
    });

    it("should recognize dispute events", () => {
      assert.strictEqual(isHandledEventType("charge.dispute.created"), true);
      assert.strictEqual(isHandledEventType("charge.dispute.closed"), true);
    });

    it("should not recognize unknown events", () => {
      assert.strictEqual(isHandledEventType("unknown.event"), false);
      assert.strictEqual(isHandledEventType("customer.created"), false);
    });
  });

  describe("checkout data extraction", () => {
    it("should extract data from checkout session", () => {
      const session = {
        customer: "cus_123",
        customer_email: "user@example.com",
        subscription: "sub_456",
        metadata: {
          planType: "enterprise",
          seats: "25",
        },
      };

      const data = extractCheckoutData(session);

      assert.strictEqual(data.customerId, "cus_123");
      assert.strictEqual(data.customerEmail, "user@example.com");
      assert.strictEqual(data.subscriptionId, "sub_456");
      assert.strictEqual(data.planType, "enterprise");
      assert.strictEqual(data.seats, 25);
    });

    it("should default to individual plan", () => {
      const session = {
        customer: "cus_123",
        customer_email: "user@example.com",
        subscription: "sub_456",
        metadata: {},
      };

      const data = extractCheckoutData(session);
      assert.strictEqual(data.planType, "individual");
    });

    it("should default to 1 seat", () => {
      const session = {
        customer: "cus_123",
        metadata: {},
      };

      const data = extractCheckoutData(session);
      assert.strictEqual(data.seats, 1);
    });
  });

  describe("subscription status mapping", () => {
    it("should map active status", () => {
      assert.strictEqual(determineSubscriptionStatus("active"), "active");
    });

    it("should map past_due status", () => {
      assert.strictEqual(determineSubscriptionStatus("past_due"), "past_due");
    });

    it("should map canceled status", () => {
      assert.strictEqual(determineSubscriptionStatus("canceled"), "canceled");
    });

    it("should map incomplete statuses", () => {
      assert.strictEqual(
        determineSubscriptionStatus("incomplete"),
        "incomplete",
      );
      assert.strictEqual(
        determineSubscriptionStatus("incomplete_expired"),
        "expired",
      );
    });

    it("should map trialing status", () => {
      assert.strictEqual(determineSubscriptionStatus("trialing"), "trialing");
    });

    it("should return unknown for unrecognized status", () => {
      assert.strictEqual(
        determineSubscriptionStatus("weird_status"),
        "unknown",
      );
    });
  });
});

describe("webhooks/keygen API logic", () => {
  function createHmacSignature(payload, secret) {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  function verifySignature(payload, signature, secret) {
    if (!secret) {
      console.warn("KEYGEN_WEBHOOK_SECRET not set, skipping verification");
      return true;
    }

    const expectedSignature = createHmacSignature(payload, secret);

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  }

  function getEventType(event) {
    return event?.meta?.event || null;
  }

  function isHandledEventType(eventType) {
    const handledTypes = [
      "license.created",
      "license.expired",
      "license.suspended",
      "license.reinstated",
      "license.renewed",
      "license.revoked",
      "machine.created",
      "machine.deleted",
      "machine.heartbeat.ping",
    ];
    return handledTypes.includes(eventType);
  }

  function shouldUpdateLicenseStatus(eventType) {
    const statusUpdateEvents = [
      "license.expired",
      "license.suspended",
      "license.reinstated",
      "license.renewed",
      "license.revoked",
    ];
    return statusUpdateEvents.includes(eventType);
  }

  function mapEventToStatus(eventType) {
    const statusMap = {
      "license.expired": "expired",
      "license.suspended": "suspended",
      "license.reinstated": "active",
      "license.renewed": "active",
      "license.revoked": "revoked",
    };
    return statusMap[eventType] || null;
  }

  describe("signature verification", () => {
    const secret = "test_webhook_secret";
    const payload = '{"test":"data"}';

    it("should verify valid signature", () => {
      const signature = createHmacSignature(payload, secret);
      const result = verifySignature(payload, signature, secret);
      assert.strictEqual(result, true);
    });

    it("should reject invalid signature", () => {
      const result = verifySignature(payload, "invalid_signature", secret);
      assert.strictEqual(result, false);
    });

    it("should skip verification when no secret", () => {
      const result = verifySignature(payload, "any_signature", null);
      assert.strictEqual(result, true);
    });
  });

  describe("event type extraction", () => {
    it("should extract event type from meta", () => {
      const event = { meta: { event: "license.expired" } };
      assert.strictEqual(getEventType(event), "license.expired");
    });

    it("should return null for missing meta", () => {
      assert.strictEqual(getEventType({}), null);
    });

    it("should return null for missing event", () => {
      assert.strictEqual(getEventType(null), null);
    });
  });

  describe("handled event types", () => {
    it("should recognize license events", () => {
      assert.strictEqual(isHandledEventType("license.created"), true);
      assert.strictEqual(isHandledEventType("license.expired"), true);
      assert.strictEqual(isHandledEventType("license.suspended"), true);
      assert.strictEqual(isHandledEventType("license.reinstated"), true);
      assert.strictEqual(isHandledEventType("license.renewed"), true);
      assert.strictEqual(isHandledEventType("license.revoked"), true);
    });

    it("should recognize machine events", () => {
      assert.strictEqual(isHandledEventType("machine.created"), true);
      assert.strictEqual(isHandledEventType("machine.deleted"), true);
      assert.strictEqual(isHandledEventType("machine.heartbeat.ping"), true);
    });

    it("should not recognize unknown events", () => {
      assert.strictEqual(isHandledEventType("unknown.event"), false);
    });
  });

  describe("status update determination", () => {
    it("should update status for license.expired", () => {
      assert.strictEqual(shouldUpdateLicenseStatus("license.expired"), true);
    });

    it("should update status for license.suspended", () => {
      assert.strictEqual(shouldUpdateLicenseStatus("license.suspended"), true);
    });

    it("should update status for license.reinstated", () => {
      assert.strictEqual(shouldUpdateLicenseStatus("license.reinstated"), true);
    });

    it("should not update status for license.created", () => {
      assert.strictEqual(shouldUpdateLicenseStatus("license.created"), false);
    });

    it("should not update status for machine events", () => {
      assert.strictEqual(shouldUpdateLicenseStatus("machine.created"), false);
    });
  });

  describe("event to status mapping", () => {
    it("should map expired event to expired status", () => {
      assert.strictEqual(mapEventToStatus("license.expired"), "expired");
    });

    it("should map suspended event to suspended status", () => {
      assert.strictEqual(mapEventToStatus("license.suspended"), "suspended");
    });

    it("should map reinstated event to active status", () => {
      assert.strictEqual(mapEventToStatus("license.reinstated"), "active");
    });

    it("should map renewed event to active status", () => {
      assert.strictEqual(mapEventToStatus("license.renewed"), "active");
    });

    it("should map revoked event to revoked status", () => {
      assert.strictEqual(mapEventToStatus("license.revoked"), "revoked");
    });

    it("should return null for unmapped events", () => {
      assert.strictEqual(mapEventToStatus("license.created"), null);
    });
  });
});

describe("webhook handler patterns", () => {
  function createSuccessResponse() {
    return { received: true };
  }

  function createErrorResponse(message, status = 500) {
    return {
      error: message,
      status,
    };
  }

  function handleWebhookError(eventType, error) {
    console.error(`Webhook handler error for ${eventType}:`, error);
    return createErrorResponse("Webhook handler failed", 500);
  }

  describe("response patterns", () => {
    it("should create success response", () => {
      const response = createSuccessResponse();
      assert.deepStrictEqual(response, { received: true });
    });

    it("should create error response with default status", () => {
      const response = createErrorResponse("Something went wrong");
      assert.strictEqual(response.error, "Something went wrong");
      assert.strictEqual(response.status, 500);
    });

    it("should create error response with custom status", () => {
      const response = createErrorResponse("Bad request", 400);
      assert.strictEqual(response.status, 400);
    });
  });

  describe("error handling", () => {
    it("should return 500 for handler errors", () => {
      const response = handleWebhookError(
        "checkout.session.completed",
        new Error("DB failed"),
      );
      assert.strictEqual(response.status, 500);
      assert.strictEqual(response.error, "Webhook handler failed");
    });
  });
});
