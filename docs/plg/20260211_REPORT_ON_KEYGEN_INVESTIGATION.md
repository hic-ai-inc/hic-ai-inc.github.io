# Report on Keygen Policy Investigation

**Date:** 2026-02-11
**Author:** GC (Copilot)
**Classification:** Internal Reference
**Parent Documents:**

- [20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md](20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md)
- [20260211_ADDENDUM_TO_MULTI_SEAT_DEVICE_MANAGEMENT_SPECIFICATION.md](20260211_ADDENDUM_TO_MULTI_SEAT_DEVICE_MANAGEMENT_SPECIFICATION.md)

---

## 1. Purpose & Motivation

During the review of the Multi-Seat Device Management specification, several questions arose about how Keygen's policy settings would interact with our planned DynamoDB-based per-user device enforcement. Incorrect assumptions about Keygen's behavior could produce subtle bugs where our enforcement layer and Keygen's enforcement layer disagree, leading to users being blocked or allowed incorrectly.

This report documents a direct investigation of the live Keygen API to obtain the actual policy configuration, compares those settings against code assumptions, and identifies critical discrepancies that must be resolved before multi-seat work begins.

---

## 2. Investigation Method

### 2.1 Credential Retrieval

Keygen credentials are stored in AWS Systems Manager (SSM) Parameter Store under the Amplify app's secrets path.

| Secret               | SSM Path                                                  | Value                                  |
| -------------------- | --------------------------------------------------------- | -------------------------------------- |
| Amplify App ID       | Hardcoded in `plg-website/src/lib/secrets.js`             | `d2yhz9h4xdd5rb`                       |
| Keygen Account ID    | Hardcoded in `plg-website/src/lib/keygen.js` L19          | `868fccd3-676d-4b9d-90ab-c86ae54419f6` |
| Product Token        | `/plg/secrets/d2yhz9h4xdd5rb/KEYGEN_PRODUCT_TOKEN`        | `prod-45fbc3...v3` (SecureString)      |
| Individual Policy ID | `/plg/secrets/d2yhz9h4xdd5rb/KEYGEN_POLICY_ID_INDIVIDUAL` | `91f1947e-0730-48f9-b19a-eb8016ae2f84` |
| Business Policy ID   | `/plg/secrets/d2yhz9h4xdd5rb/KEYGEN_POLICY_ID_BUSINESS`   | `b0bcab98-6693-4c44-ad0d-ee3dbb069aea` |

**Note:** Git Bash on Windows converts forward-slash paths via MSYS path conversion. All SSM commands required the `MSYS_NO_PATHCONV=1` prefix to prevent `/plg/secrets/...` from being mangled into a Windows path.

### 2.2 API Queries

Both policies were queried via the Keygen REST API:

```
GET /v1/accounts/{accountId}/policies/{policyId}
Authorization: Bearer {productToken}
Accept: application/vnd.api+json
```

Full JSON responses were saved and inspected for all policy attributes.

---

## 3. Complete Policy Attributes

### 3.1 Individual Policy

| Attribute                     | Value                                  |
| ----------------------------- | -------------------------------------- |
| **ID**                        | `91f1947e-0730-48f9-b19a-eb8016ae2f84` |
| **Name**                      | `Individual`                           |
| **Created**                   | 2026-01-26T19:32:51.707Z               |
| **Updated**                   | 2026-01-30T02:20:18.505Z               |
| **Product ID**                | `4abf1f35-fc54-45ab-8499-10012073ac2d` |
|                               |                                        |
| **License Settings**          |                                        |
| duration                      | `2592000` (30 days from creation)      |
| expirationStrategy            | `RESTRICT_ACCESS`                      |
| expirationBasis               | `FROM_CREATION`                        |
| renewalBasis                  | `FROM_EXPIRY`                          |
| scheme                        | `ED25519_SIGN`                         |
| encrypted                     | `false`                                |
| protected                     | `true`                                 |
|                               |                                        |
| **Machine Settings**          |                                        |
| maxMachines                   | **`2`**                                |
| strict                        | `false`                                |
| floating                      | `true`                                 |
| overageStrategy               | **`NO_OVERAGE`**                       |
| machineLeasingStrategy        | `PER_LICENSE`                          |
| machineUniquenessStrategy     | `UNIQUE_PER_LICENSE`                   |
| machineMatchingStrategy       | `MATCH_TWO`                            |
|                               |                                        |
| **Heartbeat Settings**        |                                        |
| requireHeartbeat              | `true`                                 |
| heartbeatDuration             | **`900`** (15 minutes)                 |
| heartbeatCullStrategy         | **`DEACTIVATE_DEAD`**                  |
| heartbeatResurrectionStrategy | **`NO_REVIVE`**                        |
| heartbeatBasis                | `FROM_FIRST_PING`                      |
|                               |                                        |
| **Authentication**            |                                        |
| authenticationStrategy        | `TOKEN`                                |
|                               |                                        |
| **Scope Requirements**        |                                        |
| requireProductScope           | `false`                                |
| requirePolicyScope            | `false`                                |
| requireMachineScope           | `false`                                |
| requireFingerprintScope       | `false`                                |
| requireComponentsScope        | `false`                                |
| requireUserScope              | `false`                                |
| requireChecksumScope          | `false`                                |
| requireVersionScope           | `false`                                |
|                               |                                        |
| **Unused/Null**               |                                        |
| maxProcesses                  | `null`                                 |
| maxUsers                      | `null`                                 |
| maxCores                      | `null`                                 |
| maxMemory                     | `null`                                 |
| maxDisk                       | `null`                                 |
| maxUses                       | `null`                                 |
| requireCheckIn                | `false`                                |
| checkInInterval               | `null`                                 |
| checkInIntervalCount          | `null`                                 |
| metadata                      | `{}`                                   |

### 3.2 Business Policy

| Attribute                     | Value                                  |
| ----------------------------- | -------------------------------------- |
| **ID**                        | `b0bcab98-6693-4c44-ad0d-ee3dbb069aea` |
| **Name**                      | `Business`                             |
| **Created**                   | 2026-01-26T19:38:09.037Z               |
| **Updated**                   | 2026-01-30T02:20:29.587Z               |
| **Product ID**                | `4abf1f35-fc54-45ab-8499-10012073ac2d` |
|                               |                                        |
| **License Settings**          |                                        |
| duration                      | `2592000` (30 days from creation)      |
| expirationStrategy            | `RESTRICT_ACCESS`                      |
| expirationBasis               | `FROM_CREATION`                        |
| renewalBasis                  | `FROM_EXPIRY`                          |
| scheme                        | `ED25519_SIGN`                         |
| encrypted                     | `false`                                |
| protected                     | `true`                                 |
|                               |                                        |
| **Machine Settings**          |                                        |
| maxMachines                   | **`5`**                                |
| strict                        | `false`                                |
| floating                      | `true`                                 |
| overageStrategy               | **`NO_OVERAGE`**                       |
| machineLeasingStrategy        | `PER_LICENSE`                          |
| machineUniquenessStrategy     | `UNIQUE_PER_LICENSE`                   |
| machineMatchingStrategy       | `MATCH_TWO`                            |
|                               |                                        |
| **Heartbeat Settings**        |                                        |
| requireHeartbeat              | `true`                                 |
| heartbeatDuration             | **`900`** (15 minutes)                 |
| heartbeatCullStrategy         | **`DEACTIVATE_DEAD`**                  |
| heartbeatResurrectionStrategy | **`NO_REVIVE`**                        |
| heartbeatBasis                | `FROM_FIRST_PING`                      |
|                               |                                        |
| **Authentication**            |                                        |
| authenticationStrategy        | `TOKEN`                                |
|                               |                                        |
| **All other attributes**      | Identical to Individual policy         |

### 3.3 Policies Are Structurally Identical

The two policies differ in exactly **two** attributes:

| Attribute     | Individual   | Business   |
| ------------- | ------------ | ---------- |
| `name`        | `Individual` | `Business` |
| `maxMachines` | `2`          | `5`        |

Every other setting — heartbeat, overage, leasing, security, expiration — is identical.

---

## 4. Answers to the 5 Critical Questions

These questions were formulated during the Keygen policy documentation review to determine compatibility between Keygen's enforcement and our planned DynamoDB-based per-user enforcement.

### Q1: What is `maxMachines` on the Individual and Business policies?

**Individual: 2. Business: 5.**

This is a **critical discrepancy** with the codebase. The pricing constants in `plg-website/src/lib/constants.js` define:

```javascript
PRICING: {
  INDIVIDUAL: { maxConcurrentMachines: 3 },  // Keygen says 2
  BUSINESS:   { maxConcurrentMachinesPerSeat: 5 }  // Keygen agrees: 5
}
```

The Individual plan advertises 3 concurrent machines but Keygen will hard-reject the 3rd activation because `maxMachines: 2` combined with `overageStrategy: NO_OVERAGE` means Keygen returns HTTP 422 when a 3rd machine is created. Either the constant should be updated to 2, or the Keygen policy should be updated to allow 3.

### Q2: Is `strict` enabled?

**No.** `strict: false` on both policies.

With `strict: false`, license validation continues to work even when the license has 0 machines. This is the correct setting for a floating-license model where machines come and go. If `strict` were `true`, a license with no active machines would fail validation entirely.

### Q3: What is `overageStrategy`?

**`NO_OVERAGE`** on both policies.

This means Keygen provides **hard enforcement** at the policy level: any attempt to activate a machine beyond `maxMachines` responds with HTTP 422. This is a stricter backstop than our DynamoDB soft-limit enforcement, which allows over-limit activations with advisory flags.

**Implication:** For per-seat multi-seat enforcement, Keygen's `maxMachines` is the total ceiling for the entire license (all users combined), while our DynamoDB layer will enforce per-user limits within that ceiling. The two layers must be consistent — if a Business license has 2 users with 5 machines each allowed per-seat, Keygen's `maxMachines` must be ≥10 (or dynamically updated when seats are added).

### Q4: What are the heartbeat cull and resurrection strategies?

**`heartbeatCullStrategy: DEACTIVATE_DEAD`** and **`heartbeatResurrectionStrategy: NO_REVIVE`** on both policies.

This is the **opposite** of what our code assumes. The code comments and architecture were written assuming **KEEP_DEAD + ALWAYS_REVIVE** (dead machines stay registered and can be revived with a heartbeat). The actual configuration:

- **DEACTIVATE_DEAD:** When a machine misses its heartbeat window (15 minutes), Keygen **permanently deletes** the machine record. It doesn't just mark it dead — it removes it.
- **NO_REVIVE:** A deactivated machine **cannot be revived** by sending a heartbeat. It must be freshly re-activated (a new `POST /machines` call).

Combined with `heartbeatDuration: 900` (15 minutes) and `heartbeatBasis: FROM_FIRST_PING`, this means:

1. A machine must send its first heartbeat within 15 minutes of activation
2. Every subsequent heartbeat must arrive within 15 minutes of the previous one
3. If the window is missed, the machine is permanently deleted from Keygen
4. Recovery requires full re-activation, not a heartbeat

### Q5: What is `machineLeasingStrategy`?

**`PER_LICENSE`** on both policies. Confirmed.

This means Keygen manages the machine pool at the license level — all users on a license share the `maxMachines` pool. Per-user enforcement must be handled in our application layer (DynamoDB), as the spec intends.

---

## 5. Critical Discrepancies with Codebase

### 5.1 maxMachines Mismatch (Individual: 2 vs. 3)

**Where:** `plg-website/src/lib/constants.js` → `PRICING.INDIVIDUAL.maxConcurrentMachines: 3`
**Actual:** Keygen Individual policy `maxMachines: 2`
**Effect:** A user who believes they can use 3 devices will be hard-rejected by Keygen on the 3rd activation (HTTP 422).
**Resolution required:** Either update the constant to 2 or update the Keygen policy to 3. This decision has pricing/marketing implications.

### 5.2 Heartbeat Strategy Inversion (code assumption vs. reality)

**Code assumes:** KEEP_DEAD + ALWAYS_REVIVE

- Dead machines remain registered and count against `maxMachines`
- A heartbeat from a dead machine automatically revives it
- The validate → heartbeat flow can recover from stale state

**Actual configuration:** DEACTIVATE_DEAD + NO_REVIVE

- Dead machines are permanently deleted from Keygen
- A heartbeat from a deactivated machine is rejected
- Recovery requires full machine re-activation (`POST /machines`)

**Files affected:**

- `licensing/heartbeat.js` — revival logic assumes heartbeat alone can recover a dead machine
- `licensing/commands/activate.js` — does not have a "re-activate" path
- `mouse-vscode/src/licensing/validation.js` — sees "dead" or "not found" as terminal, writes EXPIRED
- Code comments in multiple files reference "revive" semantics that don't exist

### 5.3 License Expiry Bug — Revised Root Cause

The original root cause analysis (Section 9 of the Addendum) attributed the bug to a "deadlock between startup validation and heartbeat initialization" under the assumption that a heartbeat could revive a dead machine. The actual Keygen configuration reveals a simpler and more severe problem:

**What actually happens when a user's machine is idle for >15 minutes:**

1. VS Code is closed or machine sleeps → heartbeat stops
2. After 15 minutes (`heartbeatDuration: 900`), Keygen's cull timer expires
3. Keygen **deletes** the machine (DEACTIVATE_DEAD) — it no longer exists
4. User reopens VS Code → `validate()` runs
5. Keygen responds: machine not found / not valid (it was deleted)
6. Code writes `status: EXPIRED` to `license.json`
7. Heartbeat is gated on `status === "LICENSED"` → never starts
8. Even if heartbeat did start, `NO_REVIVE` means Keygen would reject it
9. User must manually re-enter license key to trigger a fresh activation

**The fix cannot be "heartbeat-first startup"** because heartbeats cannot revive deleted machines. The fix must include **automatic re-activation** — detecting that the machine was deactivated and creating a new machine record on Keygen.

### 5.4 Heartbeat Interval Mismatch

**Code:** `licensing/constants.js` → `HEARTBEAT_INTERVAL: 600000` (10 minutes)
**Keygen:** `heartbeatDuration: 900` (15 minutes)

The code sends heartbeats every 10 minutes against a 15-minute window. This provides a 5-minute buffer, which is adequate but tight. If a heartbeat is delayed (network issues, CPU contention, VS Code throttling background tasks), the machine could be deactivated. Consider whether a more aggressive interval (e.g., 5 minutes) is warranted given the permanent consequences of missing the window.

### 5.5 Status Code Mismatch

**Server sends:** `status: "over_limit"` (in heartbeat response)
**Extension expects:** `"concurrent_limit"` in `VALID_HEARTBEAT_STATUSES` set
**Effect:** An over-limit heartbeat response is not recognized as valid, potentially causing spurious failures.

---

## 6. Implications for Multi-Seat Architecture

### 6.1 Keygen `maxMachines` Must Scale with Seats

For Business licenses under `PER_LICENSE` leasing:

- If each user is allowed 5 devices per seat
- And a Business license has N seats
- Then Keygen's `maxMachines` must be ≥ N × 5

**This means `maxMachines` must be updated via the Keygen API when seats are added or removed.** The spec does not currently account for this. It assumes DynamoDB-only enforcement, but Keygen's `NO_OVERAGE` provides a hard ceiling that will block activations if `maxMachines` is too low.

**Options:**

1. **Update `maxMachines` dynamically** when seats change (via Keygen API `PATCH /policies/{id}` or per-license override)
2. **Set `maxMachines` very high** (e.g., 100) on the Business policy and rely entirely on DynamoDB for per-user enforcement
3. **Use per-license `maxMachines` override** instead of policy-level — Keygen allows setting `maxMachines` on individual licenses, overriding the policy default

Option 3 is recommended: set `maxMachines` on each Business license to `seats × devicesPerSeat` when the license is provisioned or seats change.

### 6.2 Re-Activation Must Be Automatic and Transparent

Given DEACTIVATE_DEAD + NO_REVIVE, every time a user's machine is idle for >15 minutes, the machine is deleted from Keygen and must be re-activated. This is the normal operating condition, not an error. The extension must:

1. Detect "machine not found" or "machine deactivated" during validation
2. Automatically call the activation endpoint to create a new machine record
3. Resume heartbeat on the new machine
4. Do all of this silently — the user should not see "Expired" or be asked to re-enter their license key

This is a prerequisite for multi-seat work because per-user device tracking in DynamoDB depends on accurate machine records.

### 6.3 DynamoDB Device Records Must Handle Churn

With DEACTIVATE_DEAD, machines are routinely created and deleted. DynamoDB device records must:

- Track the current Keygen machine ID (which changes on each re-activation)
- Update rather than accumulate — don't create a new device record for each re-activation of the same physical machine
- Use the device fingerprint (stable across re-activations) as the logical identity, with the Keygen machine ID as a mutable attribute

---

## 7. Recommended Policy Changes

Before implementing multi-seat, consider whether the current Keygen policy settings are optimal:

| Setting                         | Current         | Recommended                     | Rationale                                                                                 |
| ------------------------------- | --------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `heartbeatCullStrategy`         | DEACTIVATE_DEAD | **KEEP_DEAD**                   | Avoids constant re-activation churn; dead machines count against limit but aren't deleted |
| `heartbeatResurrectionStrategy` | NO_REVIVE       | **ALWAYS_REVIVE**               | Allows seamless recovery after sleep/idle without re-activation                           |
| `maxMachines` (Individual)      | 2               | **3** (or update constant to 2) | Resolve mismatch with pricing constant                                                    |
| `heartbeatDuration`             | 900 (15 min)    | **Consider 3600 (1 hour)**      | Reduces re-activation frequency for laptop sleep scenarios                                |

**KEEP_DEAD + ALWAYS_REVIVE** would dramatically simplify the extension code:

- No re-activation logic needed
- Heartbeat alone recovers from sleep
- Machine IDs are stable (DynamoDB records don't churn)
- The "expired after idle" bug is fixed at the Keygen level

The trade-off: dead machines count against the `maxMachines` limit. A user who truly abandons a machine would consume a slot until manually deactivated. This is manageable for Individual (2-3 machines) and for Business (portal provides deactivation UI).

---

## 8. Architecture Decision: PER_LICENSE vs PER_USER Leasing Strategy

### 8.1 Context

The multi-seat spec (WS-3) proposes managing per-user device bindings in DynamoDB with Keygen enforcing only a global `maxMachines` ceiling per license (`PER_LICENSE`). An alternative approach is to use Keygen's native `PER_USER` `machineLeasingStrategy`, which would create Keygen Users for each Cognito user and let Keygen enforce per-user device limits natively.

SWR raised the valid concern that the business logic is inevitably distributed across three layers — Keygen, DynamoDB, and the Extension — regardless of approach. If Keygen is already tightly coupled with our logic, should we lean into that coupling rather than build parallel enforcement in DynamoDB?

This section evaluates both approaches, with particular attention to a planned **automation scenario** (Mouse in CI/CD pipelines) and future **enterprise scale** requirements.

### 8.2 What PER_USER Entails

Switching to `machineLeasingStrategy: PER_USER` requires:

- Every Cognito user who activates Mouse must have a **corresponding Keygen User** created and associated with the license
- Machine activations must be linked to both the license AND the Keygen User
- Keygen then enforces `maxMachines` per user natively — each user on a Business license gets their own device pool
- A **user sync layer** is needed: on first activation, look up or create a Keygen User matching the Cognito identity, then associate with the license

### 8.3 Where Enforcement Logic Lives Under Each Approach

**PER_LICENSE + DynamoDB (current spec):**

| Layer | Responsibility |
|-------|---------------|
| Keygen | License validation, heartbeat, global maxMachines ceiling |
| DynamoDB | Per-user device tracking, per-seat enforcement, customer/billing data |
| Extension | Auth, state, heartbeat interval |
| API routes | JWT verification, DynamoDB queries, enforcement decisions |

**PER_USER + Keygen Users:**

| Layer | Responsibility |
|-------|---------------|
| Keygen | License validation, heartbeat, **per-user** maxMachines enforcement, user-machine bindings |
| DynamoDB | Customer/billing data, Cognito↔Keygen user mapping, **still needed for analytics/reporting** |
| Extension | Auth, state, heartbeat interval, **Keygen User ID in activation payload** |
| API routes | JWT verification, **Cognito→Keygen user sync**, enforcement delegated to Keygen |

PER_USER doesn't eliminate DynamoDB — it moves device-counting to Keygen but adds a user sync layer (Cognito User → Keygen User, on every first activation). The total number of integration points is roughly the same; they're in different places.

### 8.4 The Automation Scenario

SWR described a planned CI/CD use case:

```
1. Spin up GitHub Actions runner
2. Install Mouse CLI
3. Activate license → creates machine on Keygen, increments device count
4. Perform task (5 minutes)
5. Deactivate Mouse / tear down runner → machine removed
6. Repeat 100x/day
```

A power user might trigger 100+ activations per day. A future "Mouse for Automation" license tier (higher cost, high churn) would need to accommodate this.

**Device lifecycle difference:** Interactive users need KEEP_DEAD + ALWAYS_REVIVE (survive laptop sleep). Automation users need DEACTIVATE_DEAD + NO_REVIVE (auto-cleanup, no zombie slots). This is naturally handled by **separate Keygen policies** per license tier, not by PER_USER vs PER_LICENSE.

**User identity in CI is ambiguous under PER_USER:**
- Is the "user" the developer who triggered the workflow?
- A shared service account (`ci-bot@company.com`)?
- The GitHub org?
- What about a team of 5 developers all triggering CI runs?

With PER_USER, you'd need to decide this upfront and create Keygen Users accordingly. If it's a shared service account, all 100 daily CI activations share one user's pool. If it's per-developer, you need to propagate the triggering developer's identity into the CI environment.

With PER_LICENSE, the question is simpler: the automation license has `maxMachines: 200` (or whatever the tier allows). All CI runs share the pool. Who triggered it is tracked in DynamoDB for analytics/billing but doesn't affect Keygen enforcement.

### 8.5 The Nag-Before-Block Requirement

SWR described a critical UX requirement: heavy usage should be *encouraged* and *monetized* — nag to upgrade, don't hard-block. This is particularly important because in automation scenarios, nag messages in Mouse response objects degrade the AI agent's downstream output quality.

The nag-before-block pattern requires:
1. Knowing the user is approaching their limit (soft limit)
2. Inserting context-appropriate messaging (interactive dialog vs. API metadata flag)
3. Not actually preventing the operation
4. Eventually hard-blocking at some higher threshold (hard limit)

**Keygen's `NO_OVERAGE` is a hard block.** It returns HTTP 422 with no negotiation. To implement nag-before-block with Keygen as the enforcer, you'd need to set Keygen's `maxMachines` at the *hard* limit and implement the *soft* limit entirely in your own code — meaning DynamoDB enforcement is still needed for the interesting cases.

Alternatively, Keygen's `ALWAYS_ALLOW` overage strategy could be used, letting the code handle all enforcement. But then Keygen isn't enforcing anything, and PER_USER buys you nothing.

### 8.6 Future Licensing Tier Flexibility

SWR described several future scenarios:
- Mouse for Automation (higher cost, high churn)
- Enterprise (many users, many devices)
- Power users within Business plans
- Add-on automation allowances

**PER_LICENSE + DynamoDB enables arbitrary rules:**
- "Automation activations are counted separately from interactive"
- "First 10 CI activations/day are free, then $X per activation"
- "Interactive devices limited to 5, automation limited to 50, but automation auto-expires in 1 hour"
- "Allow overage up to 2x, then nag, then hard-block at 3x"

None of these are expressible as Keygen policy attributes. They require application logic, which lives in API routes + DynamoDB.

**PER_USER makes these harder** because Keygen's enforcement is binary: within `maxMachines` or HTTP 422. There's no nag-before-block gradient. Keygen doesn't know whether a machine is a laptop or a CI runner — that's application-level semantics.

### 8.7 Vendor Coupling and Data Ownership

With PER_USER, Keygen becomes the source of truth for user-device bindings. Portal device management, analytics, billing calculations, and usage reporting would either:
- Query Keygen's API for every request (latency + rate limits at scale)
- Mirror the data back to DynamoDB (sync complexity; data in two places plus sync logic)

With PER_LICENSE, DynamoDB is the single source of truth for user-device bindings. Keygen only knows about machines at the license level. Portal, analytics, and billing all query DynamoDB directly — no external API dependency for read-heavy operations.

### 8.8 Scale Implications

At 100+ activations/user/day:

**Keygen API calls with PER_USER:**
- Create Keygen User (once per new user) — trivial
- Associate user with license (once) — trivial
- Create machine with user association — 100+/day per user
- Heartbeat pings — 100+ concurrent × every 10 min
- Machine deactivation (or auto-deactivate) — 100+/day per user
- Query user's machines for enforcement — 100+/day

**Keygen API calls with PER_LICENSE:**
- Create machine — 100+/day per user
- Heartbeat pings — 100+ concurrent × every 10 min
- Machine deactivation — 100+/day per user
- **Enforcement** — DynamoDB query, no Keygen API call

PER_LICENSE has fewer Keygen API calls because enforcement is local (DynamoDB). At enterprise scale with automation, this difference matters for latency, cost, and rate limiting.

### 8.9 Where PER_USER Genuinely Wins

For completeness, PER_USER is simpler in these specific cases:

- **Pure team scenario, no automation, uniform device limits:** If every user on a Business license gets exactly N devices, period, with no soft limits or nag-before-block, Keygen handles it natively. No DynamoDB device-counting code needed.
- **Portal device management:** Keygen can natively return "User X's machines" without DynamoDB. Simpler portal queries.
- **Fewer lines of DynamoDB enforcement code** in the initial implementation.

These benefits evaporate the moment you add automation (different device lifecycle), tiered enforcement (nag before block), usage-based billing (need own analytics), or custom device categories (CI vs interactive) — all of which are explicitly planned.

### 8.10 Decision: PER_LICENSE + DynamoDB

**Recommendation stands: PER_LICENSE + DynamoDB enforcement.**

The automation scenario reinforces the original recommendation. The tri-layer architecture is unavoidable, and each layer should play a narrow, well-defined role:

| Layer | Role |
|-------|------|
| **Keygen** | License validation + heartbeat + hard ceiling (safety net). Narrow role, acts as compliance engine. |
| **DynamoDB** | Per-user device tracking, per-seat enforcement, usage analytics, billing data. Business rules live here. |
| **Extension** | Auth, state, heartbeat, re-activation. Talks to our API, not directly to Keygen. |

Keygen should be a **compliance engine** (is this license valid? is this machine alive?), not a **business rules engine** (how many devices can this user have in this usage context?). Our business rules are too nuanced and evolving for Keygen's policy model.

### 8.11 Additional Recommendation: Policy-Per-Lifecycle

Based on the automation analysis, plan for **separate Keygen policies for different device lifecycles**, not just different plan tiers:

| Policy | Tier | Heartbeat Strategy | maxMachines | Use Case |
|--------|------|--------------------|-------------|----------|
| Individual | Interactive | KEEP_DEAD + ALWAYS_REVIVE | 3 | Laptop/desktop |
| Business | Interactive | KEEP_DEAD + ALWAYS_REVIVE | seats × 5 (per-license override) | Team laptops/desktops |
| Automation | High-churn | DEACTIVATE_DEAD + NO_REVIVE | 200 (configurable) | CI/CD, GitHub Actions |

This is a natural extension of the existing Individual/Business split and doesn't require PER_USER.

---
## 9. Concurrency Enforcement Decoupling Decision

### 9.1 Context

Following the initial investigation (Sections 1–8), SWR and GC worked through the concrete scenario of a Business user running Mouse on a laptop plus multiple ephemeral containers (Codespaces, CI runners). This revealed that Keygen's enforcement behavior — the interaction of `maxMachines`, `overageStrategy`, heartbeat strategies, and our DynamoDB device tracking — creates friction for good-faith developers cycling through containers within their license limits.

The core problem: a developer who closes a Codespace and opens a new one may be unable to activate Mouse because the previous container's machine record still occupies a slot on Keygen, even though the developer is acting within their concurrency allowance.

### 9.2 The Sliding-Window Concurrency Model

**Decision: "Concurrent" means devices whose most recent heartbeat falls within a 2-hour sliding window, tracked entirely in DynamoDB.**

At activation time, our activation route:

1. Queries DynamoDB for all device records on this license (and, for Business, scoped to this user)
2. Filters to devices where `lastHeartbeat > now - 2 hours`
3. That count is the concurrent device count
4. If count >= `maxDevices` for the license tier/seat, blocks with a clear message including **when the next slot frees up**

To calculate when the next slot frees: sort stale devices by `lastHeartbeat` ascending. The oldest one exits the window at `oldestLastHeartbeat + 2 hours`. That timestamp is returned to the user.

**Example walkthrough (Individual, 3 device max, 2-hour window):**

| Time | Event | Active (in window) | Outcome |
|------|-------|---------------------|---------|
| 9:00 | Activate on laptop | 1 (laptop) | OK |
| 10:00 | Activate Codespace #1 | 2 (laptop, CS1) | OK |
| 11:00 | Close CS1, open & activate CS2 | 3 (laptop, CS1, CS2) | OK — CS1 last heartbeat ~11:00, still in window |
| 12:30 | Close CS2, try to activate CS3 | 3 (laptop, CS1, CS2) | **Blocked** — CS1 falls off at 13:00 |
| 13:00 | Try again | 2 (laptop, CS2) | **OK** — CS1 has exited the 2h window |

The user message at 12:30: *"You're using 3 of 3 allowed devices. Your oldest inactive device will free up at approximately 1:00 PM. Reduce concurrent usage or wait."*

### 9.3 Why 2 Hours

The window must be:
- **Short enough** that closed containers free slots in a reasonable timeframe
- **Long enough** that a laptop user going to lunch doesn't lose their slot (while the extension continues heartbeating, so this is only an issue if the laptop is truly powered off or sleeping)

| Window | Container slot frees after | Laptop survives sleep? | Assessment |
|--------|---------------------------|------------------------|------------|
| 1 hour | ~45 min – 1h | Only short breaks | Too tight |
| **2 hours** | ~1.5h – 2h | Lunch break, yes | **Recommended** |
| 4 hours | ~3.5h – 4h | Most of workday | Too slow for container cycling |
| 24 hours | ~23h – 24h | Yes | Current — far too slow |

The value is configurable via `CONCURRENT_DEVICE_WINDOW_HOURS` environment variable (already exists in the codebase, currently defaulting to 24).

### 9.4 Decoupling Keygen from Enforcement: `ALWAYS_ALLOW_OVERAGE`

**Decision: Set `overageStrategy: ALWAYS_ALLOW_OVERAGE` on both policies. All concurrency enforcement moves to DynamoDB.**

With the current `NO_OVERAGE`, Keygen returns HTTP 422 when machine count exceeds `maxMachines`. This conflicts with the sliding-window model because Keygen counts *all* machine records (alive and dead under KEEP_DEAD, or accumulated under DEACTIVATE_DEAD), while our DynamoDB window only counts recently-active devices. The two systems would disagree about how many devices are "in use."

**What `ALWAYS_ALLOW_OVERAGE` changes:**

| Behavior | `NO_OVERAGE` (current) | `ALWAYS_ALLOW_OVERAGE` (proposed) |
|----------|------------------------|-----------------------------------|
| Machine creation (activation) | Blocked with HTTP 422 if count > `maxMachines` | **Always succeeds** |
| License validation | Returns `TOO_MANY_MACHINES` code (but `valid=true` since `strict: false`) | Returns `TOO_MANY_MACHINES` code with `valid=true` |
| `maxMachines` | Enforced on machine creation | **Decorative** — reported in responses but not enforced |

**What `ALWAYS_ALLOW_OVERAGE` does NOT change:**

- Machine identity — Keygen still tracks which machines exist, their fingerprints, alive/dead status
- Heartbeat lifecycle — machines still go dead/get culled per heartbeat strategy
- Fingerprint uniqueness — `UNIQUE_PER_LICENSE` still prevents duplicate fingerprints
- License expiration/renewal — unchanged
- License key validation — still confirms key validity, expiry, suspension status

**Critical supporting detail:** Our policies already have `strict: false`. The Keygen docs state:

> `maxMachines`: The maximum number of machines a license implementing the policy can have associated with it. **This is only enforced when the policy is strict.**

So `strict: false` already means `maxMachines` doesn't affect validation. `ALWAYS_ALLOW_OVERAGE` additionally removes it from machine creation. Together, `maxMachines` becomes purely informational metadata — useful for Keygen dashboard visibility but enforced by nothing on Keygen's side.

### 9.5 Keygen's Remaining Role

Under this configuration, Keygen becomes a **machine registry and heartbeat tracker**, not an enforcement engine:

| Keygen responsibility | Still active? | Notes |
|---|---|---|
| License key validation | **Yes** | Is this key valid, not expired, not suspended? |
| Machine identity registry | **Yes** | Which machines exist, their fingerprints, metadata |
| Heartbeat alive/dead tracking | **Yes** | Marks machines dead after `heartbeatDuration` |
| Machine culling (DEACTIVATE_DEAD or KEEP_DEAD) | **Yes** | Per heartbeat strategy decision |
| Fingerprint uniqueness | **Yes** | Same fingerprint can't create duplicate records |
| License expiration and renewal | **Yes** | Subscription lifecycle |
| **Concurrency enforcement** | **No** | Moved entirely to DynamoDB |
| **Machine creation blocking** | **No** | `ALWAYS_ALLOW_OVERAGE` |

### 9.6 Impact on Other Policy Settings

**`maxMachines` values:** Keep them set (Individual: 3, Business: 5 or per-license override) for dashboard visibility, but they are no longer enforcement boundaries.

**`strict: false`:** Must remain `false`. If accidentally changed to `true`, Keygen would start considering `maxMachines` during validation, which would re-introduce enforcement we've deliberately removed.

**Heartbeat strategy (D1):** Our prior analysis recommended KEEP_DEAD + ALWAYS_REVIVE for interactive use. However, with enforcement fully decoupled from Keygen, the heartbeat strategy now only affects **machine record lifecycle** (do dead records accumulate or self-clean?), not enforcement. Both options become viable:

- **DEACTIVATE_DEAD + NO_REVIVE (current):** Containers auto-clean. Laptops lose their machine record after 15 min idle and require re-activation (transparent to user). Simpler — no dead-machine accumulation problem.
- **KEEP_DEAD + ALWAYS_REVIVE:** Laptops survive sleep seamlessly. But dead machines accumulate and require periodic cleanup. More complex operationally.

With enforcement decoupled, **DEACTIVATE_DEAD becomes more attractive** because the downside (re-activation after sleep) can be handled transparently by the extension — detect "machine not found," call activate, resume heartbeat — and there's no accumulation of zombie machine records on Keygen.

### 9.7 Practical Keygen Configuration Changes (Phase 0)

Both policies require the following update:

```
PATCH /v1/accounts/868fccd3-676d-4b9d-90ab-c86ae54419f6/policies/{policyId}
Authorization: Bearer {productToken}
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "policies",
    "attributes": {
      "overageStrategy": "ALWAYS_ALLOW_OVERAGE"
    }
  }
}
```

Apply to:
- Individual policy: `91f1947e-0730-48f9-b19a-eb8016ae2f84`
- Business policy: `b0bcab98-6693-4c44-ad0d-ee3dbb069aea`

Additionally, correct `maxMachines` on Individual from 2 → 3 (for dashboard accuracy, though no longer enforced):

```
PATCH /v1/accounts/868fccd3-676d-4b9d-90ab-c86ae54419f6/policies/91f1947e-0730-48f9-b19a-eb8016ae2f84

{ "data": { "type": "policies", "attributes": { "maxMachines": 3 } } }
```

### 9.8 What Could Go Wrong

| Risk | Why it won't happen | Mitigation |
|------|---------------------|------------|
| Keygen returns `TOO_MANY_MACHINES` blocking activation | `ALWAYS_ALLOW_OVERAGE` explicitly prevents this | Verify with test activation after policy change |
| Keygen changes license status to "overaged" or "suspended" | Only with `strict: true`, which we keep `false` | Gate 0 verification in implementation plan |
| Someone changes `strict` to `true` accidentally | Would re-enable Keygen enforcement | Add `strict: false` assertion to Gate 0 checklist |
| Dead machines accumulate infinitely on Keygen (under KEEP_DEAD) | Relevant only if KEEP_DEAD chosen; moot under DEACTIVATE_DEAD | Periodic cleanup job, or choose DEACTIVATE_DEAD |
| Keygen API rate limits at extreme scale | 150 req/min default; only relevant at 100+ CI activations/day | Monitor; request rate limit increase if needed |

---



## 10. Summary

The Keygen API investigation revealed three critical findings, and a subsequent analysis of concurrency enforcement produced two key decisions:

**Initial findings (Sections 3–7):**

1. **maxMachines mismatch** — Individual policy allows 2, code advertises 3. **Resolved:** 3 is the correct business decision; Keygen will be corrected in Phase 0.
2. **Heartbeat strategy inversion** — DEACTIVATE_DEAD + NO_REVIVE is the opposite of what the code assumes, causing the reported license expiry bug.
3. **maxMachines must scale with seats** — Business licenses need per-license `maxMachines` overrides that update dynamically when seats change. **Superseded:** With ALWAYS_ALLOW_OVERAGE, `maxMachines` is decorative and no longer needs dynamic management for enforcement purposes.

**Architecture decisions (Sections 8–9):**

4. **PER_LICENSE + DynamoDB enforcement** confirmed as the correct architecture (Section 8), particularly for automation scenarios, nag-before-block enforcement, and future licensing tier flexibility.
5. **`overageStrategy: ALWAYS_ALLOW_OVERAGE`** — Keygen enforcement fully decoupled (Section 9). All concurrency limits enforced via a **2-hour DynamoDB sliding window** (`CONCURRENT_DEVICE_WINDOW_HOURS`). Keygen becomes a machine registry and heartbeat tracker, never blocking activations. `maxMachines` retained for dashboard visibility only.
6. **Heartbeat strategy D1 recalculation** — With enforcement decoupled, DEACTIVATE_DEAD + NO_REVIVE (the current setting) becomes more attractive than KEEP_DEAD + ALWAYS_REVIVE. Dead machines self-clean; the extension handles transparent re-activation for laptops waking from sleep. No zombie accumulation problem.

**Phase 0 Keygen changes required:**

- Set `overageStrategy: ALWAYS_ALLOW_OVERAGE` on both policies
- Correct Individual `maxMachines` from 2 → 3 (decorative, for dashboard accuracy)
- D1 (heartbeat strategy) and D2 (heartbeat duration) remain open decisions but are now lower-stakes since they affect only machine record lifecycle, not enforcement

---

_End of report._
