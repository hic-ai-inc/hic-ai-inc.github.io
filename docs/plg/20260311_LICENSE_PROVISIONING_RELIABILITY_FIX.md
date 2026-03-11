# License Provisioning Reliability Fix — Minimal Changes Memo

**Date:** 2026-03-11
**Status:** Approved by SWR — awaiting implementation
**Author:** Copilot (directed by SWR)

## Problem

A customer completed Stripe checkout but license provisioning failed. Payment was collected; no license was delivered. The specific bug (SSM vs Secrets Manager) is hotfixed. Three architectural gaps remain.

## Stripe's Requirements (from docs.stripe.com/checkout/fulfillment)

1. **Webhook must return non-2xx on fulfillment failure** — Stripe retries up to 3 days with exponential backoff.
2. **Landing page should also trigger fulfillment** (already implemented).
3. **Fulfillment must be idempotent** (already implemented via `existingCustomer?.keygenLicenseId` check).

## Three Changes

### Change A: Re-throw Keygen failure in webhook (1 line)

**File:** `plg-website/src/app/api/webhooks/stripe/route.js`
**Location:** Lines 254–258 — the catch block inside `handleCheckoutCompleted` around `createLicense`

**Current code (line 255–258):**

```js
    } catch (error) {
      log.warn("keygen_license_create_failed", "Failed to create Keygen license", {
        errorMessage: error?.message,
      });
    }
```

**Change:** Add `throw error;` after the `log.warn` call, before the closing `}`.

**Why:** This catch block swallows the Keygen failure. The function continues, creates a customer record with `licenseId = null`, and returns normally. The outer handler returns 200. Stripe thinks delivery succeeded and never retries. With the re-throw, the error propagates to the outer catch (line 183) which already returns 500 — triggering Stripe's automatic retry.

**Business logic consequence (confirmed by SWR):** When Keygen license creation fails, no customer record or DynamoDB license record will be created. Everything defers to Stripe's retry. This is correct — a customer record with no license is useless.

### Change B: Release idempotency key on 500 (~19 lines across 2 files)

**File 1:** `plg-website/src/lib/dynamodb.js`
**Location:** After `claimWebhookIdempotencyKey` (ends at line 2331)

**New function (insert after line 2331):**

```js
/**
 * Release a webhook idempotency key so Stripe retries are not blocked.
 * Called when the webhook handler returns 500 (e.g. fulfillment failed).
 *
 * @param {string} eventId - Stripe event ID (e.g. "evt_1ABC...")
 */
export async function releaseWebhookIdempotencyKey(eventId) {
  try {
    await dynamodb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `WEBHOOK_IDEMPOTENCY#${eventId}`,
          SK: "EVENT",
        },
      }),
    );
  } catch {
    // Best-effort: if release fails, TTL (5 min) will expire the key anyway
  }
}
```

**Why:** `claimWebhookIdempotencyKey` has a 5-minute TTL. If the webhook claims the key, fails, and returns 500, Stripe's first retry (~10s later) hits the same key and is rejected as a duplicate. The retry is blocked for up to 5 minutes. Releasing the key on failure allows immediate retry.

**File 2:** `plg-website/src/app/api/webhooks/stripe/route.js`
**Location 1:** Import section (~line 31) — add `releaseWebhookIdempotencyKey` to the dynamodb import.
**Location 2:** Outer catch block (lines 183–197) — add release call before returning 500.

**Add in the catch block (after `log.exception`, before `log.response`):**

```js
// Release idempotency key so Stripe's retry of the same event is not blocked
try {
  await releaseWebhookIdempotencyKey(event.id);
} catch {
  // Best-effort: TTL (5 min) will expire the key anyway
}
```

### Change C: Client-side retry on landing page (~20 lines net change)

**File:** `plg-website/src/app/welcome/complete/page.js`
**Location:** Lines 67–99 — the try/catch block inside `provisionLicense()`

**Current:** Single `fetch("/api/provision-license")` call. If it fails (5xx or network error), user sees error page immediately.

**Change:** Replace the single try/catch with a for-loop (3 attempts, 2s exponential backoff). On success or 4xx → exit immediately (same as current). On 5xx or network error → retry up to MAX_ATTEMPTS. On final failure → show existing error UI.

**Why:** Per Stripe guidance, the landing page is the secondary fulfillment path. It should tolerate transient failures because the webhook may still be in-flight or retrying. One network blip shouldn't produce an error page.

**No business logic changes:** Same fetch, same headers, same body, same success handling, same error UI. Only the retry wrapper is new.

## Files NOT Changed

- `provision-license/route.js` — no changes. Its existing logic is correct.
- `keygen.js`, `stripe.js`, `cognito-admin.js`, `ses.js` — no changes.

## Proposed Test Additions

### New: `__tests__/unit/webhooks/stripe-checkout-reliability.test.js`

Source-level and extracted-logic tests for the three changes above. Uses the same dependency-injection pattern as the existing `stripe.test.js`.

**Assertions (not code):**

#### A. Webhook error propagation (Change A)

1. `handleCheckoutCompleted` source: the catch block around `createLicense` must contain `throw error` (source-level grep)
2. When `createLicense` throws, `handleCheckoutCompleted` must throw (not return normally)
3. When `createLicense` throws, `upsertCustomer` must NOT be called (no customer with null license)
4. When `createLicense` throws, `createDynamoDBLicense` must NOT be called
5. When `createLicense` succeeds, all downstream calls still execute normally (regression)
6. The outer webhook handler must return 500 when `handleCheckoutCompleted` throws

#### B. Idempotency key release (Change B)

7. `releaseWebhookIdempotencyKey` source: must use `DeleteCommand` with `WEBHOOK_IDEMPOTENCY#` prefix (source-level grep)
8. `releaseWebhookIdempotencyKey` must not throw on delete failure (swallows errors)
9. Route source: the outer catch block must call `releaseWebhookIdempotencyKey` before returning 500 (source-level grep)
10. Route source: `releaseWebhookIdempotencyKey` must be imported from `@/lib/dynamodb` (source-level grep)
11. `releaseWebhookIdempotencyKey` sends correct DynamoDB `DeleteCommand` with matching PK/SK

#### C. Client-side retry (Change C)

12. `welcome/complete/page.js` source: must contain a retry loop (`MAX_ATTEMPTS` or `attempt`) (source-level grep)
13. Source: 4xx responses must NOT trigger retry (no `response.status < 500` check needed — just must not retry)
14. Source: must contain `setTimeout` or delay between retries (source-level grep)

#### D. Existing behavior preserved (regression guards)

15. When `createLicense` succeeds and customer is new: `upsertCustomer` is called with correct `licenseId`
16. When `createLicense` succeeds and customer is new: `createDynamoDBLicense` is called
17. When existing customer already has `keygenLicenseId`: handler returns without creating a new license (idempotency)
18. `claimWebhookIdempotencyKey` duplicate returns 200 with `{ duplicate: true }` (existing behavior unchanged)
19. `claimWebhookIdempotencyKey` DynamoDB error still throws (not swallowed) — so webhook returns 500 and Stripe retries

### Additions to existing `__tests__/unit/lib/dynamodb.test.js`

20. `releaseWebhookIdempotencyKey` sends DeleteCommand to correct table with `WEBHOOK_IDEMPOTENCY#` PK and `EVENT` SK
21. `releaseWebhookIdempotencyKey` does not throw when DynamoDB delete fails
22. `releaseWebhookIdempotencyKey` does not throw when eventId is null/undefined (defensive)

### No changes to existing tests

All 2103 unit tests and 178 E2E tests must continue to pass without modification.
