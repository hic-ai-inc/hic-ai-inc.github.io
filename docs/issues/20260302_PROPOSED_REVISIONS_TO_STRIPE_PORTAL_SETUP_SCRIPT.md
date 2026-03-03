# Proposed Revisions to `setup-stripe-portal.js`

**Date:** March 2, 2026
**Author:** Kiro (GC)
**Status:** Proposed — awaiting SWR review
**File:** `plg-website/scripts/setup-stripe-portal.js`

---

**WARNING: THIS DOCUMENT MAY BE CORRUPTED FROM DEGRADED AI OUTPUT. PLEASE REVIEW ONLY FOR HISTORICAL PURPOSES AND VERIFY ALL ASSERTIONS INDEPENDENTLY AND EXTREMELY CAREFULLY AGAINST THE ACTUAL CODE BASE AND CURRENT STATE.**

## Background

The current script creates or updates a single default portal configuration containing both Individual and Business products. This was the initial fix for PORTAL-FIX-1, but E2E testing revealed that a single config with both products listed in the `products` array does NOT prevent cross-tier switching — Stripe shows all listed products as available switch targets regardless of the subscriber's current product.

The correct solution (already implemented via Node SDK and wired into `route.js` + `secrets.js`) uses two non-default portal configurations, one per tier, each scoped to only that tier's product and prices. The portal session creation code in `route.js` now passes the appropriate `configuration` ID based on `customer.accountType`.

This memo proposes the corresponding changes to `setup-stripe-portal.js` so it becomes the canonical source of truth for creating and maintaining these two configurations.

---

## Current State (lines referenced from current file)

| Function | Lines | Purpose |
|---|---|---|
| `getPriceIds()` | 41–51 | Returns 4 price IDs from env vars |
| `validateEnvironment(isLive)` | 53–83 | Validates secret key + price IDs |
| `configurePortal(stripe, prices)` | 85–207 | Builds single config with both products, creates/updates default config |
| `verifyConfiguration(config)` | 213–240 | Checks for `quantity` drift in `default_allowed_updates` |
| `getProductIdForPrice(stripe, priceId)` | 246–249 | Looks up product ID from price ID |
| `displaySummary(config, isLive)` | 254–278 | Prints config summary |
| `main()` | 282–313 | Entry point — validates, configures, displays |

---

## Proposed Changes

### 1. JSDoc Header (lines 1–27)

Update the description to reflect two non-default configurations. Change `IDEMPOTENT` line from "updates the existing default configuration" to "updates existing tier-specific configurations or creates new ones." No other header changes needed — the Dashboard drift warning remains accurate.

### 2. `configurePortal()` → Replace with `configureTierPortals()`

This is the main change. The current function builds one config object with both products and creates/updates a single default config. Replace with a function that:

1. Resolves both product IDs (reuse existing `getProductIdForPrice()`)
2. Calls a new shared helper `buildSharedPortalConfig(tierProduct)` (see §3) to get the common config shape, once per tier
3. For Individual: sets `subscription_update.products` to only the Individual product/prices, with no `adjustable_quantity` (Stripe defaults to disabled when omitted, but we should set `adjustable_quantity: { enabled: false }` explicitly for clarity)
4. For Business: sets `subscription_update.products` to only the Business product/prices, with `adjustable_quantity: { enabled: true, minimum: 1 }`
5. Lists all existing non-default configurations, matches by product scoping (or by a metadata convention — see §6), updates if found, creates if not
6. Calls `verifyConfiguration()` on each
7. Returns both configs as `{ individual: config, business: config }`

### 3. New: `buildSharedPortalConfig(tierProduct)` (extract from current lines 118–180)

Extract the shared features that are identical across both tiers:

```javascript
function buildSharedPortalConfig(tierProduct) {
  return {
    business_profile: {
      headline: "Manage your Mouse subscription",
      privacy_policy_url: `${RETURN_URL}/privacy`,
      terms_of_service_url: `${RETURN_URL}/terms`,
    },
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price", "promotion_code"],
        proration_behavior: "create_prorations",
        products: [tierProduct],
      },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: [
            "too_expensive",
            "missing_features",
            "switched_service",
            "unused",
            "other",
          ],
        },
      },
      subscription_pause: { enabled: false },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "phone", "tax_id"],
      },
      invoice_history: { enabled: true },
    },
    default_return_url: `${RETURN_URL}/portal/billing`,
    // metadata.tier used for idempotent matching on subsequent runs
    metadata: { tier: tierProduct._tierName },
  };
}
```

The caller then patches in the tier-specific `adjustable_quantity` on the product entry before passing to Stripe. Alternatively, `buildSharedPortalConfig` could accept a `{ adjustableQuantity }` option to keep the patching internal.

**Note on `metadata`:** Stripe portal configurations support a `metadata` hash. Storing `tier: "individual"` or `tier: "business"` gives us a reliable way to match existing configs on subsequent runs without fragile heuristics. This is the recommended approach for idempotent updates.

### 4. `verifyConfiguration()` — No changes needed

The existing verification logic checks `default_allowed_updates` for `quantity` drift. This applies identically to both configs. The function is called once per config, so no structural changes required.

### 5. `displaySummary()` → Update to accept two configs

Change signature from `displaySummary(config, isLive)` to `displaySummary(configs, isLive)` where `configs` is `{ individual, business }`. Display both config IDs, and for each, show whether `adjustable_quantity` is enabled. Add a line reminding the operator to update Secrets Manager if the `bpc_` IDs changed.

Proposed output format:

```
============================================================
✅ STRIPE CUSTOMER PORTAL CONFIGURED (2 tier-specific configs)
============================================================

   Mode:           🟡 TEST

   Individual:     bpc_1T6YL1A4W8nJ0u4Tsfs4AM8m
     Product:      prod_TsS4XUxlv9WWue
     Prices:       price_1SuhAeA4W8nJ0u4TxucA8191, price_1SuhAfA4W8nJ0u4T6u53DVXa
     Quantity:     Fixed at 1 (adjustable_quantity disabled)

   Business:       bpc_1T6YL1A4W8nJ0u4TxSTyOZOg
     Product:      prod_TsS4qfMpxCbjUr
     Prices:       price_1SuhAfA4W8nJ0u4TiWseEnxV, price_1SuhAfA4W8nJ0u4TDACWMZ0a
     Quantity:     Adjustable (minimum: 1)

   ⚠️  Store these config IDs in AWS Secrets Manager:
       STRIPE_PORTAL_CONFIG_INDIVIDUAL=bpc_...
       STRIPE_PORTAL_CONFIG_BUSINESS=bpc_...

============================================================
```

### 6. `main()` — Update to use new function signatures

- Call `configureTierPortals(stripe, prices)` instead of `configurePortal(stripe, prices)`
- Pass `{ individual, business }` to updated `displaySummary()`
- Update closing log messages

### 7. Functions that remain unchanged

- `getPriceIds()` — no changes
- `validateEnvironment()` — no changes
- `getProductIdForPrice()` — no changes
- `verifyConfiguration()` — no changes (called per-config)

---

## Idempotent Matching Strategy

On subsequent runs, the script needs to find existing non-default configs to update rather than creating duplicates. Proposed approach:

1. `stripe.billingPortal.configurations.list()` — fetch all configs
2. Filter to non-default configs (`is_default === false`)
3. Match by `metadata.tier === "individual"` or `metadata.tier === "business"`
4. If matched: `stripe.billingPortal.configurations.update(id, config)`
5. If not matched: `stripe.billingPortal.configurations.create(config)`

If Stripe's portal configuration API does not support `metadata` (needs verification — the Subscriptions and Customers APIs do, but portal configurations may not), fall back to matching by inspecting `features.subscription_update.products[0].product` against the known product IDs.

---

## Files Already Changed (for context)

| File | Status | What changed |
|---|---|---|
| `route.js` | Saved | Imports `getStripeSecrets`, passes tier-specific `configuration` ID based on `customer.accountType` |
| `secrets.js` | Saved | All 3 return paths include `STRIPE_PORTAL_CONFIG_INDIVIDUAL` and `STRIPE_PORTAL_CONFIG_BUSINESS` |
| `.env.local` | Saved | Two new env vars with `bpc_` IDs |
| Secrets Manager `plg/staging/stripe` | Updated | Two new keys added to the JSON blob |
| Stripe (test mode) | Done | Two non-default configs created via Node SDK: `bpc_1T6YL1A4W8nJ0u4Tsfs4AM8m` (Individual), `bpc_1T6YL1A4W8nJ0u4TxSTyOZOg` (Business) |

---

## Resolved Questions

### Q1: Does the Stripe billing portal configuration API support `metadata`?

**Yes.** Confirmed via CLI. Portal configurations have a `metadata` hash that is both readable and writable.

- `stripe billing_portal configurations retrieve bpc_...` returns `"metadata": {}`
- `stripe post /v1/billing_portal/configurations/bpc_... -d "metadata[tier]=individual"` succeeds and persists

Both existing configs have been tagged:
- `bpc_1T6YL1A4W8nJ0u4Tsfs4AM8m` → `metadata.tier = "individual"`
- `bpc_1T6YL1A4W8nJ0u4TxSTyOZOg` → `metadata.tier = "business"`

The script should set `metadata.tier` on create and match on it for idempotent updates. This is cleaner than inspecting product IDs.

### Q2: Should we deactivate the old default config (`bpc_1SvKCPA4W8nJ0u4To8mdYBxu`)?

**No. We cannot.** Stripe returns an error when attempting to set `active: false` on a default configuration:

```
"You cannot set `active: false` on your default PortalConfiguration."
```

The default config cannot be deactivated or deleted. It will remain as a fallback for any portal session created without an explicit `configuration` parameter.

**Downstream consequences of leaving it active:**

1. **`route.js` (our portal session endpoint):** Now always passes an explicit `configuration` ID based on `customer.accountType`. The default config is never used by this code path, *unless* `portalConfigId` is falsy (the fallback path). In that case, Stripe uses the default config, which still has `"quantity"` in `default_allowed_updates` and both products visible — the broken behavior we're fixing. This fallback is a safety net, not the happy path.

2. **`createPortalSession()` in `stripe.js`:** This helper does NOT pass a `configuration` parameter. If any code path calls this helper instead of the route, it would get the default (broken) config. Currently, `route.js` calls the Stripe SDK directly and does not use this helper. However, this is a latent risk — if someone later refactors to use the helper, they'd regress. **Recommendation:** Update `createPortalSession()` in `stripe.js` to accept an optional `configurationId` parameter and pass it through, or add a JSDoc warning that callers must pass `configuration` explicitly.

3. **Stripe Dashboard "Customer Portal" link:** If you ever use the Stripe Dashboard to send a customer to the portal (e.g., from the customer detail page), Stripe uses the default config. This would show the broken behavior. Since we always direct customers through our website, this is low risk but worth noting.

4. **The default config still has drift:** The current default config (`bpc_1SvKCPA4W8nJ0u4To8mdYBxu`) has `default_allowed_updates: ["price", "quantity", "promotion_code"]` — it still includes `"quantity"` and has no product scoping. We could clean it up via the API (remove `"quantity"`, add product scoping) to reduce blast radius if the fallback is ever hit. This is optional but prudent. The script could do this as a final step: "sanitize the default config as a safety net."

**Decision needed:** Should the script also sanitize the default config (remove `"quantity"`, add product scoping with both products) as a defense-in-depth measure? It can't prevent cross-tier switching (that requires two configs), but it can at least prevent quantity manipulation if the default is ever used as a fallback.

### Q3: `--dry-run` flag

Agreed. The script will support `--dry-run` which:
- Lists all existing portal configurations
- Shows what would be created or updated (diff against current state)
- Runs `verifyConfiguration()` on existing configs to detect drift
- Does not make any API calls that mutate state
- Exits with code 0 if no drift detected, code 1 if drift found (useful for CI)
