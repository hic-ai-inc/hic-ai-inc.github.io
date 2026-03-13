# Implementation Plan: Business Name Implementation

## Overview

Phased implementation of Business Name management for the HIC Admin Portal. Phase 1 builds the backend foundation (DynamoDB reservation functions, Settings API GET/PATCH extensions, Status API extension, webhook improvement). Phase 2 builds the frontend UI (Organization card, sidebar/team/billing/dashboard org name display, certification modal). Phase 4 adds Terms of Service legal language. Phase 3 (email templates) is out of scope.

All code is JavaScript (Next.js / React). Tests use `dm/facade/test-helpers/index.js` (HIC test helpers) for all tests.

## Tasks

- [ ] 1. DynamoDB reservation record functions
  - [ ] 1.1 Implement `getOrgNameReservation`, `createOrgNameReservation`, `deleteOrgNameReservation` in `plg-website/src/lib/dynamodb.js`
    - `getOrgNameReservation(name)` — GetCommand with `PK: ORGNAME#{UPPERCASE_TRIMMED_NAME}`, `SK: RESERVATION`; returns `{exists, orgId}`
    - `createOrgNameReservation(name, orgId)` — PutCommand with `ConditionExpression: "attribute_not_exists(PK)"`; stores original casing, orgId, createdAt
    - `deleteOrgNameReservation(name)` — DeleteCommand by normalized key
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

  - [ ]* 1.2 Write property tests for DynamoDB reservation functions in `plg-website/src/lib/__tests__/dynamodb-org-name.test.js`
    - **Property 1: Organization Name Round-Trip Consistency** — for any valid org name, storing via `createOrgNameReservation` and reading via `getOrgNameReservation` returns the correct orgId and original casing; normalized key maps to exactly one reservation
    - **Validates: Requirements 1.1, 1.6, 1.7, 5.3**
    - **Property 2: Reservation Invariant After Name Update** — for any org changing name A→B (case-insensitively different), after deleting old reservation and creating new, reservation for B exists pointing to orgId and reservation for A does not exist
    - **Validates: Requirements 1.2, 1.3**
    - Use `fast-check` with `arbOrgName()` and `arbOrgId()` generators; minimum 100 iterations per property

  - [ ]* 1.3 Write unit tests for DynamoDB reservation functions in `plg-website/src/lib/__tests__/dynamodb-org-name.test.js`
    - Test `getOrgNameReservation` returns `{exists: true, orgId}` for existing reservation
    - Test `getOrgNameReservation` returns `{exists: false, orgId: null}` for non-existent reservation
    - Test `createOrgNameReservation` succeeds for new name
    - Test `createOrgNameReservation` throws `ConditionalCheckFailedException` for duplicate name
    - Test `deleteOrgNameReservation` removes the reservation record
    - Test case-insensitive normalization: "Acme Corp" and "ACME CORP" produce the same key
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

- [ ] 2. Settings API GET — return organization context
  - [ ] 2.1 Extend GET handler in `plg-website/src/app/api/portal/settings/route.js` to return `organization` block for Business users
    - Import `getUserOrgMembership`, `getOrganization` from `@/lib/dynamodb`
    - For Business users: return `organization: { id, name, role, canEdit }` where `canEdit: true` only for `role === "owner"`
    - For Individual users: omit `organization` block
    - Preserve existing `profile` and `notifications` response blocks unchanged
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 2.2 Write property tests for Settings API GET in `plg-website/src/app/api/portal/settings/__tests__/org-name.test.js`
    - **Property 7: Role-Based GET Response Shape** — for any authenticated user, response includes `organization` block with `canEdit: true` for owners, `canEdit: false` for admins/members, and omits `organization` for individual users; `role` field matches actual org membership role
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - **Property 9: Settings API GET Backward Compatibility** — for any authenticated user (any account type/role), response continues to include `profile` and `notifications` blocks with same structure and values as before
    - **Validates: Requirements 4.5**
    - Use `fast-check` with `arbUserRole()` generator; mock DynamoDB at function level

- [ ] 3. Settings API PATCH — accept organization name updates
  - [ ] 3.1 Extend PATCH handler in `plg-website/src/app/api/portal/settings/route.js` to accept `organizationName` field
    - Validate: typeof string, non-empty after trim, ≤120 chars → 400 if invalid
    - Enforce role: user must be Business Owner → 403 if not
    - Normalize: `name.trim().toUpperCase()` for reservation key
    - Check if name changed (case-insensitive comparison with current org name)
    - If changed: check reservation via `getOrgNameReservation` → 409 if taken by different org
    - If changed: delete old reservation, create new reservation, update org record
    - If same (case-insensitive): allow update (casing change), no reservation change needed
    - Return updated `organization` block in response
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Write property tests for Settings API PATCH in `plg-website/src/app/api/portal/settings/__tests__/org-name.test.js`
    - **Property 3: Cross-Organization Uniqueness Enforcement** — for any two distinct orgs where org A holds reservation for name N, org B attempting to claim a name normalizing to the same uppercase-trimmed value gets HTTP 409 with "This business name is already registered."
    - **Validates: Requirements 1.4**
    - **Property 4: Same-Organization Re-Submission Allowed** — for any org that already owns reservation for name N, re-submitting the same name (including casing variations) succeeds without uniqueness conflict
    - **Validates: Requirements 1.5**
    - **Property 5: Validation Rejects Invalid Organization Names** — for any input that is not a string, empty after trim, whitespace-only, or >120 chars after trim, PATCH returns HTTP 400; for valid names with leading/trailing whitespace, stored value equals trimmed version
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - **Property 6: Role-Based Write Authorization** — for any user and valid org name, PATCH succeeds iff user is Business Owner; Business Admins, Members, and Individual Users get HTTP 403
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    - Use `fast-check` with `arbOrgName()`, `arbInvalidOrgName()`, `arbUserRole()`, `arbOrgId()` generators; minimum 100 iterations per property

  - [ ]* 3.3 Write unit tests for Settings API PATCH in `plg-website/src/app/api/portal/settings/__tests__/org-name.test.js`
    - Test successful name set by owner (first time, no existing reservation)
    - Test successful name change by owner (old reservation deleted, new created, org updated)
    - Test casing-only change succeeds without reservation conflict
    - Test 409 when name taken by different org
    - Test 400 for empty name, too-long name, non-string value
    - Test 403 for admin, member, and individual user attempts
    - Test whitespace trimming before storage
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

- [ ] 4. Status API — include organization name in response
  - [ ] 4.1 Add `name` field to `orgMembership` response block in `plg-website/src/app/api/portal/status/route.js`
    - Add `name: org?.name || null` to the existing `orgMembership` object
    - No change for Individual users (no `orgMembership` block)
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 4.2 Write property test for Status API in `plg-website/src/app/api/portal/status/__tests__/org-name.test.js`
    - **Property 8: Status API Organization Name Inclusion** — for any Business user (owner/admin/member), Status API GET includes `name` in `orgMembership` block containing the org's stored name; for Individual users, no `orgMembership` block
    - **Validates: Requirements 5.1, 5.2**
    - Use `fast-check` with `arbUserRole()` generator; mock DynamoDB at function level

  - [ ]* 4.3 Write unit tests for Status API org name in `plg-website/src/app/api/portal/status/__tests__/org-name.test.js`
    - Test Business Owner response includes `orgMembership.name` with correct value
    - Test Business Admin response includes `orgMembership.name`
    - Test Business Member response includes `orgMembership.name`
    - Test Individual User response has no `orgMembership` block
    - Test org with null/missing name returns `name: null`
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 5. Webhook placeholder improvement
  - [ ] 5.1 Update placeholder name derivation in `plg-website/src/app/api/webhooks/stripe/route.js`
    - Replace `name: \`${customer_email.split("@")[0]}'s Organization\`` with `const customerName = stripeCustomer?.name || customer_email.split("@")[0]; name: \`${customerName}'s Organization\``
    - Falls back to email prefix if Stripe Customer `name` is empty/unavailable
    - _Requirements: 10.1, 10.2_

- [ ] 6. Checkpoint — Phase 1 Backend Foundation complete
  - Ensure all existing tests pass
  - Ensure all new tests for DynamoDB reservation functions, Settings API GET/PATCH, and Status API pass
  - Ask the user if questions arise

- [ ] 7. Settings page — Organization card with certification modal
  - [ ] 7.1 Implement Organization card component in `plg-website/src/app/portal/settings/page.js`
    - Add state: `organization`, `editingOrgName`, `orgNameInput`, `orgNameError`, `showCertModal`, `savingOrgName`
    - Load `organization` from Settings API GET response
    - Position card between Profile card and Notification Preferences card
    - Owner view: Business Name label, current name (or "Not set" prompt), Edit button → inline input + Save/Cancel
    - Admin/Member view: Business Name label, current name as read-only text, no edit controls
    - Individual view: card not rendered
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 7.2 Implement Certification Modal component in `plg-website/src/app/portal/settings/page.js`
    - Custom styled modal (not `window.confirm()`), matching existing delete-account modal pattern
    - Props: `isOpen`, `businessName`, `onConfirm`, `onCancel`
    - Interpolate submitted business name into certification text: "By providing this business name, you certify that you are legally authorized to act on behalf of [Business Name] and to bind it to the HIC AI, INC. Terms of Service. You understand that HIC AI, INC. may request additional proof of entity existence or authorization."
    - Confirm button triggers PATCH request; Cancel button aborts save and leaves input unchanged
    - Modal shown only when name has changed from previously stored value; unchanged name saves without modal
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 7.3 Implement error handling display in Organization card
    - 409 → inline error: "This business name is already registered."
    - 400 → inline error with specific validation message from API
    - 403 → inline error: "You don't have permission to edit the organization name."
    - 500 → page-level error banner (existing pattern): "Failed to update settings"
    - On success → update displayed organization name to newly saved value
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 7.4 Write property test for Certification Modal in `plg-website/src/app/portal/settings/__tests__/org-card.test.js`
    - **Property 10: Certification Modal Text Interpolation** — for any non-empty business name string, the modal renders text containing that exact business name interpolated in the certification language
    - **Validates: Requirements 7.2**
    - Use `fast-check` with `arbOrgName()` generator; minimum 100 iterations

  - [ ]* 7.5 Write unit tests for Organization card and Certification Modal in `plg-website/src/app/portal/settings/__tests__/org-card.test.js`
    - Test Organization card renders for Business Owner with edit controls
    - Test Organization card renders "Not set" prompt when name is null/placeholder
    - Test Organization card renders read-only for Admin (no edit button)
    - Test Organization card renders read-only for Member (no edit button)
    - Test Organization card not rendered for Individual user
    - Test certification modal appears on Save when name changed
    - Test certification modal does not appear when name unchanged
    - Test Cancel in modal aborts save
    - Test Confirm in modal triggers PATCH
    - Test 409 error displays inline message
    - Test 400 error displays validation message
    - Test successful save updates displayed name
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.3, 7.4, 7.5, 8.1, 8.2, 8.4_

- [ ] 8. Portal surfaces — organization name display
  - [ ] 8.1 Display org name in sidebar in `plg-website/src/components/layout/PortalSidebar.js`
    - Add line below user identity block (name + email) displaying `accountData?.orgMembership?.name` when present
    - Subtle text styling consistent with email line
    - Not displayed for Individual users (no `orgMembership` block)
    - _Requirements: 9.1, 9.5_

  - [ ] 8.2 Display org name in Team page heading in `plg-website/src/app/portal/team/page.js`
    - Page already fetches from `/api/portal/status`
    - Render `accountData?.orgMembership?.name` in heading area above member list
    - _Requirements: 9.2, 9.5_

  - [ ] 8.3 Display org name in Billing page plan card in `plg-website/src/app/portal/billing/page.js`
    - Extend billing API response to include `organizationName` (or use existing data path per Requirement 11)
    - Render `billing?.organizationName` adjacent to "Business" plan label
    - _Requirements: 9.3, 9.5, 11.1, 11.2_

  - [ ] 8.4 Display org context subtitle in Dashboard in `plg-website/src/app/portal/page.js`
    - Page already fetches from `/api/portal/status`
    - Add subtitle "Managing [OrgName]" below welcome heading for Business accounts
    - Render `portalStatus?.orgMembership?.name`
    - _Requirements: 9.4, 9.5_

- [ ] 9. Checkpoint — Phase 2 Frontend UI complete
  - Ensure all existing tests pass
  - Ensure all new tests for Organization card, certification modal, error handling, and portal surface rendering pass
  - Ask the user if questions arise

- [ ] 10. Terms of Service — Business Customer authorization representation
  - [ ] 10.1 Add Business Customer authorization section in `plg-website/src/app/terms/page.js`
    - Add section with four clauses:
      1. Business customers represent and warrant authorization to act on behalf of the named entity
      2. Business customers represent and warrant authority to bind the named entity to the Terms of Service
      3. HIC AI, INC. reserves the right to request additional proof of entity existence or authorization
      4. Providing false or misleading business name information may result in account termination
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 11. Final checkpoint — All phases complete
  - Ensure all tests pass across all phases
  - Verify all 12 requirements are covered by implementation
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate universal correctness properties (P1–P10) using `fast-check`
- Unit tests validate specific examples and edge cases using `dm/facade/test-helpers/index.js`
- Phase 3 (email template enhancements) is explicitly out of scope per implementation plan
- Phase 4 (Terms of Service) is in scope and included as task 10
