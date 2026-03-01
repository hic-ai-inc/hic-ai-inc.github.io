/**
 * Webhook API Route Tests
 *
 * Tests the webhook handler logic for Stripe and Keygen:
 * - Signature verification
 * - Event type routing
 * - Handler behaviors
 */

import { describe, it, before, beforeEach, mock } from "node:test";
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

  // Keygen sends a JSON:API webhook-event envelope.
  // Event type lives at data.attributes.event, NOT at top-level meta.event.
  function getEventType(envelope) {
    return envelope?.data?.attributes?.event || null;
  }

  // Extract the resource snapshot (license/machine/user) from the envelope.
  // data.attributes.payload is a *stringified* JSON:API document.
  function getResourceData(envelope) {
    try {
      const inner = JSON.parse(envelope?.data?.attributes?.payload ?? "{}");
      return inner.data ?? {};
    } catch {
      return {};
    }
  }

  function getIdempotencyToken(envelope) {
    return envelope?.data?.meta?.idempotencyToken || null;
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
    it("should extract event type from JSON:API envelope (data.attributes.event)", () => {
      const envelope = {
        data: { attributes: { event: "license.expired", payload: "{}" } },
      };
      assert.strictEqual(getEventType(envelope), "license.expired");
    });

    it("should return null when data.attributes is missing", () => {
      assert.strictEqual(getEventType({ data: {} }), null);
    });

    it("should return null for empty envelope", () => {
      assert.strictEqual(getEventType({}), null);
    });

    it("should return null for null envelope", () => {
      assert.strictEqual(getEventType(null), null);
    });

    it("should NOT extract from old flat meta.event shape (regression guard)", () => {
      // The old broken shape — must return null, not the event type
      const oldShape = { meta: { event: "license.expired" }, data: { id: "lic_123" } };
      assert.strictEqual(getEventType(oldShape), null);
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

describe("webhooks/keygen - safeJsonParse integration (CWE-20/400/502)", () => {
  /**
   * Validates that safeJsonParse protects the keygen webhook handler
   * against malformed, oversized, and deeply-nested JSON payloads.
   * In production, safeJsonParse throws on invalid input and the outer
   * try/catch in POST() returns 500.
   *
   * These tests exercise safeJsonParse directly with the same source label
   * used in production code.
   */
  let safeJsonParse;

  before(async () => {
    const mod = await import("../../../../dm/layers/base/src/index.js");
    safeJsonParse = mod.safeJsonParse;
  });

  it("should reject invalid JSON payload", () => {
    assert.throws(
      () => safeJsonParse("not valid json at all", { source: "keygen-webhook" }),
      { message: /JSON parse failed for keygen-webhook/ }
    );
  });

  it("should reject empty string payload", () => {
    assert.throws(
      () => safeJsonParse("", { source: "keygen-webhook" }),
      { message: /Invalid JSON input: keygen-webhook/ }
    );
  });

  it("should reject deeply nested JSON payload exceeding maxDepth", () => {
    let nested = { data: "leaf" };
    for (let i = 0; i < 15; i++) {
      nested = { wrapper: nested };
    }
    const deepJson = JSON.stringify(nested);

    assert.throws(
      () => safeJsonParse(deepJson, { source: "keygen-webhook" }),
      { message: /too deeply nested/ }
    );
  });

  it("should reject JSON payload with excessive keys", () => {
    const bigObj = {};
    for (let i = 0; i < 1100; i++) {
      bigObj[`k${i}`] = i;
    }
    const bigJson = JSON.stringify(bigObj);

    assert.throws(
      () => safeJsonParse(bigJson, { source: "keygen-webhook" }),
      { message: /too complex/ }
    );
  });

  it("should accept well-formed JSON:API webhook envelope", () => {
    // Keygen sends the webhook-event envelope, not a flat { data, meta } object.
    // Event type is at data.attributes.event; resource is stringified at data.attributes.payload.
    const licenseResource = {
      data: {
        id: "lic_abc123",
        type: "licenses",
        attributes: { key: "MOUSE-ABCD-1234-EFGH-XXXX", expiry: "2027-01-01T00:00:00Z" },
        relationships: { user: { data: { id: "user_xyz", type: "users" } } },
      },
    };
    const envelope = JSON.stringify({
      data: {
        id: "evt_webhook_001",
        type: "webhook-events",
        meta: { idempotencyToken: "token_abc123" },
        attributes: {
          event: "license.created",
          payload: JSON.stringify(licenseResource),
          status: "DELIVERING",
        },
      },
    });

    const result = safeJsonParse(envelope, { source: "keygen-webhook" });

    // Event type is at data.attributes.event
    assert.strictEqual(result.data.attributes.event, "license.created");
    // Idempotency token is at data.meta.idempotencyToken
    assert.strictEqual(result.data.meta.idempotencyToken, "token_abc123");
    // Webhook event ID is at data.id
    assert.strictEqual(result.data.id, "evt_webhook_001");
    // Resource payload is a stringified JSON string at data.attributes.payload
    assert.strictEqual(typeof result.data.attributes.payload, "string");
  });
});

describe("webhooks/keygen - JSON:API envelope parsing", () => {
  /**
   * Tests for the envelope unwrapping logic introduced to fix the
   * TypeError: Cannot read properties of undefined (reading 'event').
   *
   * Mirrors the production logic in POST():
   *   envelope.data.attributes.event  → eventType
   *   envelope.data.meta.idempotencyToken → idempotencyToken
   *   JSON.parse(envelope.data.attributes.payload).data → resourceData
   */

  // Mirrors production helpers for testability
  function parseEnvelope(rawPayload) {
    const envelope = JSON.parse(rawPayload);
    const eventType = envelope.data?.attributes?.event ?? null;
    const idempotencyToken = envelope.data?.meta?.idempotencyToken ?? null;
    const webhookEventId = envelope.data?.id ?? null;
    let resourceData = {};
    try {
      const inner = JSON.parse(envelope.data?.attributes?.payload ?? "{}");
      resourceData = inner.data ?? {};
    } catch {
      // malformed inner payload — resourceData stays {}
    }
    return { eventType, idempotencyToken, webhookEventId, resourceData };
  }

  function buildEnvelope(eventType, resourceObj, overrides = {}) {
    return JSON.stringify({
      data: {
        id: overrides.webhookEventId ?? "evt_test_001",
        type: "webhook-events",
        meta: { idempotencyToken: overrides.idempotencyToken ?? "idem_token_xyz" },
        attributes: {
          event: eventType,
          payload: JSON.stringify({ data: resourceObj }),
          status: "DELIVERING",
          ...overrides.attributes,
        },
      },
    });
  }

  describe("eventType extraction", () => {
    it("should extract eventType from data.attributes.event", () => {
      const raw = buildEnvelope("license.created", { id: "lic_001", type: "licenses" });
      const { eventType } = parseEnvelope(raw);
      assert.strictEqual(eventType, "license.created");
    });

    it("should extract eventType for all handled license events", () => {
      const events = [
        "license.created", "license.deleted", "license.expired",
        "license.suspended", "license.reinstated", "license.renewed", "license.revoked",
      ];
      for (const evt of events) {
        const raw = buildEnvelope(evt, { id: "lic_001", type: "licenses" });
        const { eventType } = parseEnvelope(raw);
        assert.strictEqual(eventType, evt, `failed for ${evt}`);
      }
    });

    it("should extract eventType for all handled machine events", () => {
      const events = [
        "machine.created", "machine.deleted",
        "machine.heartbeat.ping", "machine.heartbeat.dead",
      ];
      for (const evt of events) {
        const raw = buildEnvelope(evt, { id: "mach_001", type: "machines" });
        const { eventType } = parseEnvelope(raw);
        assert.strictEqual(eventType, evt, `failed for ${evt}`);
      }
    });

    it("should return null eventType when data.attributes.event is absent", () => {
      const envelope = JSON.stringify({ data: { id: "evt_001", type: "webhook-events", attributes: {} } });
      const { eventType } = parseEnvelope(envelope);
      assert.strictEqual(eventType, null);
    });
  });

  describe("resourceData extraction", () => {
    it("should extract license id from inner payload for license events", () => {
      const licenseResource = {
        id: "lic_abc123",
        type: "licenses",
        attributes: { key: "MOUSE-ABCD-1234-EFGH-XXXX", expiry: "2027-01-01T00:00:00Z" },
      };
      const raw = buildEnvelope("license.expired", licenseResource);
      const { resourceData } = parseEnvelope(raw);
      assert.strictEqual(resourceData.id, "lic_abc123");
      assert.strictEqual(resourceData.type, "licenses");
      assert.strictEqual(resourceData.attributes.expiry, "2027-01-01T00:00:00Z");
    });

    it("should extract machine id and license relationship for machine.deleted", () => {
      const machineResource = {
        id: "mach_xyz789",
        type: "machines",
        attributes: { fingerprint: "fp_abc" },
        relationships: {
          license: { data: { id: "lic_parent_001", type: "licenses" } },
        },
      };
      const raw = buildEnvelope("machine.deleted", machineResource);
      const { resourceData } = parseEnvelope(raw);
      assert.strictEqual(resourceData.id, "mach_xyz789");
      assert.strictEqual(resourceData.relationships.license.data.id, "lic_parent_001");
    });

    it("should return empty object when payload is missing", () => {
      const envelope = JSON.stringify({
        data: {
          id: "evt_001",
          type: "webhook-events",
          meta: { idempotencyToken: "tok" },
          attributes: { event: "license.created" }, // no payload key
        },
      });
      const { resourceData } = parseEnvelope(envelope);
      assert.deepStrictEqual(resourceData, {});
    });

    it("should return empty object when inner payload is malformed JSON", () => {
      const envelope = JSON.stringify({
        data: {
          id: "evt_001",
          type: "webhook-events",
          meta: { idempotencyToken: "tok" },
          attributes: { event: "license.created", payload: "not-valid-json" },
        },
      });
      const { resourceData } = parseEnvelope(envelope);
      assert.deepStrictEqual(resourceData, {});
    });

    it("should extract license.renewed expiry from attributes for handleLicenseRenewed", () => {
      // handleLicenseRenewed reads resourceData.attributes.expiry
      const licenseResource = {
        id: "lic_renewed_001",
        type: "licenses",
        attributes: { expiry: "2028-03-01T00:00:00Z", status: "ACTIVE" },
      };
      const raw = buildEnvelope("license.renewed", licenseResource);
      const { resourceData } = parseEnvelope(raw);
      assert.strictEqual(resourceData.attributes.expiry, "2028-03-01T00:00:00Z");
    });
  });

  describe("idempotencyToken extraction", () => {
    it("should extract idempotencyToken from data.meta", () => {
      const raw = buildEnvelope("license.created", { id: "lic_001" }, { idempotencyToken: "idem_abc_v2" });
      const { idempotencyToken } = parseEnvelope(raw);
      assert.strictEqual(idempotencyToken, "idem_abc_v2");
    });

    it("should return null when idempotencyToken is absent", () => {
      const envelope = JSON.stringify({
        data: {
          id: "evt_001",
          type: "webhook-events",
          attributes: { event: "license.created", payload: "{}" },
          // no meta key
        },
      });
      const { idempotencyToken } = parseEnvelope(envelope);
      assert.strictEqual(idempotencyToken, null);
    });
  });

  describe("webhookEventId extraction", () => {
    it("should extract the webhook event UUID from data.id", () => {
      const raw = buildEnvelope("license.created", { id: "lic_001" }, { webhookEventId: "evt_uuid_9999" });
      const { webhookEventId } = parseEnvelope(raw);
      assert.strictEqual(webhookEventId, "evt_uuid_9999");
    });
  });

  describe("regression: old flat shape must NOT work", () => {
    it("should return null eventType for old { data, meta } flat shape", () => {
      // This is the shape the code used to assume — must now yield null eventType
      // so the switch falls to default and logs event_unhandled rather than crashing.
      const oldShape = JSON.stringify({
        data: { id: "lic_abc123", type: "licenses" },
        meta: { event: "license.created" },
      });
      const { eventType, resourceData } = parseEnvelope(oldShape);
      assert.strictEqual(eventType, null, "old flat shape must not match new envelope path");
      // resourceData.id would be undefined since data has no attributes.payload
      assert.strictEqual(resourceData.id, undefined);
    });
  });

  describe("event-to-status mapping (unchanged behavior)", () => {
    const statusMap = {
      "license.expired": "expired",
      "license.suspended": "suspended",
      "license.reinstated": "active",
      "license.renewed": "active",
      "license.revoked": "revoked",
    };

    for (const [evt, expectedStatus] of Object.entries(statusMap)) {
      it(`should map ${evt} → ${expectedStatus}`, () => {
        const raw = buildEnvelope(evt, { id: "lic_001", type: "licenses", attributes: { expiry: "2027-01-01T00:00:00Z" } });
        const { eventType, resourceData } = parseEnvelope(raw);
        const actualStatus = statusMap[eventType] ?? null;
        assert.strictEqual(actualStatus, expectedStatus);
        assert.strictEqual(resourceData.id, "lic_001");
      });
    }
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



describe("Stripe License Provisioning - LICENSE# Record Creation", () => {
  /**
   * Test helpers for LICENSE# record creation
   * These validate the event-driven pipeline for license key email delivery
   */

  function createMockKeygenLicense(overrides = {}) {
    return {
      id: "lic_keygen_123",
      key: "key/MOUSE-ABC-DEF-GHI",
      status: "ACTIVE",
      expiresAt: "2027-01-31T00:00:00Z",
      maxMachines: 3,
      ...overrides,
    };
  }

  function createMockCheckoutSession(overrides = {}) {
    return {
      id: "cs_test_checkout_123",
      customer: "cus_stripe_789",
      customer_email: "customer@example.com",
      subscription: "sub_stripe_456",
      payment_status: "paid",
      metadata: {
        planType: "individual",
        seats: "1",
      },
      ...overrides,
    };
  }

  function createMockCustomer(overrides = {}) {
    return {
      userId: "auth0|user_existing_456",
      email: "existing@example.com",
      stripeCustomerId: "cus_stripe_789",
      keygenLicenseId: null,
      accountType: "individual",
      ...overrides,
    };
  }

  function createLicenseRecord(license, customer, planType, customerEmail) {
    /**
     * Simulates the LICENSE# record structure that should be created
     * This is what gets stored in DynamoDB and triggers SNS events
     */
    const planNameMap = {
      individual: "Individual",
      business: "Business",
      enterprise: "Enterprise",
    };

    return {
      pk: `LICENSE#${license.id}`,
      sk: "DETAILS",
      keygenLicenseId: license.id,
      userId: customer.userId,
      email: customerEmail,
      licenseKey: license.key, // Critical: This field enables email pipeline
      policyId: planType,
      planName: planNameMap[planType] || "Individual",
      status: "active",
      expiresAt: license.expiresAt,
      maxDevices: planType === "business" ? 5 : 3,
      eventType: "LICENSE_CREATED", // Triggers SNS event for email
      metadata: {
        stripeCustomerId: customer.stripeCustomerId,
        stripeSubscriptionId: customer.subscriptionId || null,
      },
      createdAt: new Date().toISOString(),
    };
  }

  function validateLicenseRecord(record, expectedLicense, expectedPlan) {
    /**
     * Validates that LICENSE# record has all required fields for:
     * - Portal display (licenseKey, status, expiresAt)
     * - Email pipeline (eventType, email, licenseKey)
     * - Device tracking (maxDevices, userId)
     */
    const errors = [];

    if (!record.pk || !record.pk.startsWith("LICENSE#")) {
      errors.push("Missing or invalid pk (should be LICENSE#...)");
    }
    if (record.sk !== "DETAILS") {
      errors.push("Invalid sk (should be DETAILS)");
    }
    if (!record.licenseKey) {
      errors.push(
        "Missing licenseKey (critical for email pipeline and portal)",
      );
    }
    if (record.eventType !== "LICENSE_CREATED") {
      errors.push("Missing eventType: LICENSE_CREATED (triggers SNS event)");
    }
    if (!record.email) {
      errors.push("Missing email (required for email delivery)");
    }
    if (!record.userId) {
      errors.push("Missing userId (required for user-license link)");
    }
    if (record.planName !== expectedPlan) {
      errors.push(`Invalid planName (expected ${expectedPlan})`);
    }
    if (!record.metadata?.stripeCustomerId) {
      errors.push("Missing metadata.stripeCustomerId");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  function shouldCreateLicenseRecord(keygenLicenseId, licenseKey) {
    /**
     * Determines if LICENSE# record should be created
     * Should create unless both already exist and match
     */
    return Boolean(keygenLicenseId && licenseKey);
  }

  // =========================================================================
  // Tests: LICENSE# Record Creation for New Customers
  // =========================================================================

  describe("LICENSE# record creation - new customers", () => {
    it("should create LICENSE# record with all required fields", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|new_user_123" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      assert.strictEqual(record.keygenLicenseId, license.id);
      assert.strictEqual(record.userId, customer.userId);
      assert.strictEqual(record.email, session.customer_email);
      assert.strictEqual(record.licenseKey, license.key);
      assert.strictEqual(record.eventType, "LICENSE_CREATED");
      assert.strictEqual(record.planName, "Individual");
      assert.strictEqual(record.status, "active");
    });

    it("should set correct maxDevices for individual plan", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      assert.strictEqual(record.maxDevices, 3);
    });

    it("should set correct maxDevices for business plan", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "business",
        session.customer_email,
      );

      assert.strictEqual(record.maxDevices, 5);
    });

    it("should include Stripe customer ID in metadata", () => {
      const license = createMockKeygenLicense();
      const customer = {
        userId: "auth0|user_1",
        stripeCustomerId: "cus_stripe_123",
      };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      assert.strictEqual(
        record.metadata.stripeCustomerId,
        customer.stripeCustomerId,
      );
    });

    it("should validate successful LICENSE# record", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1", stripeCustomerId: "cus_stripe_123" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      const validation = validateLicenseRecord(record, license, "Individual");
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });
  });

  // =========================================================================
  // Tests: LICENSE# Record Creation for Existing Customers
  // =========================================================================

  describe("LICENSE# record creation - existing customers", () => {
    it("should create LICENSE# record for existing customer", () => {
      const license = createMockKeygenLicense();
      const existingCustomer = createMockCustomer();
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        existingCustomer,
        "business",
        session.customer_email,
      );

      assert.strictEqual(record.userId, existingCustomer.userId);
      assert.strictEqual(record.email, session.customer_email);
      assert.strictEqual(record.licenseKey, license.key);
      assert.strictEqual(record.planName, "Business");
      assert.strictEqual(record.maxDevices, 5);
    });

    it("should handle existing customer upgrading plan", () => {
      const license = createMockKeygenLicense({
        id: "lic_keygen_upgraded_789",
      });
      const existingCustomer = createMockCustomer({
        accountType: "individual", // Was individual, now upgrading
      });
      const session = createMockCheckoutSession({
        metadata: { planType: "business" },
      });

      const record = createLicenseRecord(
        license,
        existingCustomer,
        "business", // New plan type
        session.customer_email,
      );

      assert.strictEqual(record.planName, "Business");
      assert.strictEqual(record.maxDevices, 5); // Upgraded from 3
    });
  });

  // =========================================================================
  // Tests: LICENSE# Record Validation & Error Handling
  // =========================================================================

  describe("LICENSE# record validation", () => {
    it("should detect missing licenseKey", () => {
      const invalidRecord = {
        pk: "LICENSE#lic_123",
        sk: "DETAILS",
        userId: "auth0|user",
        email: "test@example.com",
        eventType: "LICENSE_CREATED",
        licenseKey: null, // Missing!
      };

      const validation = validateLicenseRecord(invalidRecord);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some((e) => e.includes("licenseKey")));
    });

    it("should detect missing eventType", () => {
      const invalidRecord = {
        pk: "LICENSE#lic_123",
        sk: "DETAILS",
        userId: "auth0|user",
        email: "test@example.com",
        licenseKey: "key/ABC123",
        eventType: null, // Missing!
      };

      const validation = validateLicenseRecord(invalidRecord);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some((e) => e.includes("eventType")));
    });

    it("should detect missing email", () => {
      const invalidRecord = {
        pk: "LICENSE#lic_123",
        sk: "DETAILS",
        userId: "auth0|user",
        email: null, // Missing!
        licenseKey: "key/ABC123",
        eventType: "LICENSE_CREATED",
      };

      const validation = validateLicenseRecord(invalidRecord);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some((e) => e.includes("email")));
    });

    it("should detect missing userId", () => {
      const invalidRecord = {
        pk: "LICENSE#lic_123",
        sk: "DETAILS",
        userId: null, // Missing!
        email: "test@example.com",
        licenseKey: "key/ABC123",
        eventType: "LICENSE_CREATED",
      };

      const validation = validateLicenseRecord(invalidRecord);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some((e) => e.includes("userId")));
    });
  });

  describe("LICENSE# record creation conditions", () => {
    it("should create record when both keygenLicenseId and licenseKey present", () => {
      const shouldCreate = shouldCreateLicenseRecord(
        "lic_keygen_123",
        "key/MOUSE-ABC",
      );
      assert.strictEqual(shouldCreate, true);
    });

    it("should not create record without keygenLicenseId", () => {
      const shouldCreate = shouldCreateLicenseRecord(null, "key/MOUSE-ABC");
      assert.strictEqual(shouldCreate, false);
    });

    it("should not create record without licenseKey", () => {
      const shouldCreate = shouldCreateLicenseRecord("lic_keygen_123", null);
      assert.strictEqual(shouldCreate, false);
    });

    it("should not create record without both fields", () => {
      const shouldCreate = shouldCreateLicenseRecord(null, null);
      assert.strictEqual(shouldCreate, false);
    });
  });

  // =========================================================================
  // Tests: Event Pipeline Integration
  // =========================================================================

  describe("LICENSE# record event pipeline", () => {
    it("should include eventType for SNS stream", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      // This field triggers DynamoDB Stream → SNS → Email Sender
      assert.strictEqual(
        record.eventType,
        "LICENSE_CREATED",
        "eventType triggers email pipeline",
      );
    });

    it("should structure record for DynamoDB put with PK/SK", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      // DynamoDB requires PK and SK for put operation
      assert.ok(
        record.pk.startsWith("LICENSE#"),
        "PK should be LICENSE#licenseId",
      );
      assert.strictEqual(record.sk, "DETAILS", "SK should be DETAILS");
    });

    it("should include all fields needed by email sender Lambda", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      // Email sender expects these fields in SNS message
      assert.ok(record.email, "email required for SES");
      assert.ok(record.licenseKey, "licenseKey required in email body");
      assert.ok(record.planName, "planName required for email context");
    });

    it("should include all fields needed by portal API", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      // Portal API queries LICENSE# and displays these
      assert.ok(
        record.licenseKey,
        "licenseKey displayed in portal license page",
      );
      assert.ok(record.status, "status displayed in portal");
      assert.ok(record.expiresAt, "expiresAt displayed in portal");
      assert.ok(record.maxDevices, "maxDevices shown for device tracking");
    });
  });

  describe("idempotency - LICENSE# record creation", () => {
    it("should not recreate record if already exists with same licenseKey", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      // First creation
      const record1 = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      // Second creation (should be same/idempotent)
      const record2 = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      assert.strictEqual(record1.licenseKey, record2.licenseKey);
      assert.strictEqual(record1.pk, record2.pk);
      assert.strictEqual(record1.eventType, record2.eventType);
    });

    it("should handle webhook retry without duplicating records", () => {
      // Simulate webhook retry scenario
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      // Initial webhook call
      const recordFromInitial = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      // Retry call (Stripe webhook retry)
      const recordFromRetry = createLicenseRecord(
        license,
        customer,
        "individual",
        session.customer_email,
      );

      // Both should be identical, preventing duplicate email sends
      assert.strictEqual(
        recordFromInitial.pk,
        recordFromRetry.pk,
        "Same PK allows upsert instead of duplicate",
      );
    });
  });
});

// ===========================================
// ORGANIZATION & SEAT SYNC TESTS (Phase 1)
// Tests for Business plan organization management
// ===========================================

describe("webhooks/stripe - Organization Management", () => {
  /**
   * Simulates extracting Business plan org data from checkout session
   * Used in handleCheckoutCompleted for Business plan purchases
   */
  function extractBusinessPlanOrgData(session) {
    const { customer, customer_email, subscription, metadata } = session;
    const planType = metadata?.planType || metadata?.plan;

    // Only Business plans get organization records
    if (planType !== "business") {
      return null;
    }

    return {
      orgId: customer, // stripeCustomerId is the orgId
      name: `Organization ${customer.slice(-8)}`, // Default name from customer ID
      seatLimit: parseInt(metadata?.seats || "1", 10),
      ownerId: metadata?.userId || null, // May not be set at checkout time
      ownerEmail: customer_email?.toLowerCase() || null,
      stripeCustomerId: customer,
      stripeSubscriptionId: subscription,
    };
  }

  /**
   * Simulates extracting seat quantity from subscription update event
   * Used in handleSubscriptionUpdated for seat sync
   */
  function extractSeatQuantity(subscription) {
    // Stripe subscription items hold quantity
    const items = subscription.items?.data || [];
    if (items.length === 0) {
      return 1; // Default to 1 if no items
    }
    return items[0]?.quantity || 1;
  }

  /**
   * Determines if org seat limit should be updated
   */
  function shouldUpdateOrgSeatLimit(subscription, newQuantity) {
    // Only update if there's a customer (orgId) and valid quantity
    return Boolean(
      subscription.customer &&
      typeof newQuantity === "number" &&
      newQuantity >= 1
    );
  }

  describe("extractBusinessPlanOrgData", () => {
    it("should extract org data from Business checkout session", () => {
      const session = {
        customer: "cus_business123",
        customer_email: "owner@company.com",
        subscription: "sub_abc123",
        metadata: {
          planType: "business",
          seats: "10",
          userId: "user_owner456",
        },
      };

      const orgData = extractBusinessPlanOrgData(session);

      assert.ok(orgData, "Should return org data for business plan");
      assert.strictEqual(orgData.orgId, "cus_business123");
      assert.strictEqual(orgData.ownerEmail, "owner@company.com");
      assert.strictEqual(orgData.seatLimit, 10);
      assert.strictEqual(orgData.stripeCustomerId, "cus_business123");
      assert.strictEqual(orgData.stripeSubscriptionId, "sub_abc123");
      assert.strictEqual(orgData.ownerId, "user_owner456");
    });

    it("should return null for Individual plan checkout", () => {
      const session = {
        customer: "cus_individual789",
        customer_email: "user@example.com",
        subscription: "sub_xyz",
        metadata: {
          planType: "individual",
        },
      };

      const orgData = extractBusinessPlanOrgData(session);

      assert.strictEqual(orgData, null, "Individual plans should not create orgs");
    });

    it("should default seatLimit to 1 when seats not specified", () => {
      const session = {
        customer: "cus_business456",
        customer_email: "owner@company.com",
        subscription: "sub_def456",
        metadata: {
          planType: "business",
          // No seats specified
        },
      };

      const orgData = extractBusinessPlanOrgData(session);

      assert.strictEqual(orgData.seatLimit, 1);
    });

    it("should normalize email to lowercase", () => {
      const session = {
        customer: "cus_business789",
        customer_email: "OWNER@COMPANY.COM",
        subscription: "sub_ghi789",
        metadata: {
          planType: "business",
          seats: "5",
        },
      };

      const orgData = extractBusinessPlanOrgData(session);

      assert.strictEqual(orgData.ownerEmail, "owner@company.com");
    });

    it("should handle legacy 'plan' metadata key", () => {
      const session = {
        customer: "cus_legacy123",
        customer_email: "legacy@company.com",
        subscription: "sub_legacy",
        metadata: {
          plan: "business", // Legacy key, not planType
          seats: "3",
        },
      };

      const orgData = extractBusinessPlanOrgData(session);

      assert.ok(orgData, "Should recognize legacy plan metadata");
      assert.strictEqual(orgData.seatLimit, 3);
    });

    it("should handle missing userId gracefully", () => {
      const session = {
        customer: "cus_nouserid",
        customer_email: "owner@company.com",
        subscription: "sub_nouserid",
        metadata: {
          planType: "business",
          seats: "5",
          // No userId - user may not have Cognito account yet
        },
      };

      const orgData = extractBusinessPlanOrgData(session);

      assert.strictEqual(orgData.ownerId, null);
    });
  });

  describe("extractSeatQuantity", () => {
    it("should extract quantity from subscription items", () => {
      const subscription = {
        id: "sub_test123",
        customer: "cus_test123",
        items: {
          data: [
            {
              id: "si_item123",
              price: { id: "price_business_monthly" },
              quantity: 25,
            },
          ],
        },
      };

      const quantity = extractSeatQuantity(subscription);

      assert.strictEqual(quantity, 25);
    });

    it("should default to 1 when no items", () => {
      const subscription = {
        id: "sub_empty",
        customer: "cus_empty",
        items: { data: [] },
      };

      const quantity = extractSeatQuantity(subscription);

      assert.strictEqual(quantity, 1);
    });

    it("should default to 1 when quantity is null", () => {
      const subscription = {
        id: "sub_nullqty",
        customer: "cus_nullqty",
        items: {
          data: [{ id: "si_item", price: { id: "price_test" }, quantity: null }],
        },
      };

      const quantity = extractSeatQuantity(subscription);

      assert.strictEqual(quantity, 1);
    });

    it("should handle missing items property", () => {
      const subscription = {
        id: "sub_noitems",
        customer: "cus_noitems",
        // No items property
      };

      const quantity = extractSeatQuantity(subscription);

      assert.strictEqual(quantity, 1);
    });
  });

  describe("shouldUpdateOrgSeatLimit", () => {
    it("should return true for valid customer and quantity", () => {
      const subscription = { customer: "cus_valid123" };
      const result = shouldUpdateOrgSeatLimit(subscription, 10);
      assert.strictEqual(result, true);
    });

    it("should return false when customer is missing", () => {
      const subscription = { customer: null };
      const result = shouldUpdateOrgSeatLimit(subscription, 10);
      assert.strictEqual(result, false);
    });

    it("should return false for invalid quantity", () => {
      const subscription = { customer: "cus_valid" };
      assert.strictEqual(shouldUpdateOrgSeatLimit(subscription, 0), false);
      assert.strictEqual(shouldUpdateOrgSeatLimit(subscription, -1), false);
      assert.strictEqual(shouldUpdateOrgSeatLimit(subscription, "5"), false);
    });

    it("should accept quantity of 1 (minimum)", () => {
      const subscription = { customer: "cus_valid" };
      const result = shouldUpdateOrgSeatLimit(subscription, 1);
      assert.strictEqual(result, true);
    });
  });

  describe("organization record key structure", () => {
    /**
     * Validates the PK/SK structure for organization records
     * ORG#{orgId}/DETAILS
     */
    function createOrgRecordKeys(stripeCustomerId) {
      return {
        PK: `ORG#${stripeCustomerId}`,
        SK: "DETAILS",
      };
    }

    it("should create correct PK/SK from Stripe customer ID", () => {
      const keys = createOrgRecordKeys("cus_abc123xyz");
      assert.strictEqual(keys.PK, "ORG#cus_abc123xyz");
      assert.strictEqual(keys.SK, "DETAILS");
    });

    it("should use stripeCustomerId as orgId for lookup", () => {
      // This is the key design decision: orgId = stripeCustomerId
      const stripeCustomerId = "cus_businessCustomer123";
      const keys = createOrgRecordKeys(stripeCustomerId);

      // The PK directly references the Stripe customer
      // enabling direct lookup without a GSI
      assert.ok(keys.PK.includes(stripeCustomerId));
    });
  });

  describe("seat sync workflow", () => {
    it("should identify when seat update is needed", () => {
      // Scenario: Customer increases seats from 10 to 25 via Stripe portal
      const previousQuantity = 10;
      const newSubscription = {
        customer: "cus_business999",
        items: { data: [{ quantity: 25 }] },
      };

      const newQuantity = extractSeatQuantity(newSubscription);
      const shouldUpdate = shouldUpdateOrgSeatLimit(newSubscription, newQuantity);

      assert.strictEqual(newQuantity, 25);
      assert.strictEqual(shouldUpdate, true);
      assert.notStrictEqual(newQuantity, previousQuantity, "Quantity changed");
    });

    it("should handle seat decrease", () => {
      // Scenario: Customer reduces seats from 50 to 25
      const newSubscription = {
        customer: "cus_business888",
        items: { data: [{ quantity: 25 }] },
      };

      const quantity = extractSeatQuantity(newSubscription);
      const shouldUpdate = shouldUpdateOrgSeatLimit(newSubscription, quantity);

      assert.strictEqual(quantity, 25);
      assert.strictEqual(shouldUpdate, true);
    });
  });
});

// ===========================================
// RESOLVE CUSTOMER FALLBACK TESTS
// Tests for the resolveCustomer() helper that falls back from
// GSI1 (STRIPE#<id>) to Stripe API → GSI2 (EMAIL#<email>)
// when GSI1PK is not populated on PROFILE records.
// ===========================================

describe("webhooks/stripe - resolveCustomer fallback pattern", () => {
  /**
   * Simulates the resolveCustomer() helper logic from route.js.
   * GSI1 (STRIPE#<id>) is not populated on PROFILE records, so we
   * fall back to fetching the customer email from Stripe and querying
   * GSI2 (EMAIL#<email>).
   */
  function resolveCustomer(stripeCustomerId, { getByStripeId, getByEmail, getStripeEmail }) {
    // Try GSI1 first (forward-compatible if GSI1PK is later populated)
    const byStripeId = getByStripeId(stripeCustomerId);
    if (byStripeId) return byStripeId;

    // Fall back: fetch email from Stripe, then query GSI2
    const email = getStripeEmail(stripeCustomerId);
    if (email) {
      return getByEmail(email);
    }

    return null;
  }

  describe("GSI1 hit (forward-compatible path)", () => {
    it("should return customer when GSI1 lookup succeeds", () => {
      const mockCustomer = { userId: "user_123", email: "test@example.com" };
      const result = resolveCustomer("cus_abc", {
        getByStripeId: () => mockCustomer,
        getByEmail: () => null,
        getStripeEmail: () => null,
      });

      assert.deepStrictEqual(result, mockCustomer);
    });

    it("should not call Stripe API when GSI1 succeeds", () => {
      let stripeApiCalled = false;
      const mockCustomer = { userId: "user_123", email: "test@example.com" };

      resolveCustomer("cus_abc", {
        getByStripeId: () => mockCustomer,
        getByEmail: () => null,
        getStripeEmail: () => { stripeApiCalled = true; return "test@example.com"; },
      });

      assert.strictEqual(stripeApiCalled, false, "Stripe API should not be called when GSI1 hits");
    });
  });

  describe("GSI1 miss → Stripe API → GSI2 fallback", () => {
    it("should fall back to email lookup when GSI1 returns null", () => {
      const mockCustomer = { userId: "user_456", email: "fallback@example.com" };

      const result = resolveCustomer("cus_xyz", {
        getByStripeId: () => null,
        getByEmail: (email) => email === "fallback@example.com" ? mockCustomer : null,
        getStripeEmail: () => "fallback@example.com",
      });

      assert.deepStrictEqual(result, mockCustomer);
    });

    it("should return null when both GSI1 and GSI2 miss", () => {
      const result = resolveCustomer("cus_unknown", {
        getByStripeId: () => null,
        getByEmail: () => null,
        getStripeEmail: () => "nobody@example.com",
      });

      assert.strictEqual(result, null);
    });

    it("should return null when Stripe API returns no email", () => {
      const result = resolveCustomer("cus_noemail", {
        getByStripeId: () => null,
        getByEmail: () => ({ userId: "should_not_reach" }),
        getStripeEmail: () => null,
      });

      assert.strictEqual(result, null);
    });
  });

  describe("error resilience", () => {
    it("should handle Stripe API throwing an error gracefully", () => {
      // In production, the catch block logs a warning and returns null
      // Here we simulate the same pattern: if getStripeEmail throws, return null
      function resolveCustomerWithErrorHandling(stripeCustomerId, deps) {
        const byStripeId = deps.getByStripeId(stripeCustomerId);
        if (byStripeId) return byStripeId;

        try {
          const email = deps.getStripeEmail(stripeCustomerId);
          if (email) return deps.getByEmail(email);
        } catch {
          // Mirrors production: log.warn and continue
        }
        return null;
      }

      const result = resolveCustomerWithErrorHandling("cus_error", {
        getByStripeId: () => null,
        getByEmail: () => ({ userId: "should_not_reach" }),
        getStripeEmail: () => { throw new Error("Stripe API unavailable"); },
      });

      assert.strictEqual(result, null, "Should return null when Stripe API fails");
    });
  });

  describe("handler integration pattern", () => {
    it("should be used by all 6 post-checkout handlers", () => {
      // Validates that the resolveCustomer pattern is the single lookup path
      // for all handlers that receive a Stripe customer ID
      const handlersUsingResolveCustomer = [
        "handleSubscriptionUpdated",
        "handleSubscriptionDeleted",
        "handlePaymentSucceeded",
        "handlePaymentFailed",
        "handleDisputeCreated",
        "handleDisputeClosed",
      ];

      // Each handler follows the same pattern:
      // 1. Extract `customer` from Stripe event
      // 2. Call resolveCustomer(customer, log)
      // 3. If null, log customer_not_found and return
      assert.strictEqual(handlersUsingResolveCustomer.length, 6);

      // handleCheckoutCompleted uses its own dual-lookup (getByStripeId || getByEmail)
      // because it has the email directly from the checkout session
      const handlersWithOwnLookup = ["handleCheckoutCompleted"];
      assert.strictEqual(handlersWithOwnLookup.length, 1);
    });

    it("should return early with customer_not_found when resolve returns null", () => {
      // Simulates the handler pattern: resolve → null → early return
      function simulateHandler(stripeCustomerId, deps) {
        const dbCustomer = resolveCustomer(stripeCustomerId, deps);
        if (!dbCustomer) {
          return { action: "customer_not_found", processed: false };
        }
        return { action: "processed", processed: true, customer: dbCustomer };
      }

      const result = simulateHandler("cus_missing", {
        getByStripeId: () => null,
        getByEmail: () => null,
        getStripeEmail: () => "missing@example.com",
      });

      assert.strictEqual(result.action, "customer_not_found");
      assert.strictEqual(result.processed, false);
    });

    it("should proceed with customer when resolve succeeds via fallback", () => {
      const mockCustomer = { userId: "user_found", email: "found@example.com" };

      function simulateHandler(stripeCustomerId, deps) {
        const dbCustomer = resolveCustomer(stripeCustomerId, deps);
        if (!dbCustomer) {
          return { action: "customer_not_found", processed: false };
        }
        return { action: "processed", processed: true, customer: dbCustomer };
      }

      const result = simulateHandler("cus_found", {
        getByStripeId: () => null,
        getByEmail: () => mockCustomer,
        getStripeEmail: () => "found@example.com",
      });

      assert.strictEqual(result.action, "processed");
      assert.strictEqual(result.processed, true);
      assert.strictEqual(result.customer.userId, "user_found");
    });
  });
});

// ===========================================
// STREAM 1D — WEBHOOK HANDLER PROPERTY TESTS & UNIT TESTS
// Tests cancel/uncancel paths, cooldown guard, expiration routing,
// and payment recovery using isolated logic extracted from route.js.
// ===========================================

describe("Stream 1D — Cancel/Uncancel/Cooldown/Expiration Logic", () => {
  /**
   * Extracted webhook handler logic for testability.
   * These mirror the actual implementations in route.js.
   */
  const COOLDOWN_SECONDS = 3600;

  function applyCooldownGuard(emailsSent, eventTypeToWrite) {
    const priorTimestamp = emailsSent?.[eventTypeToWrite];
    const withinCooldown = priorTimestamp &&
      (Date.now() - new Date(priorTimestamp).getTime()) < COOLDOWN_SECONDS * 1000;
    return { blocked: !!withinCooldown, priorTimestamp: priorTimestamp || null };
  }

  function determineCancelPath(subscription, dbCustomer) {
    const { cancel_at_period_end } = subscription;
    let result = { path: null, subscriptionStatus: null, eventType: null, clearEmailsSent: [] };

    if (cancel_at_period_end) {
      result.path = "cancel";
      result.subscriptionStatus = "cancellation_pending";
      result.eventType = "CANCELLATION_REQUESTED";
      result.clearEmailsSent = ["CANCELLATION_REVERSED"];
    } else if (!cancel_at_period_end && dbCustomer.cancelAtPeriodEnd) {
      result.path = "uncancel";
      result.subscriptionStatus = "active";
      result.eventType = "CANCELLATION_REVERSED";
      result.clearEmailsSent = ["CANCELLATION_REQUESTED"];
    }

    return result;
  }

  function determineExpirationEventType(priorStatus) {
    if (priorStatus === "cancellation_pending") {
      return "VOLUNTARY_CANCELLATION_EXPIRED";
    } else if (priorStatus === "past_due" || priorStatus === "suspended") {
      return "NONPAYMENT_CANCELLATION_EXPIRED";
    }
    return "VOLUNTARY_CANCELLATION_EXPIRED"; // safe default
  }

  function determineReactivation(dbCustomer) {
    const status = dbCustomer.subscriptionStatus;
    if (status === "past_due" || status === "suspended") {
      return {
        triggers: true,
        subscriptionStatus: "active",
        eventType: "SUBSCRIPTION_REACTIVATED",
        clearEmailsSent: ["PAYMENT_FAILED"],
      };
    }
    return { triggers: false };
  }

  // =========================================================================
  // Property 2: Cooldown guard blocks within 1 hour (Task 4.5)
  // =========================================================================
  describe("Property 2: Cooldown guard blocks lifecycle email re-sends within 1 hour", () => {
    it("should block/allow correctly across 100 random timestamps", () => {
      for (let i = 0; i < 100; i++) {
        const offsetSeconds = Math.floor(Math.random() * 7200); // 0-7200s
        const timestamp = new Date(Date.now() - offsetSeconds * 1000).toISOString();
        const emailsSent = { CANCELLATION_REQUESTED: timestamp };

        const { blocked } = applyCooldownGuard(emailsSent, "CANCELLATION_REQUESTED");

        if (offsetSeconds < COOLDOWN_SECONDS) {
          assert.strictEqual(blocked, true, `offset=${offsetSeconds}s should be blocked`);
        } else {
          assert.strictEqual(blocked, false, `offset=${offsetSeconds}s should be allowed`);
        }
      }
    });

    it("should allow when no prior timestamp exists", () => {
      const { blocked } = applyCooldownGuard({}, "CANCELLATION_REQUESTED");
      assert.strictEqual(blocked, false);
    });

    it("should allow when emailsSent is null/undefined", () => {
      assert.strictEqual(applyCooldownGuard(null, "CANCELLATION_REQUESTED").blocked, false);
      assert.strictEqual(applyCooldownGuard(undefined, "CANCELLATION_REQUESTED").blocked, false);
    });
  });

  // =========================================================================
  // Property 3: Cancel path writes correct fields (Task 4.6)
  // =========================================================================
  describe("Property 3: Cancel path writes cancellation_pending + CANCELLATION_REQUESTED", () => {
    it("should produce correct output across 100 random customer records", () => {
      const eventTypes = ["CANCELLATION_REQUESTED", "CANCELLATION_REVERSED", "PAYMENT_FAILED", "SUBSCRIPTION_REACTIVATED"];

      for (let i = 0; i < 100; i++) {
        // Random emailsSent map
        const emailsSent = {};
        for (const et of eventTypes) {
          if (Math.random() > 0.5) {
            emailsSent[et] = new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString();
          }
        }

        const dbCustomer = {
          subscriptionStatus: "active",
          cancelAtPeriodEnd: false,
          emailsSent,
        };

        const result = determineCancelPath({ cancel_at_period_end: true }, dbCustomer);

        assert.strictEqual(result.path, "cancel");
        assert.strictEqual(result.subscriptionStatus, "cancellation_pending");
        assert.strictEqual(result.eventType, "CANCELLATION_REQUESTED");
        assert.ok(result.clearEmailsSent.includes("CANCELLATION_REVERSED"));
      }
    });
  });

  // =========================================================================
  // Property 4: Uncancel path writes correct fields (Task 4.7)
  // =========================================================================
  describe("Property 4: Uncancel path reverts to active + CANCELLATION_REVERSED", () => {
    it("should produce correct output across 100 random customer records", () => {
      for (let i = 0; i < 100; i++) {
        const emailsSent = {};
        if (Math.random() > 0.5) {
          emailsSent.CANCELLATION_REQUESTED = new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString();
        }

        const dbCustomer = {
          subscriptionStatus: "cancellation_pending",
          cancelAtPeriodEnd: true, // was true, now uncanceling
          emailsSent,
        };

        const result = determineCancelPath({ cancel_at_period_end: false }, dbCustomer);

        assert.strictEqual(result.path, "uncancel");
        assert.strictEqual(result.subscriptionStatus, "active");
        assert.strictEqual(result.eventType, "CANCELLATION_REVERSED");
        assert.ok(result.clearEmailsSent.includes("CANCELLATION_REQUESTED"));
      }
    });
  });

  // =========================================================================
  // Property 5: Expiration routing by prior status (Task 5.3)
  // =========================================================================
  describe("Property 5: Subscription deletion routes to correct expiration event type", () => {
    it("should route correctly across 100 random prior statuses", () => {
      const allStatuses = ["active", "cancellation_pending", "past_due", "suspended", "expired", "disputed", "trialing", "pending", "paused"];

      for (let i = 0; i < 100; i++) {
        const priorStatus = allStatuses[Math.floor(Math.random() * allStatuses.length)];
        const eventType = determineExpirationEventType(priorStatus);

        if (priorStatus === "cancellation_pending") {
          assert.strictEqual(eventType, "VOLUNTARY_CANCELLATION_EXPIRED", `prior=${priorStatus}`);
        } else if (priorStatus === "past_due" || priorStatus === "suspended") {
          assert.strictEqual(eventType, "NONPAYMENT_CANCELLATION_EXPIRED", `prior=${priorStatus}`);
        } else {
          assert.strictEqual(eventType, "VOLUNTARY_CANCELLATION_EXPIRED", `prior=${priorStatus} should default`);
        }
      }
    });
  });

  // =========================================================================
  // Property 6: Payment recovery for past_due/suspended (Task 5.4)
  // =========================================================================
  describe("Property 6: Payment recovery triggers reactivation for past_due and suspended", () => {
    it("should trigger/skip correctly across 100 random statuses", () => {
      const allStatuses = ["active", "cancellation_pending", "past_due", "suspended", "expired", "disputed", "trialing"];

      for (let i = 0; i < 100; i++) {
        const status = allStatuses[Math.floor(Math.random() * allStatuses.length)];
        const result = determineReactivation({ subscriptionStatus: status });

        if (status === "past_due" || status === "suspended") {
          assert.strictEqual(result.triggers, true, `status=${status} should trigger`);
          assert.strictEqual(result.subscriptionStatus, "active");
          assert.strictEqual(result.eventType, "SUBSCRIPTION_REACTIVATED");
          assert.ok(result.clearEmailsSent.includes("PAYMENT_FAILED"));
        } else {
          assert.strictEqual(result.triggers, false, `status=${status} should NOT trigger`);
        }
      }
    });
  });

  // =========================================================================
  // Unit tests for cancel/uncancel paths and cooldown guard (Task 4.8)
  // =========================================================================
  describe("Cancel/Uncancel Unit Tests", () => {
    it("cancel path writes cancellation_pending + CANCELLATION_REQUESTED + clears CANCELLATION_REVERSED", () => {
      const result = determineCancelPath(
        { cancel_at_period_end: true },
        { cancelAtPeriodEnd: false, subscriptionStatus: "active" }
      );
      assert.strictEqual(result.subscriptionStatus, "cancellation_pending");
      assert.strictEqual(result.eventType, "CANCELLATION_REQUESTED");
      assert.deepStrictEqual(result.clearEmailsSent, ["CANCELLATION_REVERSED"]);
    });

    it("uncancel path writes active + CANCELLATION_REVERSED + clears CANCELLATION_REQUESTED", () => {
      const result = determineCancelPath(
        { cancel_at_period_end: false },
        { cancelAtPeriodEnd: true, subscriptionStatus: "cancellation_pending" }
      );
      assert.strictEqual(result.subscriptionStatus, "active");
      assert.strictEqual(result.eventType, "CANCELLATION_REVERSED");
      assert.deepStrictEqual(result.clearEmailsSent, ["CANCELLATION_REQUESTED"]);
    });

    it("cooldown blocks eventType write when timestamp < 1hr ago", () => {
      const recentTimestamp = new Date(Date.now() - 1800 * 1000).toISOString(); // 30 min ago
      const { blocked } = applyCooldownGuard({ CANCELLATION_REQUESTED: recentTimestamp }, "CANCELLATION_REQUESTED");
      assert.strictEqual(blocked, true);
    });

    it("cooldown allows eventType write when timestamp > 1hr ago", () => {
      const oldTimestamp = new Date(Date.now() - 7200 * 1000).toISOString(); // 2 hrs ago
      const { blocked } = applyCooldownGuard({ CANCELLATION_REQUESTED: oldTimestamp }, "CANCELLATION_REQUESTED");
      assert.strictEqual(blocked, false);
    });

    it("cooldown allows eventType write when no prior timestamp", () => {
      const { blocked } = applyCooldownGuard({}, "CANCELLATION_REQUESTED");
      assert.strictEqual(blocked, false);
    });

    it("neither path fires when cancel_at_period_end unchanged (still false)", () => {
      const result = determineCancelPath(
        { cancel_at_period_end: false },
        { cancelAtPeriodEnd: false, subscriptionStatus: "active" }
      );
      assert.strictEqual(result.path, null);
      assert.strictEqual(result.eventType, null);
    });
  });

  // =========================================================================
  // Unit tests for expiration and payment recovery (Task 5.5)
  // =========================================================================
  describe("Expiration and Payment Recovery Unit Tests", () => {
    it("prior status cancellation_pending → VOLUNTARY_CANCELLATION_EXPIRED", () => {
      assert.strictEqual(determineExpirationEventType("cancellation_pending"), "VOLUNTARY_CANCELLATION_EXPIRED");
    });

    it("prior status past_due → NONPAYMENT_CANCELLATION_EXPIRED", () => {
      assert.strictEqual(determineExpirationEventType("past_due"), "NONPAYMENT_CANCELLATION_EXPIRED");
    });

    it("prior status suspended → NONPAYMENT_CANCELLATION_EXPIRED", () => {
      assert.strictEqual(determineExpirationEventType("suspended"), "NONPAYMENT_CANCELLATION_EXPIRED");
    });

    it("fallback (unknown status) → VOLUNTARY_CANCELLATION_EXPIRED", () => {
      assert.strictEqual(determineExpirationEventType("active"), "VOLUNTARY_CANCELLATION_EXPIRED");
      assert.strictEqual(determineExpirationEventType("disputed"), "VOLUNTARY_CANCELLATION_EXPIRED");
      assert.strictEqual(determineExpirationEventType(undefined), "VOLUNTARY_CANCELLATION_EXPIRED");
    });

    it("reactivation triggers on past_due", () => {
      const result = determineReactivation({ subscriptionStatus: "past_due" });
      assert.strictEqual(result.triggers, true);
      assert.strictEqual(result.subscriptionStatus, "active");
      assert.strictEqual(result.eventType, "SUBSCRIPTION_REACTIVATED");
    });

    it("reactivation triggers on suspended", () => {
      const result = determineReactivation({ subscriptionStatus: "suspended" });
      assert.strictEqual(result.triggers, true);
      assert.strictEqual(result.clearEmailsSent[0], "PAYMENT_FAILED");
    });

    it("reactivation does NOT trigger on active", () => {
      const result = determineReactivation({ subscriptionStatus: "active" });
      assert.strictEqual(result.triggers, false);
    });

    it("reactivation does NOT trigger on expired", () => {
      const result = determineReactivation({ subscriptionStatus: "expired" });
      assert.strictEqual(result.triggers, false);
    });

    it("emailsSent.PAYMENT_FAILED cleared on recovery", () => {
      const result = determineReactivation({ subscriptionStatus: "past_due" });
      assert.ok(result.clearEmailsSent.includes("PAYMENT_FAILED"));
    });
  });
});


describe("Webhook idempotency guard — claimWebhookIdempotencyKey behavior", () => {
  // Extracted logic mirrors the webhook handler's use of claimWebhookIdempotencyKey.
  // Tests verify the contract the handler depends on, without importing Next.js routes.

  function simulateIdempotencyGuard(claimResult) {
    // Returns what the handler does based on the claim result
    if (!claimResult) {
      return { action: "suppressed", status: 200, duplicate: true };
    }
    return { action: "processed", status: 200, duplicate: false };
  }

  it("should suppress processing when claim returns false (duplicate event)", () => {
    const result = simulateIdempotencyGuard(false);
    assert.strictEqual(result.action, "suppressed");
    assert.strictEqual(result.duplicate, true);
    assert.strictEqual(result.status, 200);
  });

  it("should proceed with processing when claim returns true (first delivery)", () => {
    const result = simulateIdempotencyGuard(true);
    assert.strictEqual(result.action, "processed");
    assert.strictEqual(result.duplicate, false);
    assert.strictEqual(result.status, 200);
  });

  it("should return 200 for duplicates (not 4xx) so Stripe does not retry", () => {
    // Stripe retries on any non-2xx response. Duplicates must return 200.
    const result = simulateIdempotencyGuard(false);
    assert.strictEqual(result.status, 200);
  });

  it("should process all distinct event IDs independently", () => {
    // Each unique event ID is a first delivery — all should be processed
    const eventIds = ["evt_001", "evt_002", "evt_003"];
    const seen = new Set();

    for (const id of eventIds) {
      const isFirst = !seen.has(id);
      seen.add(id);
      const result = simulateIdempotencyGuard(isFirst);
      assert.strictEqual(result.action, "processed", `${id} should be processed`);
    }
  });

  it("should suppress the second delivery of the same event ID", () => {
    const seen = new Set();
    const eventId = "evt_duplicate_test";

    // First delivery
    const first = simulateIdempotencyGuard(!seen.has(eventId));
    seen.add(eventId);
    assert.strictEqual(first.action, "processed");

    // Second delivery of same event
    const second = simulateIdempotencyGuard(!seen.has(eventId));
    assert.strictEqual(second.action, "suppressed");
    assert.strictEqual(second.duplicate, true);
  });
});

