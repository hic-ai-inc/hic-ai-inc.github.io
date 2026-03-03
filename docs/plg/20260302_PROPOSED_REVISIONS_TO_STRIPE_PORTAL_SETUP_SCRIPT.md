# Proposed Revisions to `setup-stripe-portal.js`

**Date:** March 2, 2026  
**Author:** Kiro (Claude Sonnet 4.6)  
**Status:** Proposed — awaiting SWR review  
**File:** `plg-website/scripts/setup-stripe-portal.js`  
**Git history:** 3 commits — `922c052` (created), `3f1d61d` (minor fix), `2bc3fe2` (last modified March 2, 2026 09:39 EST)

---

## Context

This memo documents all defects, anti-patterns, and standards violations found in
`setup-stripe-portal.js` during a fresh review conducted March 2, 2026. Findings
are grouped by severity. Each entry includes the line(s) affected, the problem,
and the proposed fix. No changes have been made to any file.

The central architectural problem (items 3 and 4) is the root cause of the
launch-blocking bug: the portal currently allows cross-tier switching between
Individual and Business licenses. All other items are independent of that and can
be fixed surgically regardless of how item 3/4 is resolved.

---

## Severity 1 — Syntax Errors (script cannot run)

### Issue 1 — Unterminated string literal (line 235)

**Lines:** 235–237  
**Introduced:** commit `2bc3fe2`

`console.log("` is followed by a literal newline character before the closing
quote. JavaScript does not permit unescaped newlines inside a regular string
literal. This causes a cascade of parse errors on lines 235–237 and prevents the
script from executing at all.

**Current code:**
```js
console.log("
   ✅ Configuration verified: no drift detected");
```

**Proposed fix:**
```js
console.log("\n   ✅ Configuration verified: no drift detected");
```

**Effort:** One-line surgical fix.

---

## Severity 2 — Logic Errors

### Issue 2 — `verifyConfiguration()` is not tier-aware (line 222)

**Lines:** 222–237  
**Function:** `verifyConfiguration(config)`

The function hardcodes `expected = ["price", "promotion_code"]` and warns if
anything else appears in `default_allowed_updates`. However, the Business config
legitimately requires `"quantity"` in `default_allowed_updates` to support
multi-seat purchases. As written, a correctly-configured Business config will
always trigger the unexpected-updates warning.

Additionally, the function calls `process.exit(1)` on drift detection (line 228).
Because `verifyConfiguration()` is called from inside the `try` block in
`configurePortal()`, `process.exit` bypasses the `catch` block entirely. The
error handler never runs. The function should `throw` instead and let `main()`
handle the exit code.

**Proposed fix:**

Accept a `tier` parameter (`"individual"` or `"business"`) and derive the
expected `default_allowed_updates` from it:

```js
const EXPECTED_ALLOWED_UPDATES = {
  individual: ["price", "promotion_code"],
  business:   ["price", "quantity", "promotion_code"],
};

function verifyConfiguration(config, tier) {
  const allowedUpdates =
    config.features?.subscription_update?.default_allowed_updates || [];
  const expected = EXPECTED_ALLOWED_UPDATES[tier];

  const unexpected = allowedUpdates.filter((u) => !expected.includes(u));
  const missing    = expected.filter((u) => !allowedUpdates.includes(u));

  if (unexpected.length > 0 || missing.length > 0) {
    const msg = [
      `\n❌ DRIFT DETECTED in ${tier} config (${config.id}):`,
      unexpected.length ? `   Unexpected: ${unexpected.join(", ")}` : null,
      missing.length    ? `   Missing:    ${missing.join(", ")}` : null,
    ].filter(Boolean).join("\n");
    throw new Error(msg);
  }

  console.log(`\n   ✅ ${tier} config verified: no drift detected`);
}
```

**Effort:** Surgical — small function rewrite plus callers pass `tier`.

---

### Issue 3 — Single config with both products cannot enforce tier separation (lines 85–195)

**Lines:** 85–195  
**Function:** `configurePortal(stripe, prices)`  
**This is the root cause of the launch-blocking bug.**

The function builds `uniqueProducts` containing both the Individual and Business
products, then passes the full array to a single portal configuration. A single
Stripe portal configuration with both products listed shows all products as
available switch targets to every customer, regardless of their current
subscription. There is no way to scope a single config to one tier.

The correct approach is two separate non-default portal configurations — one
scoped to Individual prices only, one scoped to Business prices only — and
passing the appropriate config ID when creating a portal session (already
implemented in `route.js`).

The deduplication block (lines 96–104) is also unnecessary: the Individual and
Business products are always distinct, so deduplication never does anything.

**Proposed fix:**

Replace `configurePortal()` with `configureTierPortals()` that creates or updates
two separate configs:

```js
async function configureTierPortals(stripe, prices) {
  const [indivProductId, bizProductId] = await Promise.all([
    getProductIdForPrice(stripe, prices.individualMonthly),
    getProductIdForPrice(stripe, prices.businessMonthly),
  ]);

  const individualConfig = buildPortalConfig({
    product: indivProductId,
    prices: [prices.individualMonthly, prices.individualAnnual],
    allowedUpdates: EXPECTED_ALLOWED_UPDATES.individual,
  });

  const businessConfig = buildPortalConfig({
    product: bizProductId,
    prices: [prices.businessMonthly, prices.businessAnnual],
    allowedUpdates: EXPECTED_ALLOWED_UPDATES.business,
  });

  const individual = await upsertConfig(stripe, individualConfig, "individual");
  const business   = await upsertConfig(stripe, businessConfig,   "business");

  verifyConfiguration(individual, "individual");
  verifyConfiguration(business,   "business");

  return { individual, business };
}
```

Where `buildPortalConfig({ product, prices, allowedUpdates })` is a pure function
returning the Stripe API payload, and `upsertConfig()` handles the
find-by-metadata / create-or-update logic (see Issue 4).

**Effort:** Substantial rewrite of `configurePortal()`. All other functions remain
or are lightly modified.

---

### Issue 4 — Idempotency logic is wrong for a two-config model (lines 170–183)

**Lines:** 170–183  
**Inside:** `configurePortal()`

The current idempotency check calls `configurations.list({ limit: 1 })` and
updates the first result if it is the default config. With two non-default
tier-specific configs required, this logic will always find the default config and
update it — never touching the two configs that actually matter. It also uses
`limit: 1`, which means it cannot see both configs even if they exist.

**Proposed fix:**

A new `upsertConfig(stripe, configPayload, tier)` function that:

1. Lists all non-default configs (`limit: 10` is sufficient)
2. Matches by `metadata.tier === tier`
3. Updates if found, creates if not
4. Returns the saved config

```js
async function upsertConfig(stripe, configPayload, tier) {
  const existing = await stripe.billingPortal.configurations.list({ limit: 10 });
  const match = existing.data.find(
    (c) => !c.is_default && c.metadata?.tier === tier
  );

  if (match) {
    console.log(`\n   ℹ️  Updating existing ${tier} config (${match.id})...`);
    return stripe.billingPortal.configurations.update(match.id, configPayload);
  }

  console.log(`\n   ℹ️  Creating new ${tier} config...`);
  return stripe.billingPortal.configurations.create({
    ...configPayload,
    metadata: { tier },
  });
}
```

**Effort:** New function, ~15 lines. Surgical once Issue 3 is resolved.

---

## Severity 3 — Hardcoded Values

### Issue 5 — Staging URL hardcoded as fallback for `RETURN_URL` (line 36)

**Line:** 36

```js
const RETURN_URL = process.env.NEXT_PUBLIC_APP_URL || "https://staging.hic-ai.com";
```

If `NEXT_PUBLIC_APP_URL` is unset during a `--live` run, the script silently uses
the staging URL for `privacy_policy_url`, `terms_of_service_url`, and
`default_return_url`. A live portal would point customers to staging URLs.

**Proposed fix:**

Fail loudly in `validateEnvironment()` if `NEXT_PUBLIC_APP_URL` is missing, or at
minimum warn prominently when the fallback is used:

```js
const RETURN_URL = process.env.NEXT_PUBLIC_APP_URL;
// In validateEnvironment():
if (!RETURN_URL) {
  console.error("❌ Missing NEXT_PUBLIC_APP_URL — cannot build portal URLs");
  process.exit(1);
}
```

**Effort:** Surgical.

---

### Issue 6 — Stripe API version hardcoded inline (line 291)

**Line:** 291

```js
const stripe = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });
```

Should be a named constant at the top of the file alongside other configuration,
making it easy to find and update.

**Proposed fix:**

```js
const STRIPE_API_VERSION = "2024-12-18.acacia";
// ...
const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
```

**Effort:** Surgical.

---

### Issue 7 — Portal headline hardcoded inline (line 118)

**Line:** 118

`"Manage your Mouse subscription"` is buried inside `configurePortal()`. Should
be a named constant at the top of the file with the other configuration.

**Effort:** Surgical.

---

## Severity 4 — Anti-patterns and Standards Violations

### Issue 8 — CommonJS `require` instead of ES6 `import` (line 30)

**Line:** 30

```js
const Stripe = require("stripe");
```

The rest of the codebase uses ES6 `import`. This script uses CommonJS `require`,
which is inconsistent and flagged by the diagnostics tool as a hint. The script
would need either a `.mjs` extension or `"type": "module"` in scope to use `import`.
Since this is a standalone Node script under `scripts/`, the simplest fix is to
add `"type": "module"` to a local `package.json` in `scripts/`, or rename to
`.mjs`. Worth resolving for consistency but low operational risk.

**Effort:** Surgical but requires verifying the script's execution context.

---

### Issue 9 — Sequential API calls that could be parallelized (lines 91, 95)

**Lines:** 91, 95

`getProductIdForPrice()` is called twice sequentially. Each call is an independent
Stripe API round-trip. They should run in parallel:

```js
const [indivProductId, bizProductId] = await Promise.all([
  getProductIdForPrice(stripe, prices.individualMonthly),
  getProductIdForPrice(stripe, prices.businessMonthly),
]);
```

This is already reflected in the proposed `configureTierPortals()` above.

**Effort:** Surgical.

---

### Issue 10 — `displaySummary()` hardcodes feature list instead of reading config (lines 258–263)

**Lines:** 258–263

The summary always prints `✅` for all five features regardless of what the
returned config object actually contains. If a feature is disabled or the API call
partially failed, the operator sees a false-positive success summary.

**Proposed fix:**

Read feature state from the config object:

```js
const f = config.features;
console.log(`   ${f.subscription_update?.enabled ? "✅" : "❌"} Subscription Update`);
console.log(`   ${f.subscription_cancel?.enabled  ? "✅" : "❌"} Subscription Cancel`);
// etc.
```

With two configs, `displaySummary()` should also accept `{ individual, business }`
and display both, including their config IDs and a reminder to update Secrets
Manager if the IDs changed.

**Effort:** Surgical.

---

### Issue 11 — Misleading JSDoc comment on `getPriceIds()` (line 42)

**Line:** 42

The comment says "with fallbacks for staging" but the function has no fallbacks —
it returns `undefined` for any missing env var. The fallback handling is in
`validateEnvironment()`, not here.

**Proposed fix:** Change comment to "Returns price IDs from environment variables."

**Effort:** One-line surgical fix.

---

### Issue 12 — Misleading comment on `subscription_pause` (line 143)

**Line:** 143

The comment reads "Allow reactivation of cancelled subscriptions." This is
incorrect. `subscription_pause` controls whether customers can pause their
subscription, not reactivate a cancelled one. Reactivation is a separate Stripe
concept unrelated to this field.

**Proposed fix:** Change comment to "Pause is disabled — we support cancel only."

**Effort:** One-line surgical fix.

---

## Summary Table

| # | Severity | Description | Effort |
|---|----------|-------------|--------|
| 1 | Syntax error | Unterminated string literal line 235 | Surgical (1 line) |
| 2 | Logic error | `verifyConfiguration()` not tier-aware; uses `process.exit` instead of `throw` | Surgical |
| 3 | Logic error / root cause | Single config with both products cannot enforce tier separation | Substantial rewrite of `configurePortal()` |
| 4 | Logic error | Idempotency logic wrong for two-config model | New `upsertConfig()` function (~15 lines) |
| 5 | Hardcoded value | Staging URL as silent fallback for `RETURN_URL` | Surgical |
| 6 | Hardcoded value | Stripe API version inline | Surgical |
| 7 | Hardcoded value | Portal headline inline | Surgical |
| 8 | Standards violation | CommonJS `require` instead of ES6 `import` | Surgical (context-dependent) |
| 9 | Anti-pattern | Sequential API calls should be parallelized | Surgical |
| 10 | Anti-pattern | `displaySummary()` hardcodes feature state | Surgical |
| 11 | Misleading comment | `getPriceIds()` JSDoc incorrect | Surgical (1 line) |
| 12 | Misleading comment | `subscription_pause` comment incorrect | Surgical (1 line) |

Items 3 and 4 together constitute the substantial rewrite. All other items are
independent surgical fixes that can be applied in any order.
