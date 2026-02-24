# Requirements Document

## Introduction

Stream 1A Website Heartbeat Fixes addresses 4 back-end improvements to the heartbeat API route (`/api/license/heartbeat`) in the Website repo. These fixes ensure the server-side heartbeat route is clean, consistent across all 6 response shapes, and has proper contract-level test coverage before the Extension client-side fixes land in the main Stream 1A work. The issues were identified in the comprehensive heartbeat investigation (HB-7 et al.) and prioritized in the Recommendations memo §2.3 and §3.1.

## Glossary

- **Heartbeat_Route**: The POST endpoint at `/api/license/heartbeat` in `route.js` that handles periodic heartbeat requests from the Mouse VS Code extension
- **Response_Shape**: The specific set of JSON fields returned by the Heartbeat_Route for a given server status
- **Server_Status**: One of 6 possible status values returned by the Heartbeat_Route: `trial`, `active`, `over_limit`, `machine_not_found`, `error`, `invalid`
- **Version_Fields**: The 7 auto-update and daily-gated notification fields: `latestVersion`, `releaseNotesUrl`, `updateUrl`, `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`
- **Contract_Test**: A test that calls the actual route handler and pins the exact Response_Shape for a given Server_Status, located in `heartbeat-route.contract.test.js`
- **Over_Limit_Response**: The Response_Shape returned when a licensed user exceeds their concurrent device limit (Server_Status = `over_limit`)
- **Dead_Code_Ternary**: A conditional expression in the success response path that can never evaluate to its truthy branch because the `overLimit` case returns early at L319-329
- **Integration_Test**: The heartbeat integration test in `heartbeat.test.js` that tests the full route handler with mocked external dependencies
- **getVersionConfig**: The DynamoDB helper function that retrieves the current version configuration record (`VERSION#mouse / CURRENT`)

## Requirements

### Requirement 1: Add Version Fields to Over-Limit Response

**User Story:** As a Mouse extension user who has exceeded their device limit, I want to receive version notification data in the heartbeat response, so that my extension can still notify me about available updates.

#### Acceptance Criteria

1. WHEN the Heartbeat_Route returns an Over_Limit_Response, THE Heartbeat_Route SHALL call getVersionConfig and include all 7 Version_Fields in the response body
2. WHEN the Heartbeat_Route returns an Over_Limit_Response, THE Over_Limit_Response SHALL contain the same 7 Version_Fields as the `trial` and `active` Response_Shapes
3. IF getVersionConfig returns null or undefined values, THEN THE Heartbeat_Route SHALL default each missing Version_Field to `null` in the Over_Limit_Response

### Requirement 2: Add Contract Tests for Missing Server Statuses

**User Story:** As a developer, I want contract-level test coverage for all 6 server statuses, so that response shape regressions are caught before they reach the Extension client.

#### Acceptance Criteria

1. THE Contract_Test file SHALL contain a test that pins the Response_Shape for the `over_limit` Server_Status, including all 7 Version_Fields
2. THE Contract_Test file SHALL contain a test that pins the Response_Shape for the `machine_not_found` Server_Status
3. THE Contract_Test file SHALL contain a test that pins the Response_Shape for the `error` Server_Status
4. THE Contract_Test file SHALL contain a test that pins the Response_Shape for the `invalid` Server_Status
5. WHEN a Contract_Test for a given Server_Status executes, THE Contract_Test SHALL call the actual POST route handler and assert on every field present in the response body
6. WHEN a Contract_Test asserts on a Response_Shape, THE Contract_Test SHALL verify that no unexpected fields are present beyond the pinned shape

### Requirement 3: Remove Dead-Code Ternaries in Success Response

**User Story:** As a developer, I want the success response path to contain only reachable code, so that the route logic is clear and does not mislead future maintainers.

#### Acceptance Criteria

1. WHEN the Heartbeat_Route builds the success response (post-overLimit early return), THE Heartbeat_Route SHALL use the constant value `"active"` for the `status` field instead of the `overLimit ? "over_limit" : "active"` ternary
2. WHEN the Heartbeat_Route builds the success response, THE Heartbeat_Route SHALL use the constant value `false` for the `overLimit` field instead of the `overLimit` variable reference
3. WHEN the Heartbeat_Route builds the success response, THE Heartbeat_Route SHALL use the constant value `null` for the `message` field instead of the `overLimit ? ... : null` ternary
4. WHEN the Heartbeat_Route builds the success response log statement, THE Heartbeat_Route SHALL use the constant value `"active"` for the logged status instead of the `overLimit ? "over_limit" : "active"` ternary

### Requirement 4: Fix Integration Test Contradiction

**User Story:** As a developer, I want the integration test for device-limit-exceeded to match the actual server behavior, so that the test suite does not contain contradictory assertions.

#### Acceptance Criteria

1. WHEN the Integration_Test asserts on the device-limit-exceeded scenario, THE Integration_Test SHALL assert `valid: true` to match the actual Heartbeat_Route behavior (deliberate design choice from commit `78385d4`)
2. WHEN the Integration_Test asserts on the device-limit-exceeded scenario, THE Integration_Test SHALL assert `status: "over_limit"` to match the actual Server_Status value used by the Heartbeat_Route
