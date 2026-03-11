/**
 * Stripe Checkout Reliability Tests
 *
 * Verifies the three changes from the License Provisioning Reliability Fix:
 * A. Webhook re-throws Keygen failure (triggers Stripe retry via 500)
 * B. Idempotency key is released on 500 (unblocks Stripe retry)
 * C. Landing page retries on transient failure
 *
 * Plus regression guards ensuring existing checkout behavior is preserved.
 *
 * Uses source-level grep for structural guarantees and extracted logic with
 * dependency injection for behavioral verification (same pattern as stripe.test.js).
 *
 * @see 20260311_LICENSE_PROVISIONING_RELIABILITY_FIX.md
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors handleCheckoutCompleted from route.js
// Dependency-injected for testability — no module mocking needed.
// ============================================================================

/**
 * Extracted core of handleCheckoutCompleted.
 * Mirrors the license creation + customer upsert + DynamoDB license record flow.
 *
 * @param {Object} session - Stripe checkout session
 * @param {Object} deps - Injected dependencies
 */
async function handleCheckoutCompleted(session, deps) {
  const {
    getCustomerByStripeId,
    getCustomerByEmail,
    resolvePlanType,
    getPolicyId,
    createLicense,
    upsertCustomer,
    createDynamoDBLicense,
    log,
  } = deps;

  const { customer, customer_email, metadata, subscription } = session;
  const plan = metadata?.plan || metadata?.planType || "individual";
  const billingCycle = metadata?.billingCycle || "monthly";
  const seats = parseInt(metadata?.seats || "1", 10);

  const planType = resolvePlanType(plan, billingCycle);
  const policyId = await getPolicyId(planType);

  const existingByStripeId = await getCustomerByStripeId(customer);
  const existingByEmail = await getCustomerByEmail(customer_email);
  const existingCustomer = existingByStripeId || existingByEmail;

  if (existingCustomer?.keygenLicenseId) {
    log.decision(
      "existing_license_found",
      "Skipping duplicate license creation",
      {
        hasExistingLicenseId: Boolean(existingCustomer.keygenLicenseId),
      },
    );
    return;
  }

  let licenseKey = null;
  let licenseId = null;

  if (policyId) {
    try {
      const license = await createLicense({
        policyId,
        name: `License for ${customer_email}`,
        email: customer_email,
        metadata: {
          email: customer_email.toLowerCase(),
          stripeCustomerId: customer,
          stripeSubscriptionId: subscription,
          plan,
          billingCycle,
          seats: String(seats),
        },
      });
      licenseKey = license.key;
      licenseId = license.id;
      log.info("keygen_license_created", "Keygen license created", {
        licenseId,
        plan,
      });
    } catch (error) {
      log.warn(
        "keygen_license_create_failed",
        "Failed to create Keygen license",
        {
          errorMessage: error?.message,
        },
      );
      throw error;
    }
  }

  if (!existingCustomer) {
    const tempUserId = `email:${customer_email.toLowerCase()}`;

    await upsertCustomer({
      userId: tempUserId,
      email: customer_email,
      stripeCustomerId: customer,
      keygenLicenseId: licenseId,
      keygenLicenseKey: licenseKey,
      accountType: plan,
      subscriptionStatus: "active",
    });

    if (licenseId && licenseKey) {
      const planName = `${plan === "business" ? "Business" : "Individual"} ${billingCycle === "annual" ? "Annual" : "Monthly"}`;
      await createDynamoDBLicense({
        keygenLicenseId: licenseId,
        userId: tempUserId,
        licenseKey,
        policyId,
        status: "active",
        email: customer_email,
        planName,
      });
    }
  }
}

// ============================================================================
// Test helpers
// ============================================================================

function createMockLog() {
  return {
    info: createSpy("log.info"),
    warn: createSpy("log.warn"),
    error: createSpy("log.error"),
    decision: createSpy("log.decision"),
  };
}

function createMockSession(overrides = {}) {
  return {
    id: "cs_test_123",
    customer: "cus_test_456",
    customer_email: "buyer@example.com",
    metadata: {
      plan: "individual",
      billingCycle: "monthly",
      seats: "1",
    },
    subscription: "sub_test_789",
    ...overrides,
  };
}

function createBaseDeps(overrides = {}) {
  return {
    getCustomerByStripeId: createSpy("getCustomerByStripeId").mockResolvedValue(
      null,
    ),
    getCustomerByEmail: createSpy("getCustomerByEmail").mockResolvedValue(null),
    resolvePlanType:
      createSpy("resolvePlanType").mockReturnValue("individualMonthly"),
    getPolicyId: createSpy("getPolicyId").mockResolvedValue("pol_im_123"),
    createLicense: createSpy("createLicense").mockResolvedValue({
      id: "lic_new_001",
      key: "key/ABCDEF1234567890",
    }),
    upsertCustomer: createSpy("upsertCustomer").mockResolvedValue(undefined),
    createDynamoDBLicense: createSpy("createDynamoDBLicense").mockResolvedValue(
      undefined,
    ),
    log: createMockLog(),
    ...overrides,
  };
}

// ============================================================================
// A. Webhook error propagation (Change A) — Assertions 1–6
// ============================================================================

describe("Change A — Webhook re-throws Keygen failure", () => {
  // Assertion 1: Source-level — catch block around createLicense must contain throw error
  it("1. handleCheckoutCompleted source: catch block around createLicense must contain 'throw error' (source-level)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../src/app/api/webhooks/stripe/route.js",
      ),
      "utf-8",
    );

    const fnStart = src.indexOf("async function handleCheckoutCompleted");
    const fnEnd = src.indexOf("\nasync function", fnStart + 1);
    const fnBody =
      fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

    // Find the catch block for keygen_license_create_failed
    const catchStart = fnBody.indexOf("keygen_license_create_failed");
    expect(catchStart).not.toBe(-1);

    // The throw must appear after the log.warn and before the closing of the catch
    const afterCatch = fnBody.slice(catchStart);
    expect(afterCatch).toMatch(/throw error/);
  });

  // Assertion 2: When createLicense throws, handleCheckoutCompleted must throw
  it("2. When createLicense throws, handleCheckoutCompleted must throw (not return normally)", async () => {
    const deps = createBaseDeps({
      createLicense: createSpy("createLicense").mockRejectedValue(
        new Error("Keygen API timeout"),
      ),
    });
    const session = createMockSession();

    let thrown = null;
    try {
      await handleCheckoutCompleted(session, deps);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).not.toBe(null);
    expect(thrown.message).toBe("Keygen API timeout");
  });

  // Assertion 3: When createLicense throws, upsertCustomer must NOT be called
  it("3. When createLicense throws, upsertCustomer must NOT be called", async () => {
    const deps = createBaseDeps({
      createLicense: createSpy("createLicense").mockRejectedValue(
        new Error("Keygen down"),
      ),
    });
    const session = createMockSession();

    try {
      await handleCheckoutCompleted(session, deps);
    } catch {
      // Expected
    }

    expect(deps.upsertCustomer.callCount).toBe(0);
  });

  // Assertion 4: When createLicense throws, createDynamoDBLicense must NOT be called
  it("4. When createLicense throws, createDynamoDBLicense must NOT be called", async () => {
    const deps = createBaseDeps({
      createLicense: createSpy("createLicense").mockRejectedValue(
        new Error("Keygen 500"),
      ),
    });
    const session = createMockSession();

    try {
      await handleCheckoutCompleted(session, deps);
    } catch {
      // Expected
    }

    expect(deps.createDynamoDBLicense.callCount).toBe(0);
  });

  // Assertion 5: When createLicense succeeds, all downstream calls execute normally (regression)
  it("5. When createLicense succeeds, all downstream calls still execute normally", async () => {
    const deps = createBaseDeps();
    const session = createMockSession();

    await handleCheckoutCompleted(session, deps);

    expect(deps.createLicense.callCount).toBe(1);
    expect(deps.upsertCustomer.callCount).toBe(1);
    expect(deps.createDynamoDBLicense.callCount).toBe(1);

    // Verify upsertCustomer was called with the licenseId from createLicense
    const upsertPayload = deps.upsertCustomer.calls[0][0];
    expect(upsertPayload.keygenLicenseId).toBe("lic_new_001");
    expect(upsertPayload.keygenLicenseKey).toBe("key/ABCDEF1234567890");
  });

  // Assertion 6: Outer webhook handler returns 500 when handleCheckoutCompleted throws (source-level)
  it("6. Outer webhook handler returns 500 when any handler throws (source-level)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../src/app/api/webhooks/stripe/route.js",
      ),
      "utf-8",
    );

    // The outer try/catch in POST() must return 500
    const outerCatch = src.indexOf("stripe_webhook_handler_failed");
    expect(outerCatch).not.toBe(-1);

    const afterOuterCatch = src.slice(outerCatch);
    expect(afterOuterCatch).toMatch(/status:\s*500/);
  });
});

// ============================================================================
// B. Idempotency key release (Change B) — Assertions 7–11
// ============================================================================

describe("Change B — Idempotency key release on 500", () => {
  // Assertion 7: releaseWebhookIdempotencyKey source uses DeleteCommand with WEBHOOK_IDEMPOTENCY# prefix
  it("7. releaseWebhookIdempotencyKey source uses DeleteCommand with WEBHOOK_IDEMPOTENCY# prefix", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../src/lib/dynamodb.js"),
      "utf-8",
    );

    const fnStart = src.indexOf("async function releaseWebhookIdempotencyKey");
    expect(fnStart).not.toBe(-1);

    const fnBody = src.slice(fnStart, src.indexOf("\nexport", fnStart + 1));
    expect(fnBody).toMatch(/DeleteCommand/);
    expect(fnBody).toMatch(/WEBHOOK_IDEMPOTENCY#/);
  });

  // Assertion 8: releaseWebhookIdempotencyKey must not throw on delete failure
  it("8. releaseWebhookIdempotencyKey must not throw on delete failure (source-level)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../src/lib/dynamodb.js"),
      "utf-8",
    );

    const fnStart = src.indexOf("async function releaseWebhookIdempotencyKey");
    const fnBody = src.slice(fnStart, src.indexOf("\nexport", fnStart + 1));

    // Must have a try/catch that swallows the error (empty catch block)
    expect(fnBody).toMatch(/try\s*\{/);
    expect(fnBody).toMatch(/\}\s*catch\s*\{/);
  });

  // Assertion 9: Outer catch block in route source calls releaseWebhookIdempotencyKey before returning 500
  it("9. Outer catch block calls releaseWebhookIdempotencyKey before returning 500 (source-level)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../src/app/api/webhooks/stripe/route.js",
      ),
      "utf-8",
    );

    // Find the outer catch block (contains "stripe_webhook_handler_failed")
    const catchMarker = src.indexOf("stripe_webhook_handler_failed");
    expect(catchMarker).not.toBe(-1);

    // releaseWebhookIdempotencyKey must appear AFTER the catch marker and BEFORE status: 500
    const afterCatch = src.slice(catchMarker);
    const releasePos = afterCatch.indexOf("releaseWebhookIdempotencyKey");
    const status500Pos = afterCatch.indexOf("status: 500");
    expect(releasePos).not.toBe(-1);
    expect(status500Pos).not.toBe(-1);
    expect(releasePos < status500Pos).toBe(true);
  });

  // Assertion 10: releaseWebhookIdempotencyKey is imported from @/lib/dynamodb
  it("10. releaseWebhookIdempotencyKey is imported from @/lib/dynamodb (source-level)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../src/app/api/webhooks/stripe/route.js",
      ),
      "utf-8",
    );

    // Find the dynamodb import block
    const dynamoImport = src.indexOf('from "@/lib/dynamodb"');
    expect(dynamoImport).not.toBe(-1);

    // releaseWebhookIdempotencyKey must appear before the dynamodb import closing
    const importBlock = src.slice(0, dynamoImport);
    expect(importBlock).toMatch(/releaseWebhookIdempotencyKey/);
  });

  // Assertion 11: releaseWebhookIdempotencyKey sends correct DeleteCommand with matching PK/SK
  it("11. releaseWebhookIdempotencyKey source contains correct PK and SK values", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../src/lib/dynamodb.js"),
      "utf-8",
    );

    const fnStart = src.indexOf("async function releaseWebhookIdempotencyKey");
    const fnBody = src.slice(fnStart, src.indexOf("\nexport", fnStart + 1));

    // PK must use the same prefix as claimWebhookIdempotencyKey
    expect(fnBody).toMatch(/PK:\s*`WEBHOOK_IDEMPOTENCY#\$\{eventId\}`/);
    expect(fnBody).toMatch(/SK:\s*"EVENT"/);
  });
});

// ============================================================================
// C. Client-side retry (Change C) — Assertions 12–14
// ============================================================================

describe("Change C — Landing page client-side retry", () => {
  // Assertion 12: welcome/complete/page.js source contains a retry loop
  it("12. welcome/complete/page.js source contains a retry loop with MAX_ATTEMPTS", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../src/app/welcome/complete/page.js"),
      "utf-8",
    );

    expect(src).toMatch(/MAX_ATTEMPTS/);
    expect(src).toMatch(/for\s*\(\s*let\s+attempt/);
  });

  // Assertion 13: 4xx responses do not trigger retry
  it("13. 4xx responses do not trigger retry — exits immediately on response.status < 500", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../src/app/welcome/complete/page.js"),
      "utf-8",
    );

    // The code must check response.status < 500 and return (not retry)
    expect(src).toMatch(/response\.status\s*<\s*500/);

    // After that check, there must be a return (exit the function)
    const guard = src.indexOf("response.status < 500");
    const afterGuard = src.slice(guard, guard + 200);
    expect(afterGuard).toMatch(/return;/);
  });

  // Assertion 14: Source contains delay between retries
  it("14. Source contains setTimeout delay between retries", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../src/app/welcome/complete/page.js"),
      "utf-8",
    );

    expect(src).toMatch(/setTimeout/);
    expect(src).toMatch(/BASE_DELAY_MS/);
  });
});

// ============================================================================
// D. Existing behavior preserved — regression guards (Assertions 15–19)
// ============================================================================

describe("Regression guards — existing checkout behavior preserved", () => {
  // Assertion 15: New customer with successful license → upsertCustomer called with correct licenseId
  it("15. New customer: upsertCustomer is called with correct licenseId on success", async () => {
    const deps = createBaseDeps();
    const session = createMockSession();

    await handleCheckoutCompleted(session, deps);

    expect(deps.upsertCustomer.callCount).toBe(1);
    const payload = deps.upsertCustomer.calls[0][0];
    expect(payload.keygenLicenseId).toBe("lic_new_001");
    expect(payload.keygenLicenseKey).toBe("key/ABCDEF1234567890");
    expect(payload.subscriptionStatus).toBe("active");
    expect(payload.accountType).toBe("individual");
  });

  // Assertion 16: New customer with successful license → createDynamoDBLicense called
  it("16. New customer: createDynamoDBLicense is called on success", async () => {
    const deps = createBaseDeps();
    const session = createMockSession();

    await handleCheckoutCompleted(session, deps);

    expect(deps.createDynamoDBLicense.callCount).toBe(1);
    const payload = deps.createDynamoDBLicense.calls[0][0];
    expect(payload.keygenLicenseId).toBe("lic_new_001");
    expect(payload.licenseKey).toBe("key/ABCDEF1234567890");
    expect(payload.status).toBe("active");
    expect(payload.email).toBe("buyer@example.com");
  });

  // Assertion 17: Existing customer with keygenLicenseId → returns without creating a new license
  it("17. Existing customer with keygenLicenseId returns without creating a new license (idempotency)", async () => {
    const deps = createBaseDeps({
      getCustomerByEmail: createSpy("getCustomerByEmail").mockResolvedValue({
        userId: "existing-user",
        email: "buyer@example.com",
        keygenLicenseId: "lic_already_exists",
      }),
    });
    const session = createMockSession();

    await handleCheckoutCompleted(session, deps);

    // createLicense should NOT have been called
    expect(deps.createLicense.callCount).toBe(0);
    expect(deps.upsertCustomer.callCount).toBe(0);
    expect(deps.createDynamoDBLicense.callCount).toBe(0);

    // Should have logged the decision
    expect(deps.log.decision.callCount).toBe(1);
    expect(deps.log.decision.calls[0][0]).toBe("existing_license_found");
  });

  // Assertion 18: claimWebhookIdempotencyKey duplicate returns 200 (source-level)
  it("18. Duplicate event returns 200 with duplicate: true (source-level)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../src/app/api/webhooks/stripe/route.js",
      ),
      "utf-8",
    );

    // After claimed === false, the handler returns 200 with duplicate: true
    expect(src).toMatch(/duplicate_event_suppressed/);
    expect(src).toMatch(/duplicate:\s*true/);

    // It must return NextResponse.json with received: true
    const suppressionBlock = src.indexOf("duplicate_event_suppressed");
    const afterSuppression = src.slice(
      suppressionBlock,
      suppressionBlock + 300,
    );
    expect(afterSuppression).toMatch(/received:\s*true/);
  });

  // Assertion 19: claimWebhookIdempotencyKey DynamoDB error still throws (source-level)
  it("19. claimWebhookIdempotencyKey DynamoDB error re-throws (not swallowed) — source-level", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../../src/lib/dynamodb.js"),
      "utf-8",
    );

    const fnStart = src.indexOf("async function claimWebhookIdempotencyKey");
    const fnEnd = src.indexOf("\nexport", fnStart + 1);
    const fnBody =
      fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

    // The catch block must re-throw non-ConditionalCheckFailedException errors
    expect(fnBody).toMatch(/ConditionalCheckFailedException/);
    expect(fnBody).toMatch(/throw error/);
  });
});
