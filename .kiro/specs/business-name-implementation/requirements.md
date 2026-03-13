# Requirements Document

## Introduction

Business Name management for the HIC Admin Portal. Business customers currently receive an auto-generated placeholder organization name derived from their email address upon purchase. This feature enables Business Owners to set, view, and edit their actual business name post-purchase through the Admin Portal Settings page. The name propagates to portal UX surfaces (sidebar, team page, billing page, dashboard) and is enforced as unique across all organizations. Email template updates are deferred to post-launch (Phase 3 out of scope). Terms of Service legal language update is in scope.

## Glossary

- **Admin_Portal**: The authenticated web application at `/portal` where Business and Individual users manage their Mouse subscription, devices, team, and settings
- **Settings_API**: The REST endpoint at `/api/portal/settings` that handles GET (retrieve) and PATCH (update) operations for user profile, notification preferences, and organization context
- **Status_API**: The REST endpoint at `/api/portal/status` that returns the authenticated user's subscription state, account type, and organization membership context
- **Organization_Record**: A DynamoDB item representing a Business account's organization, containing `orgId`, `name`, `stripeCustomerId`, and membership metadata
- **Reservation_Record**: A DynamoDB item keyed by the uppercase-normalized organization name, used to enforce name uniqueness without a GSI
- **Business_Owner**: The user who purchased the Business plan; has `role: "owner"` in their org membership record; sole user authorized to set or edit the organization name
- **Business_Admin**: A user with `role: "admin"` in a Business organization; can view the organization name but cannot edit it
- **Business_Member**: A user with `role: "member"` in a Business organization; can view the organization name but cannot edit it
- **Individual_User**: A user with an Individual (non-Business) subscription who has no organization membership
- **Organization_Card**: A UI component on the Settings page that displays the organization name and, for Owners, provides edit controls
- **Certification_Modal**: A custom modal dialog that requires the Business Owner to affirm legal authorization before saving a new or changed business name
- **Uppercase_Normalization**: The process of converting all letters in a business name to uppercase for case-insensitive uniqueness comparison while preserving the user's original casing in storage

## Requirements

### Requirement 1: Organization Name Storage and Uniqueness

**User Story:** As a platform operator, I want each organization name to be unique across all Business accounts, so that no two organizations share the same name and customers can be unambiguously identified.

#### Acceptance Criteria

1. THE Reservation_Record SHALL store the uppercase-normalized, whitespace-trimmed organization name as its key and the associated `orgId` as its value
2. WHEN a Business_Owner submits an organization name, THE Settings_API SHALL create a Reservation_Record for the uppercase-normalized, trimmed name before updating the Organization_Record
3. WHEN a Business_Owner changes an existing organization name, THE Settings_API SHALL delete the old Reservation_Record and create a new Reservation_Record for the new name atomically
4. WHEN a submitted organization name matches an existing Reservation_Record belonging to a different organization, THE Settings_API SHALL reject the request with HTTP 409 and the message "This business name is already registered."
5. WHEN a submitted organization name matches the Reservation_Record belonging to the same organization, THE Settings_API SHALL treat the submission as a no-op for uniqueness purposes and allow the update
6. THE Organization_Record SHALL store the organization name in the user's original casing
7. FOR ALL valid Organization_Records with a name, parsing the name through Uppercase_Normalization and trim SHALL produce a key that maps to exactly one Reservation_Record pointing back to that organization's `orgId` (round-trip consistency)

### Requirement 2: Organization Name Validation

**User Story:** As a platform operator, I want organization name inputs to be validated against defined rules, so that only well-formed names are stored.

#### Acceptance Criteria

1. WHEN a submitted organization name is an empty string after trimming, THE Settings_API SHALL reject the request with HTTP 400
2. WHEN a submitted organization name exceeds 120 characters after trimming, THE Settings_API SHALL reject the request with HTTP 400
3. WHEN a submitted organization name is not of type string, THE Settings_API SHALL reject the request with HTTP 400
4. THE Settings_API SHALL trim leading and trailing whitespace from the submitted organization name before validation and storage

### Requirement 3: Role-Based Organization Name Edit Authorization

**User Story:** As a Business Owner, I want to be the only person who can set or change my organization's name, so that the business identity is controlled by the account holder.

#### Acceptance Criteria

1. WHEN a Business_Owner submits an `organizationName` field in a PATCH request, THE Settings_API SHALL accept and process the update
2. WHEN a Business_Admin submits an `organizationName` field in a PATCH request, THE Settings_API SHALL reject the request with HTTP 403
3. WHEN a Business_Member submits an `organizationName` field in a PATCH request, THE Settings_API SHALL reject the request with HTTP 403
4. WHEN an Individual_User submits an `organizationName` field in a PATCH request, THE Settings_API SHALL reject the request with HTTP 403

### Requirement 4: Settings API GET — Organization Context

**User Story:** As a Business user, I want the Settings page to load my organization's name and my edit permissions, so that I can view and (if authorized) edit the business name.

#### Acceptance Criteria

1. WHEN a Business_Owner requests GET on the Settings_API, THE Settings_API SHALL return an `organization` block containing `id`, `name`, `role` set to "owner", and `canEdit` set to true
2. WHEN a Business_Admin requests GET on the Settings_API, THE Settings_API SHALL return an `organization` block containing `id`, `name`, `role` set to "admin", and `canEdit` set to false
3. WHEN a Business_Member requests GET on the Settings_API, THE Settings_API SHALL return an `organization` block containing `id`, `name`, `role` set to "member", and `canEdit` set to false
4. WHEN an Individual_User requests GET on the Settings_API, THE Settings_API SHALL omit the `organization` block from the response
5. THE Settings_API GET response SHALL continue to return `profile` and `notifications` blocks unchanged for all user types

### Requirement 5: Status API — Organization Name in Response

**User Story:** As a portal frontend, I want the Status API to include the organization name in the `orgMembership` response, so that all portal surfaces can display the business name without additional API calls.

#### Acceptance Criteria

1. WHEN a Business user requests GET on the Status_API, THE Status_API SHALL include a `name` field in the `orgMembership` response block containing the organization's stored name
2. WHEN an Individual_User requests GET on the Status_API, THE Status_API SHALL continue to omit the `orgMembership` block from the response
3. THE Status_API SHALL return the organization name in the user's original casing as stored in the Organization_Record

### Requirement 6: Settings Page — Organization Card

**User Story:** As a Business user, I want to see my organization's name on the Settings page, and as a Business Owner, I want to edit it, so that I can manage my business identity.

#### Acceptance Criteria

1. WHEN a Business_Owner loads the Settings page, THE Admin_Portal SHALL render an Organization_Card displaying the current organization name with an Edit button
2. WHEN a Business_Owner has not yet set an organization name, THE Organization_Card SHALL display a "Not set" prompt encouraging the owner to add a business name
3. WHEN a Business_Admin loads the Settings page, THE Admin_Portal SHALL render an Organization_Card displaying the current organization name as read-only without edit controls
4. WHEN a Business_Member loads the Settings page, THE Admin_Portal SHALL render an Organization_Card displaying the current organization name as read-only without edit controls
5. WHEN an Individual_User loads the Settings page, THE Admin_Portal SHALL not render an Organization_Card
6. THE Organization_Card SHALL be positioned between the Profile card and the Notification Preferences card on the Settings page

### Requirement 7: Legal Certification Modal

**User Story:** As a platform operator, I want Business Owners to certify legal authorization before saving a business name, so that the platform has an affirmative representation on file.

#### Acceptance Criteria

1. WHEN a Business_Owner clicks Save and the organization name has changed from the previously stored value, THE Admin_Portal SHALL display the Certification_Modal before submitting the API request
2. THE Certification_Modal SHALL display the text: "By providing this business name, you certify that you are legally authorized to act on behalf of [Business Name] and to bind it to the HIC AI, INC. Terms of Service. You understand that HIC AI, INC. may request additional proof of entity existence or authorization." with the submitted business name interpolated in place of [Business Name]
3. WHEN the Business_Owner confirms the Certification_Modal, THE Admin_Portal SHALL submit the PATCH request to the Settings_API with the `organizationName` field
4. WHEN the Business_Owner cancels the Certification_Modal, THE Admin_Portal SHALL abort the save operation and leave the input unchanged
5. WHEN a Business_Owner clicks Save and the organization name has not changed from the previously stored value, THE Admin_Portal SHALL submit the save without displaying the Certification_Modal
6. THE Certification_Modal SHALL be a custom styled modal component, not a browser-native `window.confirm()` dialog

### Requirement 8: Organization Name Error Handling on Settings Page

**User Story:** As a Business Owner, I want clear error messages when my business name submission fails, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN the Settings_API returns HTTP 409 after a PATCH request, THE Organization_Card SHALL display the message "This business name is already registered."
2. WHEN the Settings_API returns HTTP 400 after a PATCH request, THE Organization_Card SHALL display a validation error message describing the issue
3. WHEN the Settings_API returns HTTP 403 after a PATCH request, THE Organization_Card SHALL display a message indicating the user does not have permission to edit the organization name
4. WHEN the Settings_API returns a successful response after a PATCH request, THE Organization_Card SHALL update the displayed organization name to the newly saved value

### Requirement 9: Organization Name Propagation to Portal Surfaces

**User Story:** As a Business user, I want to see my organization's name across the portal, so that the business identity is consistently visible.

#### Acceptance Criteria

1. WHILE a Business user is viewing the portal sidebar, THE Admin_Portal SHALL display the organization name below the user identity block (name and email)
2. WHILE a Business user is viewing the Team page, THE Admin_Portal SHALL display the organization name in the page heading above the member list
3. WHILE a Business user is viewing the Billing page, THE Admin_Portal SHALL display the organization name adjacent to the "Business" plan label in the plan card
4. WHILE a Business user is viewing the Dashboard, THE Admin_Portal SHALL display a subtitle containing the organization name (e.g., "Managing [OrgName]")
5. WHILE an Individual_User is viewing any portal surface, THE Admin_Portal SHALL not display organization name elements

### Requirement 10: Webhook Placeholder Improvement

**User Story:** As a platform operator, I want new organization placeholders to use the purchaser's real name instead of their email prefix, so that the default name is more human-readable.

#### Acceptance Criteria

1. WHEN the Stripe webhook creates a new Organization_Record after a Business plan purchase, THE webhook handler SHALL derive the placeholder name from the Stripe Customer `name` field (e.g., "Simon Reiff's Organization") instead of the email prefix
2. IF the Stripe Customer `name` field is empty or unavailable, THEN THE webhook handler SHALL fall back to the email-prefix-derived placeholder

### Requirement 11: Billing Page Organization Name Data Path

**User Story:** As a frontend developer, I want the billing page to access the organization name through an existing data path, so that no separate status fetch is required.

#### Acceptance Criteria

1. THE Billing page SHALL obtain the organization name by extending an existing API response (billing API or existing DynamoDB call path) rather than adding a separate Status_API fetch
2. WHEN the Billing page loads for a Business user, THE Admin_Portal SHALL have access to the organization name without an additional network request beyond what the page already makes

### Requirement 12: Terms of Service Legal Update

**User Story:** As a platform operator, I want the Terms of Service to include authorization representation language for Business customers, so that the legal framework covers business name assertions.

#### Acceptance Criteria

1. THE Terms of Service page SHALL include language stating that Business customers represent and warrant authorization to act on behalf of the named entity
2. THE Terms of Service page SHALL include language stating that Business customers represent and warrant authority to bind the named entity to the Terms of Service
3. THE Terms of Service page SHALL include language stating that HIC AI, INC. reserves the right to request additional proof of entity existence or authorization
4. THE Terms of Service page SHALL include language stating that providing false or misleading business name information may result in account termination
