/**
 * Journey 4: Multi-Device Activation
 *
 * DEPRECATED - 2026-01-29
 *
 * This test file has been deprecated because meaningful E2E testing of Keygen
 * licensing flows requires a Keygen Sandbox Environment.
 *
 * Per Keygen documentation (https://keygen.sh/docs/api/testing/):
 * - For CI/CD, Keygen recommends mocking their APIs
 * - For live E2E testing, use an isolated Sandbox Environment
 * - The Sandbox is created via Keygen-Environment header with policies
 *   that don't require Stripe subscription validation
 *
 * Without a Sandbox Environment:
 * - Licenses created via API fail validation ("must have an active subscription")
 * - The staging policies are configured for subscription-based billing
 * - Tests using fake keys only validate error handling, not success paths
 *
 * TO RE-ENABLE THIS TEST FILE:
 * 1. Create a Keygen Sandbox Environment in the dashboard
 * 2. Create test policies in the sandbox without subscription requirements
 * 3. Generate a sandbox environment token
 * 4. Update fixtures.js to use Keygen-Environment: sandbox header
 * 5. Store sandbox token in AWS Secrets Manager
 *
 * For now, Keygen licensing flow E2E testing must be done manually.
 *
 * Original tests covered:
 * - J4.1: Sequential Device Activation
 * - J4.2: Simultaneous Device Activity
 * - J4.3: Device Metadata
 * - J4.4: Cross-Platform Activation
 * - J4.5: Error Handling
 *
 * @see https://keygen.sh/docs/api/sandbox/
 * @see https://keygen.sh/docs/api/environments/
 */

// All tests skipped - requires Keygen Sandbox Environment
import { describe, test } from "node:test";

describe("Journey 4: Multi-Device Activation [DEPRECATED]", { skip: "Requires Keygen Sandbox Environment - see file header" }, () => {
  test("placeholder - tests deprecated", () => {});
});

