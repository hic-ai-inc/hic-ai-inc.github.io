# Owner MEMBER Record Remediation Plan

**Date:** 2026-03-13
**Author:** GitHub Copilot (Claude Opus 4.6), with SWR
**Status:** Proposed — awaiting SWR approval
**Branch:** `development` (commit `c986623`)

---

## 1. Current State of the System

### 1.1 Background

On 2026-03-13, a Business Name management feature was implemented via AWS Kiro across 21 files (commit `c986623`). The feature adds:

- DynamoDB reservation functions for org name uniqueness (`ORGNAME#{NAME}/RESERVATION` pattern)
- Settings API GET/PATCH extensions for reading/updating the org name
- Status API extension to include org name in `orgMembership` response
- Frontend Organization card in `/portal/settings` with certification modal
- Org name display in sidebar, dashboard, team page heading, and billing plan card
- Terms of Service Business Customer authorization section
- Stripe webhook improvement to derive org name from Stripe customer name

All Kiro spec tasks were marked complete and all tests passed.

### 1.2 Observed Problem

When SWR logged into `https://staging.hic-ai.com/portal` as `sreiff@hic-ai.com` (Business Owner), no business name appeared anywhere — sidebar, dashboard, team page heading, or settings page Organization card. The entire feature was invisible.

However, when tested with a **brand-new** Yopmail account purchasing a fresh Business license, the feature worked correctly end-to-end: org name appeared in sidebar, dashboard, settings (with edit/certification modal), and team page.

### 1.3 Root Cause Analysis

**The Owner (`sreiff@hic-ai.com`) has no MEMBER record in DynamoDB.**

Every Kiro-implemented data path calls `getUserOrgMembership(userId)`, which queries GSI1 with `USER#{cognitoUUID}` and expects a MEMBER record (`ORG#{orgId}/MEMBER#{userId}`). When no MEMBER record exists, the function returns `null`, and the entire feature silently produces nothing.

#### DynamoDB State for `sreiff@hic-ai.com`

| Record                     | PK / SK                                      | Status                                                                                 |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| **CUSTOMER PROFILE**       | `USER#9448c4a8.../PROFILE`                   | Exists — `accountType: "business"`, `orgId: "cus_TuLKmYGoqenkv9"`, `orgRole: "owner"`  |
| **ORG DETAILS**            | `ORG#cus_TuLKmYGoqenkv9/DETAILS`             | Exists — `name: "sreiff's Organization"`, `ownerId: "email:sreiff@hic-ai.com"` (stale) |
| **MEMBER (Cognito UUID)**  | `ORG#cus_.../MEMBER#9448c4a8...`             | **Missing**                                                                            |
| **MEMBER (email: prefix)** | `ORG#cus_.../MEMBER#email:sreiff@hic-ai.com` | **Missing**                                                                            |

The only MEMBER record under this org is for an invited admin (`e4c85428`, `brekauyitrouro-9818@yopmail.com`).

#### Why the MEMBER Record Was Never Created

The `sreiff@hic-ai.com` account was created on 2026-02-02, before the Business Name feature was implemented and before the webhook reliably created owner MEMBER records. The Stripe webhook at `plg-website/src/app/api/webhooks/stripe/route.js` lines 402-430 creates the org setup in a single try/catch:

```javascript
try {
  await upsertOrganization({...});         // succeeded (ORG DETAILS exists)
  await addOrgMember({...});               // FAILED or created under email: prefix
  await updateCustomerSubscription({...}); // succeeded (orgId/orgRole on profile)
} catch (error) {
  log.warn("organization_create_failed", ...); // single catch for ALL THREE
}
```

Timeline from DDB timestamps:

| Timestamp                  | Event                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `2026-02-02T23:34:55.502Z` | Webhook fires. Customer PROFILE created with `userId: "email:sreiff@hic-ai.com"`                   |
| `2026-02-02T23:34:55.567Z` | `upsertOrganization` creates ORG with `ownerId: "email:sreiff@hic-ai.com"`                         |
| ~same time                 | `addOrgMember` either fails or creates MEMBER under `email:` prefix                                |
| `2026-02-02T23:34:57.453Z` | `migrateCustomerUserId` runs (~2 seconds later), migrates PROFILE PK from `email:` to Cognito UUID |

Note: The purchase flow requires pre-authentication — there is no path to checkout without first signing in through Cognito. The `email:` prefix userId is a legacy pattern from the webhook creating records before the authenticated `provision-license` call runs. The core issue is that: (a) the original webhook may not have successfully created the owner MEMBER record (single try/catch masks partial failure), and (b) even if it did, `migrateCustomerUserId` at `dynamodb.js` line 295 only migrates the CUSTOMER PROFILE record — it does **not** migrate MEMBER records or update the ORG DETAILS `ownerId`. Either path results in an invisible or nonexistent MEMBER record.

#### Why All Tests Passed

Every test mocks `getUserOrgMembership` to return happy-path data. No test exercises the actual GSI1 query path with real data. No test verifies the owner's MEMBER record actually exists. The property tests generate arbitrary data shapes, not realistic scenarios that include the `email:` prefix userId or the migration timing gap. 100% of tests passed because 100% of tests were testing their own mocks.

#### Kiro's Incorrect Diagnosis

Kiro investigated and concluded that "some agent must have deleted the member record." This is incorrect. The MEMBER record was never reliably created, and even if it was, it would have been orphaned by the subsequent migration. No agent deleted anything.

### 1.4 Known Bugs

| ID        | Severity | Description                                                                                   | Location                                                         |
| --------- | -------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **BUG-1** | Critical | Owner missing MEMBER record → all business name features invisible for `sreiff@hic-ai.com`    | DDB data + Status/Settings API data paths                        |
| **BUG-2** | High     | ORG DETAILS `ownerId` contains stale `email:` prefix instead of Cognito UUID                  | `ORG#cus_TuLKmYGoqenkv9/DETAILS` in DDB                          |
| **BUG-3** | High     | `migrateCustomerUserId` does not migrate MEMBER records or update ORG `ownerId`               | `plg-website/src/lib/dynamodb.js` line 295                       |
| **BUG-4** | High     | Webhook org setup uses single try/catch for 3 independent operations — silent partial failure | `plg-website/src/app/api/webhooks/stripe/route.js` lines 402-435 |
| **BUG-5** | Medium   | Seat count off-by-one: owner without MEMBER record skews `getOrgLicenseUsage`                 | `plg-website/src/lib/dynamodb.js` lines 1880-1888                |
| **BUG-6** | Medium   | "Invite Member" button visible to Members (should be Owner/Admin only)                        | `plg-website/src/app/portal/team/TeamManagement.js` line 322     |

### 1.5 UX Nits

| ID       | Description                                                                             | Location                                                                                  |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **UX-1** | Certification modal background too transparent — content behind clashes with modal text | `plg-website/src/app/portal/settings/page.js` line 592 (`bg-black/60` → increase opacity) |
| **UX-2** | Dashboard subtitle says "Managing [OrgName]" — remove "Managing" prefix                 | `plg-website/src/app/portal/page.js` lines 285-287                                        |

### 1.6 Note: Stripe Seat Proration Timing

When increasing seat count in Stripe (e.g., 1→2), the additional $35.00 was not charged immediately — instead deferred to next billing cycle. This is a Stripe Billing configuration issue (`proration_behavior` defaults to `create_prorations` which settles at next invoice). The fix is to use `proration_behavior: "always_invoice"` or explicitly pay the proration invoice. **This is tracked separately and is out of scope for this plan.**

---

## 2. Architectural Proposal

### 2.1 Core Invariant

**An Owner MUST have a MEMBER record for the entire lifetime of a Business license.** No code path should tolerate, work around, or defensively handle a missing owner MEMBER record. Any detection of this state should trigger self-healing, not fallback logic.

### 2.2 Two Layers of Defense

#### Layer 1: Atomic Webhook Operations (Prevent Inconsistency at Creation)

Restructure the webhook org setup to:

1. **Individual try/catch per operation** with explicit logging per failure
2. **A verification step** after all operations that confirms the MEMBER record exists; creates it if not
3. Use the same `ownerId` throughout all operations to avoid `email:` vs UUID inconsistency

This prevents the partial-failure-silent-success scenario that caused BUG-1.

#### Layer 2: Migration Completeness (Prevent Inconsistency During Migration)

Expand `migrateCustomerUserId` to also:

1. Query for MEMBER records under the old userId via GSI1
2. Create replacement MEMBER records with the new userId (new PK suffix, new GSI1PK)
3. Delete old MEMBER records
4. Update the ORG DETAILS `ownerId` from old to new userId

This closes the gap that caused BUG-2 and BUG-3.

#### Dropped: Self-Healing Consistency Check (Layer 3)

Originally proposed as a catch-all safety net in the Status and Settings API paths. After analysis, this was dropped because:

- The specific failure modes are fully addressed by Layers 1 and 2
- Adding write operations to read-only GET endpoints introduces risk of its own
- Self-healing would mask bugs rather than surface them
- At current scale (staging, no real users), the marginal value does not justify the complexity

If needed in the future, a periodic audit query (scan for ORG DETAILS where no matching MEMBER exists for `ownerId`) would be preferable to inline healing in hot request paths.

### 2.3 Remove Tolerant Fallback Logic

The comment and logic at `dynamodb.js` line 1884 (`// Owner may or may not have a MEMBER# record`) treats the invariant violation as a valid state. With Layers 1 and 2 ensuring MEMBER records are always created and preserved, this should be replaced with a warning log that treats the state as anomalous rather than expected. The seat counting should simply count MEMBER records (including the owner's) without the `Math.max(1, memberCount)` workaround.

---

## 3. Files Requiring Modification

### 3.1 Data Fix (Manual DDB Operation — No Code Change)

| Item                         | Record                                                                 | Action                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Create MEMBER record for SWR | `ORG#cus_TuLKmYGoqenkv9 / MEMBER#9448c4a8-e081-70fb-4a30-a4ce0f67b8d0` | `PutItem` with GSI1PK, GSI2PK, role: owner, status: active                               |
| Update ORG `ownerId`         | `ORG#cus_TuLKmYGoqenkv9 / DETAILS`                                     | Update `ownerId` from `email:sreiff@hic-ai.com` → `9448c4a8-e081-70fb-4a30-a4ce0f67b8d0` |

### 3.2 Code Changes

| File                                                | Changes                                                                                                                              | Addresses              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `plg-website/src/lib/dynamodb.js`                   | 1. Expand `migrateCustomerUserId` to migrate MEMBER records and update ORG `ownerId`. 2. Replace tolerant seat counting with straightforward `memberCount` + warning log | BUG-2, BUG-3, BUG-5, Layer 2 |
| `plg-website/src/app/api/webhooks/stripe/route.js`  | Restructure org setup: individual try/catch per operation + verification step confirming MEMBER record exists                        | BUG-4, Layer 1         |
| `plg-website/src/app/portal/team/TeamManagement.js` | Gate "Invite Member" button behind `orgRole` prop — visible only for `owner` and `admin`                                             | BUG-6                  |
| `plg-website/src/app/portal/team/page.js`           | Pass `orgRole` from `accountData.orgMembership.role` to `TeamManagement` component                                                   | BUG-6                  |
| `plg-website/src/app/portal/settings/page.js`       | Increase certification modal overlay opacity from `bg-black/60` to `bg-black/80`                                                     | UX-1                   |
| `plg-website/src/app/portal/page.js`                | Change org name subtitle from `Managing {name}` to just `{name}`                                                                     | UX-2                   |

### 3.3 Test Updates

| File                                                       | Changes                                                                                  | Addresses |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| `plg-website/__tests__/unit/lib/dynamodb-org-name.test.js` | Add test for expanded `migrateCustomerUserId` → MEMBER migration + ORG `ownerId` update  | Layer 2   |

---

## 4. Implementation Tasks

### Phase A: Immediate Data Fix (SWR Account)

> **Prerequisite:** None. Unblocks SWR's `sreiff@hic-ai.com` account immediately.

- [x] **A.1** Create missing MEMBER record for `sreiff@hic-ai.com`
  - `PutItem` to `hic-plg-staging`:
    - `PK: ORG#cus_TuLKmYGoqenkv9`
    - `SK: MEMBER#9448c4a8-e081-70fb-4a30-a4ce0f67b8d0`
    - `GSI1PK: USER#9448c4a8-e081-70fb-4a30-a4ce0f67b8d0`
    - `GSI1SK: ORG#cus_TuLKmYGoqenkv9`
    - `GSI2PK: EMAIL#sreiff@hic-ai.com`
    - `GSI2SK: MEMBER#cus_TuLKmYGoqenkv9`
    - `memberId: 9448c4a8-e081-70fb-4a30-a4ce0f67b8d0`
    - `orgId: cus_TuLKmYGoqenkv9`
    - `email: sreiff@hic-ai.com`
    - `name: sreiff`
    - `role: owner`
    - `status: active`
    - `joinedAt: 2026-02-02T23:34:55.567Z` (matches org createdAt)

- [x] **A.2** Update stale `ownerId` in ORG DETAILS record
  - `UpdateItem` on `ORG#cus_TuLKmYGoqenkv9 / DETAILS`:
    - Set `ownerId` from `email:sreiff@hic-ai.com` → `9448c4a8-e081-70fb-4a30-a4ce0f67b8d0`

- [x] **A.3** Verify fix: confirm `getUserOrgMembership('9448c4a8-e081-70fb-4a30-a4ce0f67b8d0')` returns ownership record via GSI1 query

### Phase B: UI Polish

> **Prerequisite:** None. Independent of data fix.

- [ ] **B.1** Increase certification modal background opacity
  - File: `plg-website/src/app/portal/settings/page.js`
  - Change: `bg-black/60` → `bg-black/80` (line 592)

- [ ] **B.2** Remove "Managing" prefix from dashboard org name subtitle
  - File: `plg-website/src/app/portal/page.js`
  - Change: `` `Managing ${portalStatus.orgMembership.name}` `` → `portalStatus.orgMembership.name` (lines 285-287)

- [ ] **B.3** Hide "Invite Member" button for Member role
  - File: `plg-website/src/app/portal/team/page.js` — pass `orgRole={accountData?.orgMembership?.role}` to `TeamManagement`
  - File: `plg-website/src/app/portal/team/TeamManagement.js` — accept `orgRole` prop; conditionally render invite button only when `orgRole === "owner" || orgRole === "admin"`

### Phase C: Architectural Resilience

> **Prerequisite:** Phase A complete (SWR account unblocked so we can validate changes).

- [ ] **C.1** Webhook individual error handling + verification (Layer 1)
  - File: `plg-website/src/app/api/webhooks/stripe/route.js`
  - Restructure lines 402-435:
    - Individual try/catch for `upsertOrganization`, `addOrgMember`, and `updateCustomerSubscription`
    - Add verification after all three: query for the MEMBER record; if missing, retry `addOrgMember`
    - Log each operation's success/failure individually

- [ ] **C.2** Expand `migrateCustomerUserId` (Layer 2 — migration)
  - File: `plg-website/src/lib/dynamodb.js`
  - After migrating PROFILE record:
    1. Query GSI1 for MEMBER records under old userId
    2. For each MEMBER found: create new record with new userId, delete old record
    3. Query for ORG DETAILS where `ownerId === oldUserId`, update to new userId

- [ ] **C.3** Clean up tolerant seat counting
  - File: `plg-website/src/lib/dynamodb.js`
  - Replace `getOrgLicenseUsage` seat counting logic (lines 1883-1888):
    - Remove `// (Owner may or may not have a MEMBER# record)` comment
    - Replace `Math.max(1, memberCount)` workaround with direct `memberCount`
    - Add warning log if `memberCount === 0` and `org.ownerId` exists (anomalous state — should not occur with Layers 1 and 2 in place)

### Phase D: Test Coverage

> **Prerequisite:** Phase C complete (functions exist to test).

- [ ] **D.1** Add unit test for expanded `migrateCustomerUserId`
  - Test: MEMBER record migrated from old userId to new
  - Test: ORG `ownerId` updated from old to new

- [ ] **D.2** Add unit test for team page invite button visibility
  - Test: owner sees "Invite Member" button
  - Test: admin sees "Invite Member" button
  - Test: member does not see "Invite Member" button

### Phase E: Verification

> **Prerequisite:** All phases complete.

- [ ] **E.1** Run all existing tests — confirm no regressions
- [ ] **E.2** Manual E2E verification as `sreiff@hic-ai.com`:
  - Sidebar shows org name
  - Dashboard shows org name (without "Managing" prefix)
  - Settings page shows Organization card with edit capability
  - Team page shows correct seat count (owner + members)
  - Team page heading shows org name
  - Billing page shows org name next to plan
- [ ] **E.3** Manual E2E verification as invited member:
  - "Invite Member" button is not visible
  - Org name displays in sidebar, dashboard, team heading
  - Settings page Organization card renders read-only (no edit controls)
- [ ] **E.4** Push to `development`, confirm staging build succeeds

---

## Appendix: Execution Notes

### Recommended Execution Order

Phases A and B are independent and can be executed in parallel. Phase C depends on A being complete for validation. Phase D depends on C. Phase E is final.

```
A (data fix) ──┐
               ├── C (resilience) ── D (tests) ── E (verification)
B (UI polish) ─┘
```

### What This Plan Does NOT Require

- **No git revert.** The Kiro code is functionally correct; it was built on a data assumption that doesn't hold for pre-migration accounts.
- **No DynamoDB Streams or Lambda triggers.** Prevention at creation and migration time is sufficient.
- **No TransactWriteItems.** The webhook operations are naturally idempotent; verification after completion is safer than transactional atomicity with retry complications.
- **No new DynamoDB tables or indexes.** All operations use existing PK/SK and GSI1 patterns.

### Out of Scope

- Stripe seat proration charge timing (separate Stripe Billing configuration)
- Phase 3 email template changes from the original Kiro spec (already scoped out)
- Broader audit of other `email:` → UUID migration gaps beyond MEMBER records
