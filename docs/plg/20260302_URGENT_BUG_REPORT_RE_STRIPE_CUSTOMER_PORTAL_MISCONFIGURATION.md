# URGENT BUG REPORT: Stripe Customer Portal `products` Array Silently Dropped on Update

**Date:** 2026-03-02
**Priority:** LAUNCH BLOCKER
**Reporter:** Simon (SWR) + Kiro (AI assistant)
**Status:** Unresolved — requesting second opinion

---

## Summary

We cannot set the `features.subscription_update.products` array on existing Stripe Billing Portal configurations via the API. The field is documented as a valid parameter on both the `create` and `update` endpoints. The API accepts our requests (HTTP 200, no errors), but the `products` array is silently dropped — it never appears in the response object, and `stripe billing_portal configurations retrieve` confirms it was not persisted.

This is a launch blocker. Without `products`, the portal cannot be scoped to a single Stripe product per tier. An Individual customer could see and switch to Business prices, and vice versa, causing inconsistent state across DynamoDB, Keygen, and Stripe.

## Architecture Context

We have two Stripe Billing Portal configurations, one per tier:

| Config | ID | Tier | Product | Prices |
|---|---|---|---|---|
| Individual | `bpc_1T6YL1A4W8nJ0u4Tsfs4AM8m` | individual | `prod_TsS4XUxlv9WWue` | `price_1SuhAeA4W8nJ0u4TxucA8191` (monthly $15), `price_1SuhAfA4W8nJ0u4T6u53DVXa` (annual $150) |
| Business | `bpc_1T6YL1A4W8nJ0u4TxSTyOZOg` | business | `prod_TsS4qfMpxCbjUr` | `price_1SuhAfA4W8nJ0u4TiWseEnxV` (monthly $35/seat), `price_1SuhAfA4W8nJ0u4TDACWMZ0a` (annual $350/seat) |

The runtime route (`src/app/api/portal/stripe-session/route.js`) already correctly reads `customer.accountType` from DynamoDB, selects the tier-specific `bpc_` config ID from AWS Secrets Manager, and passes it to `billingPortal.sessions.create()`. That code is correct and needs no changes.

The problem is that both `bpc_` configurations are missing the `products` array under `features.subscription_update`. Without `products`, Stripe shows ALL products/prices to the customer regardless of which config is used.

## What We Need Each Config to Have

**Individual** — `features.subscription_update.products`:
```json
[{
  "product": "prod_TsS4XUxlv9WWue",
  "prices": ["price_1SuhAeA4W8nJ0u4TxucA8191", "price_1SuhAfA4W8nJ0u4T6u53DVXa"],
  "adjustable_quantity": { "enabled": false }
}]
```

**Business** — `features.subscription_update.products`:
```json
[{
  "product": "prod_TsS4qfMpxCbjUr",
  "prices": ["price_1SuhAfA4W8nJ0u4TiWseEnxV", "price_1SuhAfA4W8nJ0u4TDACWMZ0a"],
  "adjustable_quantity": { "enabled": true, "minimum": 1 }
}]
```

## What the Configs Currently Have

Both configs have `subscription_update.enabled: true` with correct `default_allowed_updates`, but NO `products` array whatsoever:

```json
"subscription_update": {
  "billing_cycle_anchor": "unchanged",
  "default_allowed_updates": ["price", "promotion_code"],
  "enabled": true,
  "proration_behavior": "create_prorations",
  "schedule_at_period_end": {"conditions": []},
  "trial_update_behavior": "end_trial"
}
```

(Business config identical except `default_allowed_updates` includes `"quantity"`.)

---

## Attempts Made (All Failed)

### Attempt 1: Stripe CLI `stripe post` with `-d` nested params

```bash
MSYS_NO_PATHCONV=1 stripe post /v1/billing_portal/configurations/bpc_1T6YL1A4W8nJ0u4Tsfs4AM8m \
  -d "features[subscription_update][products][0][product]=prod_TsS4XUxlv9WWue" \
  -d "features[subscription_update][products][0][prices][0]=price_1SuhAeA4W8nJ0u4TxucA8191" \
  -d "features[subscription_update][products][0][prices][1]=price_1SuhAfA4W8nJ0u4T6u53DVXa"
```

**Result:** HTTP 200, no error. `products` not present in response. Required `MSYS_NO_PATHCONV=1` to prevent Git Bash path mangling (`/v1/...` → `C:/Program Files/Git/v1/...`).

### Attempt 2: `curl` directly against Stripe REST API

Same form-encoded `-d` params sent directly to `https://api.stripe.com/v1/billing_portal/configurations/bpc_...`.

**Result:** HTTP 200, no error. `products` not present in response.

### Attempt 3: Node.js Stripe SDK — `apiVersion: "2024-12-18.acacia"`, no `adjustable_quantity`

Wrote `plg-website/scripts/patch-portal-products.js` using Stripe Node SDK v20.x. Fetches `STRIPE_SECRET_KEY` from AWS Secrets Manager at runtime (no hardcoded credentials). Called `stripe.billingPortal.configurations.update()` with `products` array containing `product` and `prices` only (no `adjustable_quantity`).

**Result:** HTTP 200, no error. `products` not present in response.

### Attempt 4: Node.js Stripe SDK — `apiVersion: "2024-12-18.acacia"`, WITH `adjustable_quantity`

Added `adjustable_quantity: { enabled: false }` to Individual and `adjustable_quantity: { enabled: true, minimum: 1 }` to Business, since the Stripe schema docs indicate `adjustable_quantity.enabled` is required when `products` is provided.

**Result:** HTTP 200, no error. `products` not present in response.

### Attempt 5: Node.js Stripe SDK — `apiVersion: "2024-12-18.acacia"`, WITHOUT `adjustable_quantity`

Removed `adjustable_quantity` again, hypothesizing it wasn't supported in the `2024-12-18.acacia` schema.

**Result:** HTTP 200, no error. `products` not present in response.

### Attempt 6: Node.js Stripe SDK — `apiVersion: "2026-02-25.clover"`, WITH `adjustable_quantity`

Updated `apiVersion` to `"2026-02-25.clover"` (current Stripe API version as of March 2026). Restored `adjustable_quantity` on both products. The `2026-02-25.clover` docs explicitly list `features.subscription_update.products` as a valid parameter on the update endpoint, including `adjustable_quantity`.

**Result:** HTTP 200, no error. `products` STILL not present in response. Verified via `stripe billing_portal configurations retrieve`.

---

## Key Observations

1. **No errors ever returned.** Every attempt returns HTTP 200 with a valid configuration object. Stripe never rejects the `products` parameter — it silently ignores it.

2. **Other fields in the same request DO persist.** `default_allowed_updates`, `enabled`, `proration_behavior` all update correctly in the same API call that includes `products`.

3. **The `products` field is documented.** The `2026-02-25.clover` API reference explicitly lists `features.subscription_update.products` as a parameter on both `create` and `update` endpoints, with sub-fields `product` (string, required), `prices` (array of strings, required), and `adjustable_quantity` (dictionary, optional with required `enabled` boolean).

4. **The response never includes `products`.** Even on the `retrieve` endpoint, `products` is absent from `subscription_update`. It's unclear whether this is because it was never set, or because the serializer omits it.

5. **Multiple transport methods tried.** CLI (`stripe post`), raw HTTP (`curl`), and Node.js SDK all produce the same result. This rules out SDK-specific serialization bugs.

6. **API version was updated.** We tried both `2024-12-18.acacia` and `2026-02-25.clover`. Same behavior on both.

## Current State of Patch Script

File: `plg-website/scripts/patch-portal-products.js`

- Uses Stripe Node SDK with `apiVersion: "2026-02-25.clover"`
- Fetches `STRIPE_SECRET_KEY` from AWS Secrets Manager (`plg/staging/stripe`) — no hardcoded credentials
- Calls `billingPortal.configurations.update()` on both configs
- Passes `products` array with `product`, `prices`, and `adjustable_quantity`
- All other fields in the update persist correctly

## Questions for Second Opinion

1. Is `products` actually settable via `update`, or only via `create`? The docs list it on both, but the behavior suggests otherwise.
2. Is there a Stripe Dashboard-only path to set `products` that the API doesn't expose?
3. Could the installed Stripe Node SDK version (v20.x) be stripping `products` before sending the request, regardless of the `apiVersion` header?
4. Should we try creating BRAND NEW configurations with `products` included from the start, then swap the `bpc_` IDs?
5. Is there a way to inspect the actual HTTP request body being sent by the SDK to confirm `products` is included in the wire format?
6. Could this be a Stripe test-mode limitation where `products` on portal configs is only functional in live mode?

## Files

| File | Role |
|---|---|
| `plg-website/scripts/patch-portal-products.js` | Patch script (current, uses SDK + Secrets Manager) |
| `plg-website/scripts/setup-stripe-portal.js` | Full setup script (creates/updates configs) |
| `plg-website/src/app/api/portal/stripe-session/route.js` | Runtime route (correct, no changes needed) |
| `plg-website/src/lib/secrets.js` | Secrets retrieval (correct, no changes needed) |
| `plg-website/src/lib/stripe.js` | Stripe client config (apiVersion updated to clover) |

## Impact

Without this fix, the Stripe Customer Portal will display all products to all customers. An Individual subscriber could switch to a Business price (or vice versa), creating inconsistent state across:

- **Stripe** — wrong subscription/product association
- **DynamoDB** — `accountType` no longer matches subscription tier
- **Keygen** — license policy mismatch (individual policy vs business entitlements)

This is a non-negotiable launch blocker for Mouse v0.10.10.
