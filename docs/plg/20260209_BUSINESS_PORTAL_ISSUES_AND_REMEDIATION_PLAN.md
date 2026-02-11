# Business Portal Issues & Remediation Plan

**Date:** 2026-02-09  
**Author:** Copilot (via SWR directive)  
**Status:** Investigation Complete — Fixes Pending Approval  
**Scope:** 6 bugs blocking multi-user Business tier portal functionality

---

## Executive Summary

After deploying the email feedback loop fix (`b61e73b`), testing of the Business tier multi-user portal revealed 6 interconnected issues that prevent the admin/member experience from functioning correctly. All stem from the same fundamental architectural gap: **the portal was built owner-first, and the member/admin perspective was never fully wired up.**

The issues are listed below in priority order. Each includes root cause analysis, affected files, and a proposed fix.

---

## Issue 1: Invite Emails Never Arrive (CRITICAL)

**Symptom:** Owner (`sreiff@hic-ai.com`) invites `brekauyitrouro-9818@yopmail.com` — invite record created in DDB, but no email ever arrives.

### Root Cause: SES Sandbox Recipient Verification Gate

The email-sender Lambda checks SES verification status for **every recipient** before sending:

```javascript
// email-sender/index.js, lines ~170-194
const verificationStatus = verificationResult.VerificationAttributes?.[email]?.VerificationStatus;
if (verificationStatus !== "Success") {
  // SKIPS the email entirely
  continue;
}
```

For `CUSTOMER_CREATED` emails, this works because the Cognito PostConfirmation Lambda calls `VerifyEmailIdentityCommand` when the user signs up, and the user clicks the SES verification link. But **invite recipients have never signed up** — nobody has called `VerifyEmailIdentityCommand` for their email. Result: SES returns `"NotFound"` and the email is silently skipped.

### Flow Trace

```
POST /api/portal/team { action: "invite" }
  → createOrgInvite() → DDB: PK=ORG#x, SK=INVITE#x, eventType=TEAM_INVITE_CREATED
    → DDB Stream (INSERT)
      → stream-processor → CUSTOMER SNS topic
        → SQS → email-sender
          → Guard 1 (eventName): INSERT + TEAM_INVITE_CREATED → PASSES ✅
          → Guard 2 (emailsSent): no emailsSent on invite record → PASSES ✅
          → SES verification check: recipient NOT verified → BLOCKED ❌
```

### Proposed Fix (Two Options)

**Option A — Short-term (SES sandbox workaround):**  
In `email-sender/index.js`, skip the SES recipient verification check for invite-type events where the recipient is unknown to the system:

```javascript
const SKIP_VERIFICATION_EVENTS = ["TEAM_INVITE_CREATED", "TEAM_INVITE_RESENT"];
if (!SKIP_VERIFICATION_EVENTS.includes(eventType)) {
  // existing SES verification check
}
```

**Option B — Long-term (recommended):**  
Request SES production access (exit sandbox). In production mode, only the sender identity (`noreply@hic-ai.com`) needs verification, not recipients.

**Recommendation:** Implement Option A immediately, pursue Option B before launch.

**Update (2/9/2026 9:55 AM EST):** SES production access has been requested. Expected approval within 24 hours.

**Update (2/9/2026 5:00 PM EST):** AWS Support opened a ticket requesting additional information about our SES use case, bounce/complaint handling, recipient list maintenance, and email content. We supplied a detailed response addressing all points. Awaiting further update on whether our application is approved or if additional information is required.

**Update (2/11/2026 7:00 AM EST):** Excellent news — AWS approved our request to exit SES sandbox mode and move to production. This includes a significant quota increase to 50,000 outgoing messages per day, well above our current needs. Option B is now fully enabled.

### Secondary Issue: No emailsSent Dedup for Invites

After sending, `email-sender` tries to update `USER#${userId}/PROFILE` with the `emailsSent` timestamp. But invite records have `PK=ORG#orgId` and no `userId` field. The `if (TABLE_NAME && userId)` guard prevents the update, so no dedup marker is written. This is non-blocking for now (the invite SQS message is consumed and won't re-trigger), but should be addressed for completeness.

---

## Issue 2: "Last Admin" Demotion Block (HIGH)

**Symptom:** Owner cannot demote the sole admin to member. Error: "Cannot demote the last admin. Promote another member first."

### Root Cause

**File:** `plg-website/src/app/api/portal/team/route.js`, lines 391-403

```javascript
if (targetMember.role === "admin" && role === "member") {
  const adminCount = members.filter(
    (m) => m.role === "admin" || m.role === "owner",
  ).length;
  if (adminCount <= 1) {
    return NextResponse.json(
      { error: "Cannot demote the last admin. Promote another member first." },
      { status: 400 },
    );
  }
}
```

The filter counts both `"admin"` and `"owner"` roles. In theory, `adminCount` should be ≥ 2 (owner + admin). But if the owner's `MEMBER#` record was not created (e.g., org created before the Stripe webhook logic that adds the owner as a member was deployed), or if the record has a missing/different `role` value, `adminCount` = 1, triggering the block.

More fundamentally: **this guard is architecturally unnecessary.** The owner role is immutable (line 381: "Cannot modify owner role" returns 403). The owner can always re-promote any member. There is no scenario where the org loses all admin-level users, because the owner cannot be demoted.

### Proposed Fix

Remove the "last admin" check entirely (lines 391-403). The owner's immutability already guarantees the org always has a manager.

---

## Issue 3: Device Count Data Leak on Dashboard (HIGH)

**Symptom:** `simon.reiff@gmail.com` (admin member) sees "4/5 devices activated" on the dashboard — these are the **owner's** devices, not their own. The `/devices` page correctly shows "0/3 devices."

### Root Cause

**File:** `plg-website/src/app/api/portal/status/route.js`, lines 129-137

```javascript
const licenseId = effectiveCustomer?.keygenLicenseId;
if (licenseId) {
  const devices = await getLicenseDevices(licenseId);
  activatedDevices = devices.length;
}
```

`effectiveCustomer` is `orgOwnerCustomer` for members (after our recent fix). So `keygenLicenseId` is the **owner's** Keygen license ID. `getLicenseDevices()` returns the **owner's** 4 devices, not the member's 0.

The `/devices` page correctly uses the authenticated user's own customer record (via `getCustomerByEmail(tokenPayload.email)`), which has no `keygenLicenseId` for a member — hence 0/3.

### Proposed Fix

For org members, the status API should return the member's **own** device count (0), not the org license's total count. The member's `maxDevices` should come from the business plan's per-seat limit (3 for `maxConcurrentMachinesPerSeat`).

```javascript
// For org members, don't count org license devices — member has their own seat
let activatedDevices = 0;
if (!orgMembership) {
  const licenseId = effectiveCustomer?.keygenLicenseId;
  if (licenseId) {
    const devices = await getLicenseDevices(licenseId);
    activatedDevices = devices.length;
  }
}
// maxDevices already uses planConfig.maxConcurrentMachinesPerSeat for business
```

**Future enhancement:** When per-member device tracking is implemented, count member-specific machines against their seat allocation.

---

## Issue 4: Team Page "Requires Business Subscription" for Admin/Member (HIGH)

**Symptom:** `simon.reiff@gmail.com` (admin) sees "Team management requires a business subscription" on the Team page.

### Root Cause

**File:** `plg-website/src/app/api/portal/team/route.js`, lines 82-84 (GET handler)

```javascript
if (!customer) {
  orgMembership = await getUserOrgMembership(tokenPayload.sub);
}
```

The admin has a bare profile from PostConfirmation (a `USER#/PROFILE` record with no `subscriptionStatus`). Since `customer` is truthy (the bare profile exists), `orgMembership` is **never fetched**. Then:

```javascript
const accountType = orgMembership
  ? "business"
  : customer?.accountType || "individual";
// → orgMembership is null → accountType = "individual" → 403
```

This is the **exact same bare-profile bug** we fixed in `status/route.js` but it was never applied to the team route. The team route's GET, POST, and DELETE handlers all have `if (!customer)` instead of `if (!customer?.subscriptionStatus)`.

### Proposed Fix

In `plg-website/src/app/api/portal/team/route.js`, change all three occurrences of the org membership lookup guard:

```javascript
// Before (GET at line 82, POST at line 185, DELETE at line 495):
if (!customer) {

// After:
if (!customer?.subscriptionStatus) {
```

This matches the pattern already proven in `status/route.js`.

---

## Issue 5: Billing Page Accessible to Admin/Member (MEDIUM)

**Symptom:** Billing information leaks to non-owner users. The sidebar hides the link for members, but admins can see it. Direct URL access is unrestricted for all roles.

### Root Cause

**Files:**

- `plg-website/src/components/layout/PortalSidebar.js`, line 66: Only hides billing for `orgRole === "member"`, not admin
- `plg-website/src/app/portal/billing/page.js`: No role check at all
- `plg-website/src/app/api/portal/billing/route.js`: No role/membership check
- `plg-website/src/app/portal/page.js` (dashboard): Shows "Manage billing →" to all users

### Proposed Fix

**Phase 1 (pre-launch):**

1. **Sidebar:** Change `orgRole === "member"` to `orgRole !== "owner"` for ADMIN_ONLY_PATHS filtering. Also rename the constant to `OWNER_ONLY_PATHS` and remove `/portal/team` from it (admins should see team).
2. **Billing page:** Add a role check — if `orgRole !== "owner"`, redirect to `/portal`.
3. **Billing API:** Add a server-side guard — if user is an org member and not owner, return 403.
4. **Dashboard:** Conditionally hide the "Manage billing →" card for non-owners.

**Rationale:** Pre-launch, only the subscription owner should manage billing. Post-launch, we may add read-only billing views for admins.

---

## Issue 6: Dashboard Shows Inconsistent Data for Members (MEDIUM)

**Symptom:** Dashboard shows "Active" license status (correct via org membership) but 4/5 devices (wrong — owner's devices) and billing info (irrelevant to member).

### Root Cause

This is a composite of Issues 3 and 5. The status API conflates org-level data (owner's license, devices) with member-level data (account status). The dashboard blindly renders whatever the status API returns.

### Proposed Fix

Already addressed by the fixes for Issues 3 and 5. After those fixes:

- **License status:** ✅ Correct ("active" via org owner's subscription)
- **Device count:** ✅ Fixed (member's own: 0)
- **Billing card:** ✅ Hidden for non-owners

---

## Implementation Plan

**Status Update (2/9/2026 5:24 PM EST):** Issues 2, 3, 4, and 5 have been implemented. Issue 1 remains blocked on SES production approval.

### Phase 1: Immediate Fixes (This Session)

| Priority | Issue                         | Files                                                                | Complexity |
| -------- | ----------------------------- | -------------------------------------------------------------------- | ---------- |
| P0       | 1. Invite email SES guard     | `email-sender/index.js`                                              | Low        |
| P0       | 4. Team page bare-profile bug | `team/route.js` (3 occurrences)                                      | Low        |
| P1       | 2. Remove "last admin" check  | `team/route.js`                                                      | Low        |
| P1       | 3. Device count data leak     | `status/route.js`                                                    | Low        |
| P1       | 5. Billing access control     | `PortalSidebar.js`, `billing/page.js`, `billing/route.js`, `page.js` | Medium     |

### Phase 2: Post-Fix Verification

1. Run all 1118+ tests locally
2. Add new unit tests for each fix
3. Commit, push, CI/CD verification
4. Deploy Lambdas via `update-lambdas.sh staging`
5. Manual E2E verification:
   - Owner invites new member → email arrives
   - Owner demotes admin → succeeds
   - Admin sees team page → works
   - Member dashboard → correct device count
   - Member can't access billing → redirected/403'd

### Phase 3: Post-Launch Enhancements (Deferred)

- SES production access (exit sandbox)
- Per-member device tracking in Keygen
- Read-only billing view for admins
- Enhanced team management for admins (currently limited)
- Invite email dedup tracking (write emailsSent on invite records)

---

## Files Affected (Summary)

| File                                          | Changes Needed                                       |
| --------------------------------------------- | ---------------------------------------------------- |
| `infrastructure/lambda/email-sender/index.js` | Skip SES verification for invite events              |
| `src/app/api/portal/team/route.js`            | Fix bare-profile guard (×3), remove last-admin check |
| `src/app/api/portal/status/route.js`          | Member device count isolation                        |
| `src/app/api/portal/billing/route.js`         | Owner-only access guard                              |
| `src/app/portal/billing/page.js`              | Owner-only role check + redirect                     |
| `src/components/layout/PortalSidebar.js`      | Owner-only billing nav filter                        |
| `src/app/portal/page.js`                      | Conditional billing card visibility                  |

---

## Risk Assessment

All fixes are **surgical and additive** — no architectural changes needed. The bare-profile pattern is already proven in `status/route.js`. The email-sender SES skip is a simple event-type whitelist. The billing access control is standard role-based gating. Testing coverage will be extended for each fix.

**Deployment:** Source code changes deploy via Amplify CI/CD. Lambda code changes require `update-lambdas.sh staging`. No CloudFormation stack updates needed.
