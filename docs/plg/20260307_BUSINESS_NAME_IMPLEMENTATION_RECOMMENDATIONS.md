# Business Name Implementation Recommendations

Date: 2026-03-07

## Purpose

This memo documents the current implementation gap around Business license organization naming, the existing partial plumbing already present in the repository, and the minimal pre-launch changes recommended to support collecting, persisting, editing, and displaying a Business Name across checkout, portal UX, and outbound emails.

## Executive Summary

The repository already has a real persistence layer for organization naming, but it is not currently wired to any user input or owner-facing settings flow.

Current state:

- Business organizations are persisted in DynamoDB with a `name` field.
- Team invites and some email/event flows already support `organizationName`.
- Shared-license portal responses already read and return the organization name in some places.
- The Business checkout flow does not collect a business name.
- The Stripe webhook currently fabricates the organization name from the purchaser's email local-part.
- The portal settings flow does not expose or allow editing organization name data.
- Portal status/session context does not consistently expose organization name to the frontend.

Conclusion:

The missing capability is not a missing schema. It is a missing end-to-end data flow.

The minimal pre-launch path is:

1. Collect `organizationName` during Business checkout.
2. Persist it in Stripe Checkout metadata.
3. Use that value when creating the Organization record in the Stripe webhook.
4. Expose organization data in `/api/portal/settings` and `/api/portal/status`.
5. Allow Business Owners to update the organization name from `/portal/settings`.
6. Echo the organization name in the most important Business UX surfaces.

## Findings

### 1. The repository already supports organization name persistence

The Organization record in DynamoDB already stores a `name` field.

Relevant code:

- [plg-website/src/lib/dynamodb.js](plg-website/src/lib/dynamodb.js#L1328)
- [plg-website/src/lib/dynamodb.js](plg-website/src/lib/dynamodb.js#L1397)

`upsertOrganization()` accepts `name` and persists it. `updateOrganization()` also supports updating `name`.

This means there is no schema blocker to implementing Business Name support.

### 2. The current Business checkout flow never asks for business name

The Business checkout page submits:

- `plan`
- `billingCycle`
- `email`
- `seats`
- `promoCode`

It does not collect or submit a business name.

Relevant code:

- [plg-website/src/app/checkout/business/page.js](plg-website/src/app/checkout/business/page.js#L101)
- [plg-website/src/app/checkout/business/page.js](plg-website/src/app/checkout/business/page.js#L103)
- [plg-website/src/app/checkout/business/page.js](plg-website/src/app/checkout/business/page.js#L104)
- [plg-website/src/app/checkout/business/page.js](plg-website/src/app/checkout/business/page.js#L105)

### 3. The checkout API does not accept or propagate organization name

The checkout API only reads:

- `plan`
- `billingCycle`
- `seats`
- `promoCode`

Relevant code:

- [plg-website/src/app/api/checkout/route.js](plg-website/src/app/api/checkout/route.js#L53)

It writes Stripe session metadata with:

- `plan`
- `seats`
- `billingCycle`

Relevant code:

- [plg-website/src/app/api/checkout/route.js](plg-website/src/app/api/checkout/route.js#L157)

This is the correct insertion point for passing `organizationName` through checkout.

### 4. The Stripe webhook currently invents the organization name

When a Business subscription is created, the Stripe webhook creates the organization with this default:

- `${customer_email.split("@")[0]}'s Organization`

Relevant code:

- [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js#L388)
- [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js#L390)

This is the key root-cause gap. The org record exists, but its name is currently derived from email rather than a user-supplied business name.

### 5. Portal settings currently handles only personal profile data

`/api/portal/settings` currently returns and updates only customer profile and notification preferences.

Relevant code:

- [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js#L67)
- [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js#L113)
- [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js#L213)

The `/portal/settings` page also renders only personal profile inputs and notification preferences, plus danger-zone actions.

Relevant code:

- [plg-website/src/app/portal/settings/page.js](plg-website/src/app/portal/settings/page.js#L367)
- [plg-website/src/app/portal/settings/page.js](plg-website/src/app/portal/settings/page.js#L370)

There is currently no organization settings section for Business Owners.

### 6. Portal status already looks up organization context, but does not return organization name

`/api/portal/status` already loads organization data for org members.

Relevant code:

- [plg-website/src/app/api/portal/status/route.js](plg-website/src/app/api/portal/status/route.js#L79)

However, the response only includes `orgId`, `role`, and related membership context.

Relevant code:

- [plg-website/src/app/api/portal/status/route.js](plg-website/src/app/api/portal/status/route.js#L178)
- [plg-website/src/app/api/portal/status/route.js](plg-website/src/app/api/portal/status/route.js#L184)

This means frontend components that already fetch portal status cannot easily display the organization name.

### 7. Some Business flows already consume organization name correctly

This is important because it means propagation is partially implemented once the source of truth is corrected.

#### Shared license portal response

The portal license API already returns organization context using `org.name`.

Relevant code:

- [plg-website/src/app/api/portal/license/route.js](plg-website/src/app/api/portal/license/route.js#L73)
- [plg-website/src/app/api/portal/license/route.js](plg-website/src/app/api/portal/license/route.js#L157)

#### Team invites

The team API already uses organization name when building invites and invite-related payloads.

Relevant code:

- [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js#L328)
- [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js#L332)
- [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js#L400)
- [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js#L659)

Invite metadata persistence also already supports `organizationName`.

- [plg-website/src/lib/dynamodb.js](plg-website/src/lib/dynamodb.js#L1845)

#### Email sending pipeline

The email sender already extracts `organizationName` from records and passes it into templates.

- [plg-website/infrastructure/lambda/email-sender/index.js](plg-website/infrastructure/lambda/email-sender/index.js#L154)

This means outbound email support is mostly a data-propagation problem, not a template-architecture problem.

### 8. Cognito session claims do not currently include organization name

The pre-token Lambda injects:

- `custom:role`
- `custom:account_type`
- `custom:org_id`

Relevant code:

- [plg-website/infrastructure/lambda/cognito-pre-token/index.js](plg-website/infrastructure/lambda/cognito-pre-token/index.js#L132)
- [plg-website/infrastructure/lambda/cognito-pre-token/index.js](plg-website/infrastructure/lambda/cognito-pre-token/index.js#L137)
- [plg-website/infrastructure/lambda/cognito-pre-token/index.js](plg-website/infrastructure/lambda/cognito-pre-token/index.js#L144)

The frontend session mapping reflects the same limitation.

- [plg-website/src/lib/cognito.js](plg-website/src/lib/cognito.js#L127)
- [plg-website/src/lib/cognito.js](plg-website/src/lib/cognito.js#L130)

This is not the root blocker for launch. It only means organization name is not instantly available from the token.

## Recommended Minimal Implementation

### Objective

Enable Business Name to be:

- supplied during Business checkout
- persisted as the organization source of truth
- editable by the Business Owner in `/portal/settings`
- returned by portal APIs that already load org context
- displayed in the most valuable Business UX surfaces
- propagated into invite/revocation/admin email flows that already support organization name

### Step 1. Add a Business Name field to the Business checkout page

File:

- [plg-website/src/app/checkout/business/page.js](plg-website/src/app/checkout/business/page.js)

Recommended change:

- Add an input labeled `Business Name` or `Organization Name`.
- Make it required for Business checkout.
- Submit it as `organizationName` in the POST body to `/api/checkout`.

Recommendation:

- Prefer the label `Business Name` in UI copy.
- Use `organizationName` as the internal API field name to align with existing backend/email naming.

### Step 2. Accept and validate `organizationName` in the checkout API

File:

- [plg-website/src/app/api/checkout/route.js](plg-website/src/app/api/checkout/route.js)

Recommended change:

- Parse `organizationName` from the request body.
- For `plan === "business"`, require a non-empty string.
- Validate max length and sanitize whitespace.
- Write it into Stripe Checkout metadata.

Suggested validation:

- required for Business
- trimmed
- max length around 100 to 120 chars
- reject non-string values

Optional but useful:

- also write it into Stripe customer metadata for support/ops visibility

### Step 3. Use Stripe metadata to create the organization with the real business name

File:

- [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js)

Recommended change:

- Read `organizationName` from the Stripe event metadata.
- Pass it to `upsertOrganization({ name: organizationName, ... })`.
- Keep the current email-derived name only as a fallback if metadata is missing.

This is the single most important persistence fix.

### Step 4. Extend `/api/portal/settings` to include organization data for Business users

File:

- [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js)

Recommended GET behavior:

- For Business users with org membership, fetch the organization record.
- Return an `organization` block alongside `profile` and `notifications`.

Example response shape:

```json
{
  "profile": {
    "givenName": "Simon",
    "middleName": "",
    "familyName": "Wright",
    "email": "owner@example.com",
    "accountType": "business"
  },
  "organization": {
    "id": "org_123",
    "name": "Acme Corp",
    "role": "owner",
    "canEdit": true
  },
  "notifications": {
    "productUpdates": true,
    "usageAlerts": true,
    "billingReminders": true,
    "marketingEmails": false
  }
}
```

Recommended PATCH behavior:

- Accept `organizationName` when the user is a Business Owner.
- Resolve org membership from the authenticated user.
- Reject edits from non-owners.
- Apply the update via `updateOrganization()`.

### Step 5. Add an owner-only Organization section to `/portal/settings`

File:

- [plg-website/src/app/portal/settings/page.js](plg-website/src/app/portal/settings/page.js)

Recommended change:

- Add an `Organization` card visible only to Business Owners.
- Display current Business Name.
- Allow updating the Business Name.
- Reuse the existing save flow or create a separate owner-only save action.

Why `/portal/settings` is the right minimal location:

- It already exists and is owner-accessible.
- It is the natural account-administration surface.
- It avoids building a separate organization-settings route pre-launch.
- It gives the owner a post-purchase correction path if the name was entered incorrectly at checkout.

### Step 6. Extend `/api/portal/status` to return organization name

File:

- [plg-website/src/app/api/portal/status/route.js](plg-website/src/app/api/portal/status/route.js)

Recommended change:

- Add `name` to the returned `orgMembership` or add a sibling `organization` object.

Example:

```json
{
  "accountType": "business",
  "orgMembership": {
    "orgId": "org_123",
    "role": "owner",
    "name": "Acme Corp"
  }
}
```

or

```json
{
  "accountType": "business",
  "organization": {
    "id": "org_123",
    "name": "Acme Corp",
    "role": "owner"
  }
}
```

Either is acceptable. The key point is that status is already fetched by several portal surfaces.

## Recommended UX Echo Points

If a Business Name exists, it should be echoed back to the user where it provides persistent context and reduces ambiguity.

### Highest-priority echo points

#### 1. Portal sidebar

File:

- [plg-website/src/components/layout/PortalSidebar.js](plg-website/src/components/layout/PortalSidebar.js)

Reason:

- This is the most valuable persistent location.
- It gives the user constant awareness of which business context they are operating in.
- It is especially important for Business Owners/Admins who may later manage multiple contexts or support mixed account states.

Recommendation:

- Show organization name above or below the user identity block for Business accounts.

#### 2. Portal settings owner section

File:

- [plg-website/src/app/portal/settings/page.js](plg-website/src/app/portal/settings/page.js)

Reason:

- This is the canonical edit surface.
- It should always display the currently persisted business name.

#### 3. Team management page

Files:

- [plg-website/src/app/portal/team/page.js](plg-website/src/app/portal/team/page.js)
- [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js)

Reason:

- Team management is inherently organization-scoped.
- Invites already use organization name.
- Displaying the name here reinforces that invites and roles belong to a specific business.

Recommendation:

- Use the organization name in page heading or section subtitle.

#### 4. Billing page for Business Owners

Files:

- [plg-website/src/app/portal/billing/page.js](plg-website/src/app/portal/billing/page.js)
- [plg-website/src/app/api/portal/billing/route.js](plg-website/src/app/api/portal/billing/route.js)

Reason:

- Billing ownership is organization-scoped for Business plans.
- Displaying the business name improves clarity when reviewing subscription details.

Recommendation:

- Show `Acme Corp` adjacent to `Business` in the plan card or billing header.

#### 5. Shared-license license page

File:

- [plg-website/src/app/api/portal/license/route.js](plg-website/src/app/api/portal/license/route.js)

Reason:

- This surface already returns organization information.
- Shared-license users should see which organization their license belongs to.

### Lower-priority but useful echo points

#### 6. Portal dashboard welcome/context copy

File:

- [plg-website/src/app/portal/page.js](plg-website/src/app/portal/page.js)

Reason:

- This gives clear context for business users without adding major structural work.

Recommendation:

- For Business accounts, include a short subtitle such as `Managing Acme Corp` or `Your organization: Acme Corp`.

#### 7. Welcome or post-checkout confirmation surfaces

Files:

- [plg-website/src/app/api/checkout/verify/route.js](plg-website/src/app/api/checkout/verify/route.js)
- [plg-website/src/app/welcome/complete/page.js](plg-website/src/app/welcome/complete/page.js)

Reason:

- This is a lower priority than settings/sidebar/team, but useful for purchase confirmation and owner confidence.

## Email Propagation Assessment

### Existing support is already partly in place

The repo already supports organization-aware data in email/event flows.

Confirmed examples:

- invite flows use `organizationName`
- revoke/suspend flows use `organizationName`
- the email sender pipeline accepts `organizationName`

Relevant code:

- [plg-website/infrastructure/lambda/email-sender/index.js](plg-website/infrastructure/lambda/email-sender/index.js#L154)
- [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js#L328)
- [plg-website/src/app/api/webhooks/keygen/route.js](plg-website/src/app/api/webhooks/keygen/route.js#L351)

### What this means operationally

Once the organization record is created with the correct name and owner edits can update that source of truth:

- future team invites can use the correct business name
- future revocation/suspension flows can use the correct business name
- owner/admin portal context can show the correct business name

### Important limitation

Existing email templates can only include the business name if the event record being sent contains `organizationName`.

Therefore, persisting the correct org name is necessary but not always sufficient. Any event flow that should mention the business name must also pass it into the event record.

Based on the current code, invite-related flows are already in good shape. Other lifecycle emails may need case-by-case audit later, but no large email refactor appears necessary for the pre-launch baseline.

## Recommendation on Cognito `org_name` Claims

### Recommendation: defer for the minimal pre-launch implementation

Although adding `custom:org_name` to the Cognito pre-token Lambda is feasible, it is not required for the baseline implementation.

Reasoning:

- Organization name already lives in DynamoDB as the canonical source of truth.
- Portal surfaces already call APIs such as `/api/portal/status`.
- Adding org name to those API responses is lower risk than extending token claims pre-launch.
- Avoiding extra claim logic reduces rollout complexity and token-refresh edge cases.

### When adding `custom:org_name` would become worthwhile

It becomes useful if:

- organization name is needed before any portal API fetch completes
- multiple UI surfaces need instant org rendering from session-only state
- there is a desire to reduce redundant org lookups in client-side pages

This is a reasonable post-launch optimization, not a launch blocker.

## Minimal Change Set Summary

The smallest coherent implementation is:

1. Add `organizationName` input to Business checkout UI.
2. Validate and propagate `organizationName` in `/api/checkout`.
3. Use it in the Stripe webhook when creating the organization.
4. Return organization data in `/api/portal/settings`.
5. Allow owner-only organization name edits in `/api/portal/settings`.
6. Add an owner-only Organization card in `/portal/settings`.
7. Return organization name from `/api/portal/status`.
8. Render that organization name in sidebar, team, billing, and optionally dashboard surfaces.

This is the narrowest path that actually solves the problem end to end.

## Suggested Implementation Order

Recommended order for low-risk delivery:

1. Checkout UI and `/api/checkout`
2. Stripe webhook org creation update
3. `/api/portal/settings` GET and PATCH extensions
4. `/portal/settings` owner-only organization section
5. `/api/portal/status` organization name response
6. Sidebar and other portal UX echoes
7. Follow-up email/event audit if needed

This order ensures the system starts capturing correct business names before the owner-edit UX is rolled out.

## Risks and Adjacent Issues

### 1. Existing Business customers may already have placeholder org names

Any Business accounts already created under the current flow may have names like:

- `alice's Organization`
- `teamlead's Organization`

The owner-edit path in `/portal/settings` is therefore important even if checkout capture is added immediately.

### 2. There is an adjacent checkout metadata mismatch worth fixing

The checkout route writes `metadata.plan`, but the checkout verification route reads `metadata.planType`.

Relevant code:

- [plg-website/src/app/api/checkout/route.js](plg-website/src/app/api/checkout/route.js#L157)
- [plg-website/src/app/api/checkout/verify/route.js](plg-website/src/app/api/checkout/verify/route.js#L58)

This is separate from Business Name support, but it is the sort of inconsistency that can break post-checkout UX and should likely be corrected in the same implementation pass.

### 3. Organization name must remain the single source of truth

To avoid future drift:

- DynamoDB Organization `name` should remain authoritative.
- Stripe metadata should be treated as ingress, not primary truth.
- UI should read organization name from platform APIs backed by DynamoDB.

## Final Recommendation

Pre-launch, implement Business Name as a small but complete end-to-end feature centered on the existing Organization record.

Specifically:

- collect Business Name in the Business checkout flow
- persist it into the Organization `name` field via the Stripe webhook
- allow Business Owners to edit it in `/portal/settings`
- surface it through `/api/portal/status` and `/api/portal/settings`
- echo it in sidebar, team, billing, and license-related Business UX
- rely on existing invite/email organization-name plumbing wherever already present

This delivers the basics with minimal architectural risk and avoids a broader refactor before launch.

## Addendum: Affected Files

The following files would be affected by the recommended minimal implementation.

### Existing files to modify

- [plg-website/src/app/checkout/business/page.js](plg-website/src/app/checkout/business/page.js)
  Add a required Business Name or Organization Name input to the Business checkout form, include it in client-side validation, and submit it as `organizationName` in the checkout request body.

- [plg-website/src/app/api/checkout/route.js](plg-website/src/app/api/checkout/route.js)
  Accept `organizationName` in the request payload, validate and sanitize it for Business purchases, and write it into Stripe Checkout metadata. This is also the natural place to fix the adjacent `plan` versus `planType` metadata mismatch.

- [plg-website/src/app/api/webhooks/stripe/route.js](plg-website/src/app/api/webhooks/stripe/route.js)
  Read `organizationName` from Stripe metadata and use it when calling `upsertOrganization()`, with the current email-derived fallback retained only if metadata is missing.

- [plg-website/src/app/api/portal/settings/route.js](plg-website/src/app/api/portal/settings/route.js)
  Extend GET to return organization context for Business users and extend PATCH to allow owner-only updates to the persisted organization name.

- [plg-website/src/app/portal/settings/page.js](plg-website/src/app/portal/settings/page.js)
  Add an owner-only Organization section showing the current Business Name and providing a simple edit form to update it.

- [plg-website/src/app/api/portal/status/route.js](plg-website/src/app/api/portal/status/route.js)
  Return organization name alongside the existing organization membership context so portal surfaces that already depend on status can display it.

- [plg-website/src/components/layout/PortalSidebar.js](plg-website/src/components/layout/PortalSidebar.js)
  Display the Business Name in persistent portal chrome for Business accounts so the organization context is always visible.

- [plg-website/src/app/portal/team/page.js](plg-website/src/app/portal/team/page.js)
  Surface the Business Name in the team management heading or subtitle so invite and seat management is clearly scoped to the organization.

- [plg-website/src/app/portal/billing/page.js](plg-website/src/app/portal/billing/page.js)
  Echo the Business Name in the billing header or current-plan card for Business Owners.

### Existing files likely to remain behaviorally relevant, but may not require code changes

- [plg-website/src/lib/dynamodb.js](plg-website/src/lib/dynamodb.js)
  The required persistence primitives already exist via `upsertOrganization()` and `updateOrganization()`. This file may not need changes unless additional validation or helper behavior is desired.

- [plg-website/src/app/api/portal/license/route.js](plg-website/src/app/api/portal/license/route.js)
  This route already returns organization name for shared-license contexts. It may not need changes unless UX requirements expand.

- [plg-website/src/app/api/portal/team/route.js](plg-website/src/app/api/portal/team/route.js)
  This route already uses `org.name` in invite-related flows. It likely benefits automatically once the organization source of truth is corrected.

- [plg-website/infrastructure/lambda/email-sender/index.js](plg-website/infrastructure/lambda/email-sender/index.js)
  The email pipeline already accepts `organizationName`. It may not require edits for the baseline implementation, but it remains part of the propagation path.

- [plg-website/src/app/api/webhooks/keygen/route.js](plg-website/src/app/api/webhooks/keygen/route.js)
  This route already carries `organizationName` in relevant event flows. It likely needs no baseline changes, but it is part of the downstream email/event surface.

### Existing files that could be modified in a follow-up, but are not required for the minimal baseline

- [plg-website/infrastructure/lambda/cognito-pre-token/index.js](plg-website/infrastructure/lambda/cognito-pre-token/index.js)
  Could be extended later to inject `custom:org_name` into Cognito tokens, but this is not necessary for the minimal pre-launch implementation.

- [plg-website/src/lib/cognito.js](plg-website/src/lib/cognito.js)
  Would need a small session-mapping addition only if `custom:org_name` is later added to the Cognito token.

- [plg-website/src/app/portal/page.js](plg-website/src/app/portal/page.js)
  Could optionally echo the Business Name in dashboard welcome copy, but this is not essential for the minimal baseline.

- [plg-website/src/app/api/checkout/verify/route.js](plg-website/src/app/api/checkout/verify/route.js)
  Should likely be touched in the same implementation pass to resolve the current checkout metadata naming mismatch, even though it is adjacent to rather than part of Business Name support.

### New files

No new files are strictly required for the minimal implementation described in this memo.

