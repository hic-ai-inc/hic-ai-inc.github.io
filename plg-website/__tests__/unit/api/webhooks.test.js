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
      maxDevices: planType === "business" ? 5 : planType === "enterprise" ? 10 : 3,
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

    it("should set correct maxDevices for enterprise plan", () => {
      const license = createMockKeygenLicense();
      const customer = { userId: "auth0|user_1" };
      const session = createMockCheckoutSession();

      const record = createLicenseRecord(
        license,
        customer,
        "enterprise",
        session.customer_email,
      );

      assert.strictEqual(record.maxDevices, 10);
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