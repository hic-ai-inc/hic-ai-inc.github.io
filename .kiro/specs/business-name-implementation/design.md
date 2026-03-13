# Design Document: Business Name Implementation

## Overview

This feature enables Business Owners to set, view, and edit their organization's name post-purchase through the Admin Portal Settings page. The name is enforced as unique across all organizations using a reservation record pattern in DynamoDB (no new GSI required). The name propagates to all portal surfaces: sidebar, team page, billing page, and dashboard. A legal certification modal is required before saving a new or changed name. The Terms of Service page is updated with authorization representation language for Business customers.

The feature spans four layers:
1. **DynamoDB** — reservation record for uniqueness, existing org record for storage
2. **API** — Settings API extended for org context (GET) and org name updates (PATCH); Status API extended to include org name
3. **Frontend** — Organization card on Settings page, org name display on sidebar/team/billing/dashboard, certification modal
4. **Legal** — Terms of Service section addition

Email template updates (Phase 3) are deferred and out of scope.

## Architecture

```mermaid
flowchart TD
    subgraph Frontend["Frontend (Next.js Client Components)"]
        SP[Settings Page]
        SB[Portal Sidebar]
        TP[Team Page]
        BP[Billing Page]
        DP[Dashboard]
        CM[Certification Modal]
    end

    subgraph APIs["API Routes (Next.js Server)"]
        SA[Settings API<br/>GET + PATCH]
        STA[Status API<br/>GET]
        BA[Billing API<br/>GET]
        WH[Stripe Webhook]
    end

    subgraph DynamoDB["DynamoDB (Single Table)"]
        OR[Organization Record<br/>PK: ORG#orgId, SK: DETAILS]
        RR[Reservation Record<br/>PK: ORGNAME#UPPERCASE_NAME<br/>SK: RESERVATION]
    end

    SP -->|"GET /settings"| SA
    SP -->|"PATCH /settings {organizationName}"| SA
    SP --> CM
    CM -->|"confirm → PATCH"| SA

    SB -->|"GET /status"| STA
    TP -->|"GET /status"| STA
    DP -->|"GET /status"| STA
    BP -->|"GET /billing (extended)"| BA

    SA -->|read/write| OR
    SA -->|read/write/delete| RR
    STA -->|read| OR
    BA -->|read| OR
    WH -->|write| OR
end
```

### Key Design Decisions

1. **Reservation record pattern** for uniqueness enforcement — avoids adding a GSI. A dedicated DynamoDB item with `PK: ORGNAME#{UPPERCASE_TRIMMED_NAME}`, `SK: RESERVATION` stores the owning `orgId`. Uniqueness is checked via a conditional PutCommand.

2. **Settings API as the single write path** — all org name mutations go through `PATCH /api/portal/settings`. The Status API remains read-only.

3. **Status API as the read path for portal surfaces** — sidebar, team page, and dashboard already fetch from `/api/portal/status`. Adding `name` to the `orgMembership` response block gives all these surfaces access without additional API calls.

4. **Billing API extended for org name** — the billing page only fetches from `/api/portal/billing`. Rather than adding a separate status fetch, the billing API response is extended to include `organizationName` for Business accounts.

5. **Custom modal for certification** — a styled React modal component, not `window.confirm()`. Matches the existing modal pattern used for delete account confirmation on the Settings page.

6. **Webhook placeholder improvement** — uses Stripe Customer `name` field (purchaser's real name from checkout) instead of email prefix. Falls back to email prefix if `name` is unavailable.

## Components and Interfaces

### DynamoDB Layer (`plg-website/src/lib/dynamodb.js`)

#### New Functions

```javascript
/**
 * Check if an organization name is already reserved by another org.
 * Uses the reservation record pattern with PK: ORGNAME#{UPPERCASE_TRIMMED_NAME}, SK: RESERVATION.
 * @param {string} name - Organization name to check
 * @returns {Promise<{exists: boolean, orgId: string|null}>} Whether the name is taken and by which org
 */
export async function getOrgNameReservation(name) { ... }

/**
 * Create a reservation record for an organization name.
 * Uses ConditionExpression to prevent overwriting an existing reservation.
 * @param {string} name - Organization name (original casing)
 * @param {string} orgId - Organization ID claiming this name
 * @returns {Promise<void>}
 * @throws {ConditionalCheckFailedException} if name is already reserved
 */
export async function createOrgNameReservation(name, orgId) { ... }

/**
 * Delete a reservation record for an organization name.
 * Called when an org changes its name (old reservation must be released).
 * @param {string} name - Organization name to release
 * @returns {Promise<void>}
 */
export async function deleteOrgNameReservation(name) { ... }
```

#### Modified Functions

- `updateOrganization()` — no signature change needed; already supports `name` updates via dynamic UpdateExpression.

### Settings API (`plg-website/src/app/api/portal/settings/route.js`)

#### GET Response — Extended

New imports: `getUserOrgMembership`, `getOrganization` from `@/lib/dynamodb`.

For Business users (any role), the response adds an `organization` block:

```javascript
// Response shape
{
  profile: { givenName, middleName, familyName, name, email, picture, accountType, createdAt },
  organization: {           // null/omitted for Individual users
    id: "cus_xxx",          // orgId
    name: "Acme Corp",      // current org name (original casing)
    role: "owner",          // "owner" | "admin" | "member"
    canEdit: true           // true only for role === "owner"
  },
  notifications: { ... }
}
```

#### PATCH Request — Extended

Accepts optional `organizationName` field in request body.

```javascript
// Request body (new field)
{
  organizationName: "Acme Corp"   // optional; triggers org name update flow
}
```

**Server-side flow for `organizationName`:**
1. Verify user has org membership → 403 if not
2. Verify user role is `"owner"` → 403 if not
3. Validate: typeof string, non-empty after trim, ≤120 chars → 400 if invalid
4. Normalize: `name.trim().toUpperCase()` for reservation key
5. Check if name changed from current org name (case-insensitive comparison)
6. If changed: check reservation → 409 if taken by different org
7. If changed: delete old reservation (if org had a non-placeholder name with a reservation), create new reservation, update org record
8. If same (case-insensitive): allow update (preserves casing change), no reservation change needed
9. Return updated organization block

**Error responses:**
- `400` — validation failure (empty, too long, non-string)
- `403` — user is not a Business Owner
- `409` — name already registered by another org

### Status API (`plg-website/src/app/api/portal/status/route.js`)

#### GET Response — Extended

The handler already calls `getOrganization(orgMembership.orgId)` and has the `org` variable. Add `name: org.name` to the `orgMembership` response block:

```javascript
// Current
response.orgMembership = {
  orgId: orgMembership.orgId,
  role: orgMembership.role,
  joinedAt: orgMembership.joinedAt,
};

// After
response.orgMembership = {
  orgId: orgMembership.orgId,
  role: orgMembership.role,
  joinedAt: orgMembership.joinedAt,
  name: org?.name || null,          // <-- add this
};
```

### Billing API (`plg-website/src/app/api/portal/billing/route.js`)

#### GET Response — Extended

Add `organizationName` to the billing response for Business accounts. The billing API already has access to the customer record which contains `orgId`. Load the org record and include the name:

```javascript
// Added to billing response for Business accounts
{
  ...existingBillingFields,
  organizationName: org?.name || null   // null for Individual users
}
```

### Stripe Webhook (`plg-website/src/app/api/webhooks/stripe/route.js`)

#### Placeholder Name Change

```javascript
// Before
name: `${customer_email.split("@")[0]}'s Organization`

// After
const customerName = stripeCustomer?.name || customer_email.split("@")[0];
name: `${customerName}'s Organization`
```

Where `stripeCustomer` is the Stripe Customer object from the event, which contains the `name` field populated during checkout.

### Frontend Components

#### Certification Modal (new component)

A reusable modal component for the legal certification step. Renders the certification text with the submitted business name interpolated. Two buttons: Confirm and Cancel.

```javascript
// Props
{
  isOpen: boolean,
  businessName: string,       // interpolated into certification text
  onConfirm: () => void,
  onCancel: () => void,
}
```

Certification text:
> "By providing this business name, you certify that you are legally authorized to act on behalf of [Business Name] and to bind it to the HIC AI, INC. Terms of Service. You understand that HIC AI, INC. may request additional proof of entity existence or authorization."

#### Organization Card (Settings Page addition)

Positioned between Profile card and Notification Preferences card. Renders conditionally based on `organization` data from Settings API GET.

**Owner view:** Business Name label, current name (or "Not set" prompt), Edit button → inline input + Save/Cancel. Save triggers certification modal if name changed.

**Admin/Member view:** Business Name label, current name displayed as read-only text. No edit controls.

**Individual view:** Card not rendered.

**State management:**
- `organization` — loaded from Settings API GET response
- `editingOrgName` — boolean toggle for edit mode
- `orgNameInput` — controlled input value
- `orgNameError` — error message from API responses
- `showCertModal` — boolean toggle for certification modal
- `savingOrgName` — loading state during PATCH

#### Portal Sidebar (`plg-website/src/components/layout/PortalSidebar.js`)

After the user identity block (name + email), add a line displaying `accountData?.orgMembership?.name` when present. Subtle text styling consistent with the email line.

#### Team Page (`plg-website/src/app/portal/team/page.js`)

Display org name in the page heading. The page already fetches from `/api/portal/status` and stores in `accountData`. Render: `accountData?.orgMembership?.name` in the heading area.

#### Billing Page (`plg-website/src/app/portal/billing/page.js`)

Display org name adjacent to the plan name in the Current Plan card. The billing API response is extended to include `organizationName`. Render: `billing?.organizationName` next to the plan label.

#### Dashboard (`plg-website/src/app/portal/page.js`)

Add subtitle for Business accounts: "Managing [OrgName]" below the welcome heading. The page already fetches from `/api/portal/status`. Render: `portalStatus?.orgMembership?.name` in the subtitle.

#### Terms of Service (`plg-website/src/app/terms/page.js`)

Add a new section (Section 15 or inserted contextually) with Business Customer authorization representation language. Four clauses covering: authorization to act, authority to bind, right to request proof, consequences of false information.

## Data Models

### Reservation Record (New)

| Attribute | Type   | Value                                    | Description                              |
|-----------|--------|------------------------------------------|------------------------------------------|
| PK        | String | `ORGNAME#{UPPERCASE_TRIMMED_NAME}`       | Partition key — normalized org name      |
| SK        | String | `RESERVATION`                            | Sort key — fixed value                   |
| orgId     | String | `cus_xxx`                                | The org that owns this name reservation  |
| name      | String | `Acme Corp`                              | Original casing of the org name          |
| createdAt | String | ISO 8601 timestamp                       | When the reservation was created         |

**Key format example:** For org name "  Acme Corp  ", the PK is `ORGNAME#ACME CORP`.

**Uniqueness enforcement:** `createOrgNameReservation()` uses `ConditionExpression: "attribute_not_exists(PK)"` on the PutCommand. If another org already holds the reservation, the write fails with `ConditionalCheckFailedException`, which the Settings API translates to HTTP 409.

**Name change flow:** Delete old reservation → Create new reservation → Update org record. The delete-then-create is not atomic (no DynamoDB transaction across different PKs needed here because the window is negligible and the worst case is a brief period where neither reservation exists, which is safe — another org claiming the same name in that microsecond window would succeed, but the subsequent org record update would store the correct name regardless). If atomicity is desired later, a DynamoDB TransactWriteItems can wrap all three operations.

### Organization Record (Existing — No Schema Change)

| Attribute             | Type   | Value                        | Notes                          |
|-----------------------|--------|------------------------------|--------------------------------|
| PK                    | String | `ORG#{orgId}`                | Existing                       |
| SK                    | String | `DETAILS`                    | Existing                       |
| orgId                 | String | `cus_xxx`                    | Existing                       |
| name                  | String | `Acme Corp`                  | Existing — stores original casing |
| seatLimit             | Number | 5                            | Existing                       |
| ownerId               | String | Cognito sub or email-prefixed| Existing                       |
| ownerEmail            | String | `owner@example.com`          | Existing                       |
| stripeCustomerId      | String | `cus_xxx`                    | Existing                       |
| stripeSubscriptionId  | String | `sub_xxx`                    | Existing                       |
| createdAt             | String | ISO 8601                     | Existing                       |
| updatedAt             | String | ISO 8601                     | Existing                       |

No new attributes. The `name` field already exists and is populated with a placeholder at org creation time.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Organization Name Round-Trip Consistency

*For any* valid organization name (non-empty string ≤120 chars after trimming), storing it via the Settings API PATCH and then reading it back via Settings API GET or Status API GET should return the exact original casing, AND normalizing the stored name through `trim().toUpperCase()` should produce a reservation key (`ORGNAME#{normalized}`) that maps to exactly one Reservation Record pointing back to that organization's `orgId`.

**Validates: Requirements 1.1, 1.6, 1.7, 5.3**

### Property 2: Reservation Invariant After Name Update

*For any* organization that changes its name from name A to name B (where A ≠ B case-insensitively), after the Settings API PATCH completes successfully, a Reservation Record for the uppercase-trimmed B should exist pointing to that org's `orgId`, AND no Reservation Record for the uppercase-trimmed A should exist.

**Validates: Requirements 1.2, 1.3**

### Property 3: Cross-Organization Uniqueness Enforcement

*For any* two distinct organizations where organization A already holds a reservation for name N, when organization B attempts to claim a name that normalizes to the same uppercase-trimmed value as N, the Settings API PATCH should reject with HTTP 409 and the message "This business name is already registered."

**Validates: Requirements 1.4**

### Property 4: Same-Organization Re-Submission Allowed

*For any* organization that already owns a reservation for name N, re-submitting the same name (including casing variations that normalize to the same uppercase-trimmed value) should succeed without a uniqueness conflict.

**Validates: Requirements 1.5**

### Property 5: Validation Rejects Invalid Organization Names

*For any* input that is either (a) not of type string, (b) an empty string after trimming, (c) a string composed entirely of whitespace, or (d) a string exceeding 120 characters after trimming, the Settings API PATCH should reject with HTTP 400. Additionally, *for any* valid org name with leading/trailing whitespace, the stored value should equal the trimmed version.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 6: Role-Based Write Authorization

*For any* user and any valid organization name submission, the Settings API PATCH should return a successful response if and only if the user is a Business Owner. For Business Admins, Business Members, and Individual Users, the API should reject with HTTP 403.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 7: Role-Based GET Response Shape

*For any* authenticated user, the Settings API GET response should include an `organization` block with `canEdit: true` if the user is a Business Owner, an `organization` block with `canEdit: false` if the user is a Business Admin or Member, and should omit the `organization` block entirely if the user is an Individual User. The `role` field in the organization block should match the user's actual org membership role.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 8: Status API Organization Name Inclusion

*For any* Business user (Owner, Admin, or Member), the Status API GET response should include a `name` field in the `orgMembership` block containing the organization's stored name. *For any* Individual User, the Status API GET response should not include an `orgMembership` block.

**Validates: Requirements 5.1, 5.2**

### Property 9: Settings API GET Backward Compatibility

*For any* authenticated user (regardless of account type or role), the Settings API GET response should continue to include `profile` and `notifications` blocks with the same structure and values as before the feature was implemented.

**Validates: Requirements 4.5**

### Property 10: Certification Modal Text Interpolation

*For any* non-empty business name string, the Certification Modal should render text containing that exact business name interpolated in the certification language, such that the displayed text includes the substring matching the submitted name.

**Validates: Requirements 7.2**

## Error Handling

### Settings API PATCH Error Responses

| Condition | HTTP Status | Response Body | Requirement |
|-----------|-------------|---------------|-------------|
| User not authenticated | 401 | `{ error: "Unauthorized" }` | Existing |
| User is not a Business Owner (admin, member, or individual) | 403 | `{ error: "Only the organization owner can update the business name" }` | 3.2, 3.3, 3.4 |
| `organizationName` is not a string | 400 | `{ error: "Organization name must be a string" }` | 2.3 |
| `organizationName` is empty after trimming | 400 | `{ error: "Organization name cannot be empty" }` | 2.1 |
| `organizationName` exceeds 120 chars after trimming | 400 | `{ error: "Organization name must be 120 characters or fewer" }` | 2.2 |
| Name already reserved by another org | 409 | `{ error: "This business name is already registered." }` | 1.4 |
| DynamoDB write failure | 500 | `{ error: "Failed to update settings" }` | Existing pattern |

### Settings API GET Error Responses

| Condition | HTTP Status | Response Body |
|-----------|-------------|---------------|
| User not authenticated | 401 | `{ error: "Unauthorized" }` |
| DynamoDB read failure | 500 | `{ error: "Failed to fetch settings" }` |

### Frontend Error Display

- **409 (name taken):** Inline error below the org name input: "This business name is already registered."
- **400 (validation):** Inline error below the org name input with the specific validation message from the API.
- **403 (permission):** Inline error: "You don't have permission to edit the organization name."
- **500 (server error):** Page-level error banner (existing pattern): "Failed to update settings"

### Edge Cases

- **Concurrent name claims:** Two owners submit the same name simultaneously. The DynamoDB conditional write ensures only one succeeds; the other gets 409. No data corruption possible.
- **Org with no membership record:** If `getUserOrgMembership()` returns null for a user, the Settings API GET omits the organization block. The PATCH rejects with 403.
- **Org record missing:** If `getOrganization()` returns null after finding a membership, the organization block is returned with `name: null`. The UI shows "Not set."
- **Reservation orphan cleanup:** If a reservation exists but the org record's name doesn't match (e.g., from a failed partial update), the round-trip property (Property 1) would detect this inconsistency. A future cleanup job could reconcile orphaned reservations.

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage.

**Unit tests** cover:
- Specific examples of API request/response flows
- UI component rendering for each role (owner, admin, member, individual)
- Certification modal interaction (show/confirm/cancel)
- Error message display for each HTTP status code
- Webhook placeholder generation with and without Stripe customer name
- Terms of Service content verification
- Edge cases: concurrent claims, missing org records, null membership

**Property-based tests** cover:
- Universal properties that must hold across all valid inputs (Properties 1–10)
- Comprehensive input coverage through randomized org names, user roles, and org configurations

### Property-Based Testing Configuration

- **Library:** [fast-check](https://github.com/dubzzz/fast-check) for JavaScript
- **Minimum iterations:** 100 per property test
- **Tag format:** Each test tagged with `Feature: business-name-implementation, Property {N}: {title}`
- **Each correctness property is implemented by a single property-based test**

### Property Test Implementation Notes

**Generators needed:**
- `arbOrgName()` — generates valid org names: non-empty strings ≤120 chars after trimming, with random casing and whitespace
- `arbInvalidOrgName()` — generates invalid org names: empty strings, whitespace-only strings, strings >120 chars, non-string values
- `arbUserRole()` — generates one of: `"owner"`, `"admin"`, `"member"`, `"individual"`
- `arbOrgId()` — generates random org IDs matching the `cus_xxx` pattern

**Test structure for API properties (P1–P9):**
- Tests should mock DynamoDB operations at the function level (mock `getOrgNameReservation`, `createOrgNameReservation`, `deleteOrgNameReservation`, `updateOrganization`, `getOrganization`, `getUserOrgMembership`)
- Validate the API handler's logic: input validation, role checking, reservation management, response shaping

**Test structure for UI properties (P10):**
- Test the certification modal component's text rendering with generated business names
- Verify the interpolated text contains the exact business name string

### Test File Locations

| Test File | Covers |
|-----------|--------|
| `plg-website/__tests__/property/lib/dynamodb-org-name.property.test.js` | DynamoDB reservation functions — property tests (P1, P2) |
| `plg-website/__tests__/unit/lib/dynamodb-org-name.test.js` | DynamoDB reservation functions — unit tests |
| `plg-website/__tests__/property/api/settings-org-name.property.test.js` | Settings API org name logic — property tests (P3, P4, P5, P6, P7, P9) |
| `plg-website/__tests__/unit/api/settings-org-name.test.js` | Settings API org name logic — unit tests |
| `plg-website/__tests__/property/api/status-org-name.property.test.js` | Status API org name inclusion — property test (P8) |
| `plg-website/__tests__/unit/api/status-org-name.test.js` | Status API org name inclusion — unit tests |
| `plg-website/__tests__/property/app/portal/org-card.property.test.js` | Organization card + certification modal — property test (P10) |
| `plg-website/__tests__/unit/app/portal/org-card.test.js` | Organization card + certification modal — unit tests |
