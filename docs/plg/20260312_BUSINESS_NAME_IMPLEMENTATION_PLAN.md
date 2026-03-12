# Business Name Implementation Plan (v2)

Date: 2026-03-12
Author: GC
Reviewer: SWR
Status: Draft — pending SWR review

## Purpose

This memo specifies the pre-launch implementation plan for Business Name support in the HIC Admin Portal. It covers the current implementation gaps, the business logic requirements, the specific code changes required across the website codebase, and a phased execution order with testing gates between each phase.

## Context

Business customers currently purchase a Business license through the checkout flow. Upon successful purchase, the Stripe webhook creates an Organization record in DynamoDB with an auto-generated placeholder name derived from the purchaser's email address (e.g., `alice's Organization`). There is currently no mechanism for the Business Owner to supply, view, or edit their actual business name anywhere in the product.

The Business Name feature is a post-purchase identity assertion. The Business Owner adds their organization's legal name to their account through the Admin Portal's Settings page after purchasing. This name then propagates to portal UX surfaces (sidebar, team management, billing, dashboard) and into transactional emails that support the `organizationName` template variable.

## 1. Current Implementation Gaps

### 1.1 No Business Name input anywhere in the portal

The Settings page (`/portal/settings`) currently renders:

- Profile card — `givenName`, `middleName`, `familyName` inputs
- Notification Preferences card — four toggles
- Export Account Data — download button
- Danger Zone — Delete Account + Leave Organization actions

There is no Organization section. No Business user — Owner, Admin, or Member — can view the organization name, and the Business Owner has no ability to set or edit it.

Relevant files:

- [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js) — GET returns `profile` + `notifications` only; PATCH accepts name fields + notification preferences only
- [plg-website/src/app/portal/settings/page.js](plg-website/src/app/portal/settings/page.js) — renders Profile and Notifications cards only; has role-detection state (`isOrgOwner`, `isBusinessAccount`) but does not use it for org display

### 1.2 Organization name not returned by portal status API

The portal status API (`/api/portal/status`) returns an `orgMembership` block for Business users containing `orgId`, `role`, and `joinedAt`. It does not include the organization name.

Relevant file:

- [plg-website/src/app/api/portal/status/route.js](plg-website/src/app/api/portal/status/route.js) — loads org via `getOrganization()` but does not include `name` in the response

### 1.3 Organization name not displayed in any portal surface

The sidebar, dashboard, team page, and billing page all detect Business account context but none display the organization name.

Relevant files:

- [plg-website/src/components/layout/PortalSidebar.js](plg-website/src/components/layout/PortalSidebar.js) — shows user name + email only; extracts `orgRole` but does not display org name
- [plg-website/src/app/portal/page.js](plg-website/src/app/portal/page.js) — dashboard; shows plan type ("Business Plan") but not org name
- [plg-website/src/app/portal/team/page.js](plg-website/src/app/portal/team/page.js) — team management; no org name header
- [plg-website/src/app/portal/billing/page.js](plg-website/src/app/portal/billing/page.js) — billing; shows subscription details but not org name

### 1.4 Organization name placeholder derived from email

The Stripe webhook creates the Organization record with `name: \`${customer_email.split("@")[0]}'s Organization\``. This is a placeholder, not a user-asserted business name.

Relevant file:

- [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js#L407) — line 407

### 1.5 No uniqueness enforcement for organization names

DynamoDB has no GSI on organization name. There is no `getOrganizationByName()` function. Duplicate organization names are currently possible and unchecked.

Relevant file:

- [plg-website/src/lib/dynamodb.js](plg-website/src/lib/dynamodb.js) — `upsertOrganization()` (line 1337), `updateOrganization()` (line 1406), `getOrganization()` (line 1518) — none enforce name uniqueness

### 1.6 Email templates mostly lack organization name integration

Of 13 email templates, only 2 currently accept and render `organizationName`:

- `licenseRevoked` — "Your Mouse license from [OrgName] has been revoked"
- `enterpriseInvite` — "[InviterName] has invited you to join [OrgName]'s Mouse team"

The remaining 11 templates (`welcome`, `licenseDelivery`, `paymentFailed`, `reactivation`, `cancellationRequested`, `cancellationReversed`, `voluntaryCancellationExpired`, `nonpaymentCancellationExpired`, `winBack30`, `winBack90`, `disputeAlert`) do not accept `organizationName`.

The email sender Lambda already extracts `organizationName` from DynamoDB event records and passes it to all template functions. Templates that do not use it simply ignore it.

Relevant files:

- [dm/layers/ses/src/email-templates.js](dm/layers/ses/src/email-templates.js) — `licenseRevoked` (line 490) and `enterpriseInvite` (line 679) use it; all others do not
- [plg-website/infrastructure/lambda/email-sender/index.js](plg-website/infrastructure/lambda/email-sender/index.js#L160) — extracts `organizationName` from DynamoDB record image at line 160

## 2. Business Logic Requirements

### 2.1 Post-purchase Business Name assertion

Business Name is a post-purchase feature. The Business Owner adds their business name to the account through the Admin Portal Settings page. It is not collected during checkout. It is not stored in or retrieved from Stripe.

### 2.2 Legal certification

Before a Business Name can be accepted — whether it is being set for the first time or updated — the user must affirmatively certify that they are legally authorized to act on behalf of the named entity and to bind it contractually.

Implementation: a browser dialog (styled modal or `window.confirm()`) with certification language. The dialog must be confirmed before the API call is submitted. If the user cancels, no save occurs.

Suggested certification text:

> By providing this business name, you certify that you are legally authorized to act on behalf of [Business Name] and to bind it to the HIC AI, INC. Terms of Service. You understand that HIC AI, INC. may request additional proof of entity existence or authorization.

The user must re-certify every time the business name changes. If the user opens Save without modifying the name, no re-certification is required.

### 2.3 Uniqueness

Each Business Name must be unique across all organizations. The system must reject a business name that is already in use by another organization.

- Comparison is case-insensitive and whitespace-trimmed.
- The user's original casing is preserved in storage.
- The user receives a clear error message if their chosen name is taken: "This business name is already registered."

### 2.4 Visibility and edit authorization

All Business users (Owner, Admin, Member) should be able to view the organization's name across portal surfaces. Only the Business Owner can set or update the organization's name. Admins and Members see it as read-only. The settings API must enforce owner-only writes server-side.

### 2.5 Validation

- Required: non-empty string after trimming
- Maximum length: 120 characters
- Reject non-string values

### 2.6 Business Name propagation into portal UX

Once a Business Name is set, it should be visible contextually across the portal:

| Surface                           | Display                                             | Priority    |
| --------------------------------- | --------------------------------------------------- | ----------- |
| Settings page — Organization card | Current name (all Business users); editable input (owner-only) | Required    |
| Portal sidebar                    | Organization name below user identity block         | Required    |
| Team page heading                 | Organization name above member list                 | Required    |
| Billing page plan card            | Organization name adjacent to "Business" plan label | Recommended |
| Dashboard welcome copy            | "Managing [OrgName]" subtitle                       | Recommended |

### 2.7 Business Name propagation into emails

Templates that already accept `organizationName` (`licenseRevoked`, `enterpriseInvite`) will automatically use the correct name once the source data is correct.

For other key templates (`welcome`, `licenseDelivery`), adding `organizationName` context is a post-launch enhancement. The email sender Lambda already passes the field to all templates; only the template rendering functions need to be updated to use it.

### 2.8 Terms of Service addendum

The Terms of Service should be updated to include language affirming that Business customers represent and warrant authorization to act on behalf of the named entity, and that HIC AI, INC. reserves the right to request additional proof of entity existence or authorization. This is an SWR attorney item.

## 3. Proposed Code Changes

### Phase 1 — Backend Foundation

#### 3.1 DynamoDB: Add organization name lookup capability

**File:** [plg-website/src/lib/dynamodb.js](plg-website/src/lib/dynamodb.js)

Changes:

- Add a `getOrganizationByName(name)` function that checks whether a given organization name is already in use (case-insensitive, trimmed). Implementation approach (scan vs. reservation record vs. GSI) to be determined during implementation.
- Ensure `upsertOrganization()` and `updateOrganization()` support the chosen uniqueness mechanism.

#### 3.2 Settings API: Extend GET to return organization context for Business users

**File:** [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js)

Changes to GET handler:

- After loading the user profile, check if the user has an org membership (Owner, Admin, or Member).
- If so, load the Organization record via `getOrganization()`.
- Return an `organization` block in the response alongside `profile` and `notifications`.
- Set `canEdit: true` only when the user's role is `owner`; otherwise `canEdit: false`.

Example response shape:

```json
{
  "profile": { "givenName": "Simon", "familyName": "Reiff", ... },
  "organization": {
    "id": "org_123",
    "name": "Acme Corp",
    "role": "owner",
    "canEdit": true
  },
  "notifications": { ... }
}
```

For Individual (non-Business) users with no org membership, `organization` is `null` or omitted.

#### 3.3 Settings API: Extend PATCH to accept organization name updates

**File:** [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js)

Changes to PATCH handler:

- Accept an optional `organizationName` field in the request body.
- If present, enforce: (a) user is a Business Owner, (b) value passes validation (non-empty, trimmed, ≤120 chars), (c) value is unique (via `getOrganizationByName()` or reservation-record check, excluding the user's own organization).
- On validation pass, call `updateOrganization({ orgId, name: organizationName })`.
- Return the updated organization block in the response.
- Return 403 if the user is not an owner. Return 409 if the name is already taken. Return 400 for validation failures.

#### 3.4 Status API: Include organization name in response

**File:** [plg-website/src/app/api/portal/status/route.js](plg-website/src/app/api/portal/status/route.js)

Changes:

- The handler already calls `getOrganization()` for Business members.
- Add `name: org.name` to the `orgMembership` block in the response.

This is the smallest possible change. All portal surfaces that already consume `orgMembership` from the status API will then have access to the organization name without additional API calls.

#### 3.5 Webhook placeholder cleanup

**File:** [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js)

Change:

- Replace `name: \`${customer_email.split("@")[0]}'s Organization\`` with a placeholder derived from the Stripe customer's full name: `name: \`${customer_name}'s Organization\`` (where `customer_name` is the `name` field on the Stripe Customer object, which contains the purchaser's real name from Stripe Checkout).
- This ensures the placeholder is human-readable (e.g., "Simon Reiff's Organization") rather than email-derived (e.g., "simon's Organization").

This is a minor quality cleanup. It does not affect the Business Name feature itself.

### Phase 2 — Frontend UI

#### 3.6 Settings page: Add Organization card for Business users

**File:** [plg-website/src/app/portal/settings/page.js](plg-website/src/app/portal/settings/page.js)

Changes:

- Add state for `organization` data loaded from the settings API GET response.
- Add an Organization card (rendered when the user has any org membership — Owner, Admin, or Member) positioned between Profile and Notification Preferences.
- For the Owner: "Business Name" label, current name (or "Not set" prompt), Edit button, input field (when editing), Save/Cancel buttons.
- For Admins and Members: "Business Name" label, current name displayed as read-only (no edit controls).
- Save flow (owner-only): (a) if name has changed, show certification dialog; (b) on confirm, PATCH to `/api/portal/settings` with `organizationName`; (c) handle 409 (name taken) and 400 (validation) error responses with user-facing messages; (d) update local state on success.

#### 3.7 Sidebar: Display organization name for Business users

**File:** [plg-website/src/components/layout/PortalSidebar.js](plg-website/src/components/layout/PortalSidebar.js)

Changes:

- The sidebar already fetches from `/api/portal/status` and extracts `orgMembership`.
- After Phase 1 step 3.4, `orgMembership.name` will be available.
- Add a line below the user identity block (name + email) displaying the organization name when present. Example: subtle text rendering `orgMembership.name` or "Business" fallback.

#### 3.8 Team page: Display organization name in heading

**File:** [plg-website/src/app/portal/team/page.js](plg-website/src/app/portal/team/page.js)

Changes:

- The team page already fetches from `/api/portal/status`.
- Display the organization name in the page heading or section subtitle. Example: "Team — Acme Corp" or "Acme Corp Team Members".

#### 3.9 Billing page: Display organization name in plan card

**File:** [plg-website/src/app/portal/billing/page.js](plg-website/src/app/portal/billing/page.js)

Changes:

- The billing page does not currently fetch from `/api/portal/status`. It fetches from `/api/portal/billing` and `/api/portal/invoices`.
- Option A: add a lightweight status fetch to retrieve `orgMembership.name`.
- Option B: extend the billing API response to include org name.
- Display the organization name adjacent to the "Business" plan label in the plan card. Example: "Business Plan — Acme Corp".

#### 3.10 Dashboard: Display organization context

**File:** [plg-website/src/app/portal/page.js](plg-website/src/app/portal/page.js)

Changes:

- The dashboard already fetches from `/api/portal/status` and detects org context (`isOrgMember`, `orgRole`, `isOrgOwner`).
- After Phase 1 step 3.4, `orgMembership.name` will be available from the same fetch.
- Add a subtitle for Business accounts: "Managing [OrgName]" or similar below the welcome heading.

### Phase 3 — Email Enhancements (Post-Launch)

This phase is not required for launch. The two templates that already use `organizationName` (`licenseRevoked`, `enterpriseInvite`) will automatically display the correct name once the Organization record contains a user-asserted value. The remaining templates can be updated post-launch.

#### 3.11 Extend email templates to include organization name where contextually appropriate

**File:** [dm/layers/ses/src/email-templates.js](dm/layers/ses/src/email-templates.js)

Candidate templates for post-launch enhancement:

- `welcome` — "Welcome to Mouse (on behalf of [OrgName])" or similar
- `licenseDelivery` — "Your Mouse license for [OrgName]" or similar
- `cancellationRequested` — include org context for Business accounts

The email sender Lambda already passes `organizationName` to all template functions. Only the template rendering code needs updating.

### Phase 4 — Legal (SWR Attorney Item)

#### 3.12 Terms of Service update

Add language to the Terms of Service providing that:

- Business customers represent and warrant that they are authorized to act on behalf of the named entity.
- Business customers represent and warrant that they have authority to bind the named entity to the Terms of Service.
- HIC AI, INC. reserves the right to request additional proof of entity existence or authorization to bind the named entity.
- Providing false or misleading business name information may result in account termination.

This is SWR's domain and should be completed before or concurrent with Phase 2 frontend deployment.

## 4. Execution Order

### Phase 1 — Backend Foundation

| Step | Task                                           | Files                                  |
| ---- | ---------------------------------------------- | -------------------------------------- |
| 3.1  | DynamoDB name lookup / uniqueness capability   | `src/lib/dynamodb.js`                  |
| 3.2  | Settings API GET — return organization context | `src/app/api/portal/settings/route.js` |
| 3.3  | Settings API PATCH — accept org name updates   | `src/app/api/portal/settings/route.js` |
| 3.4  | Status API — return organization name          | `src/app/api/portal/status/route.js`   |
| 3.5  | Webhook placeholder cleanup                    | `src/app/api/webhooks/stripe/route.js` |

**Testing gate:** Run all existing automated tests. Fix any regressions. Then expand test coverage to include:

- Settings GET returns organization block for all Business users (Owner, Admin, Member)
- Settings GET returns `canEdit: true` for Owners, `canEdit: false` for Admins/Members
- Settings GET returns no organization block for Individual users
- Settings PATCH accepts valid `organizationName` from Business Owner
- Settings PATCH rejects `organizationName` from non-owners (403)
- Settings PATCH rejects duplicate organization names (409)
- Settings PATCH validates length and format (400)
- Status API response includes `orgMembership.name` for Business users
- DynamoDB `getOrganizationByName()` returns correct match (case-insensitive)
- DynamoDB `getOrganizationByName()` returns null for unmatched names
- Uniqueness check rejects duplicate organization names (case-insensitive)

All tests must pass at 100% before proceeding.

**Commit/push.** Update docs.

### Phase 2 — Frontend UI

| Step | Task                                 | Files                                    |
| ---- | ------------------------------------ | ---------------------------------------- |
| 3.6  | Settings page — Organization card    | `src/app/portal/settings/page.js`        |
| 3.7  | Sidebar — org name display           | `src/components/layout/PortalSidebar.js` |
| 3.8  | Team page — org name heading         | `src/app/portal/team/page.js`            |
| 3.9  | Billing page — org name in plan card | `src/app/portal/billing/page.js`         |
| 3.10 | Dashboard — org context subtitle     | `src/app/portal/page.js`                 |

**Testing gate:** Run all existing automated tests. Fix any regressions. Then expand test coverage to include:

- Settings page renders Organization card for all Business users
- Settings page does not render Organization card for Individual users
- Organization card shows current name or "Not set" prompt
- Organization card shows edit controls for Owners only
- Organization card shows read-only name for Admins and Members
- Save triggers certification dialog when name has changed
- Cancel in certification dialog aborts save
- Successful save updates displayed name
- 409 error displays "name already taken" message
- Sidebar displays organization name for Business users
- Team page heading includes organization name
- Billing page plan card includes organization name
- Dashboard subtitle includes organization name for Business users

All tests must pass at 100% before proceeding.

**Commit/push.** Update docs.

### Phase 3 — Email Enhancements (Post-Launch)

Deferred. See step 3.11 above.

### Phase 4 — Legal

SWR attorney item. See step 3.12 above. To be completed before or concurrent with Phase 2 deployment.

## 5. Summary of Affected Files

| File                                                 | Phase | Change Summary                                                     |
| ---------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| `plg-website/src/lib/dynamodb.js`                    | 1     | Add `getOrganizationByName()`; support uniqueness enforcement      |
| `plg-website/src/app/api/portal/settings/route.js`   | 1     | Extend GET to return org; extend PATCH to accept org name          |
| `plg-website/src/app/api/portal/status/route.js`     | 1     | Add `name` to `orgMembership` response                             |
| `plg-website/src/app/api/webhooks/stripe/route.js`   | 1     | Replace email-derived placeholder with cleaner default             |
| `plg-website/src/app/portal/settings/page.js`        | 2     | Add Organization card (all Business users; editable by owner only) |
| `plg-website/src/components/layout/PortalSidebar.js` | 2     | Display org name for Business users                                |
| `plg-website/src/app/portal/team/page.js`            | 2     | Display org name in page heading                                   |
| `plg-website/src/app/portal/billing/page.js`         | 2     | Display org name in plan card                                      |
| `plg-website/src/app/portal/page.js`                 | 2     | Display org context in dashboard subtitle                          |
| `dm/layers/ses/src/email-templates.js`               | 3     | Extend templates to use `organizationName` (post-launch)           |
| Terms of Service (legal content)                     | 4     | Authorization representation language                              |

## Note on Prior Version

This v2 plan supersedes [20260307_BUSINESS_NAME_IMPLEMENTATION_RECOMMENDATIONS.md](20260307_BUSINESS_NAME_IMPLEMENTATION_RECOMMENDATIONS.md). The prior version proposed collecting business name during the checkout flow and threading it through Stripe Checkout Session metadata. After investigating the Stripe Customer Portal's available configuration features, it was determined that Stripe provides no mechanism for business name capture with legal certification, uniqueness enforcement, or business-name-specific data management. The Business Name feature is therefore implemented entirely as a post-purchase Admin Portal feature backed by DynamoDB, with no Stripe dependencies.
