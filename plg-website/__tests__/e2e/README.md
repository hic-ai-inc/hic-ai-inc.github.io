# E2E Test Framework

End-to-end tests for the PLG backend APIs, validating complete user journeys and API contracts.

## Overview

This framework tests the PLG backend by executing real HTTP requests against local or remote environments. It validates:

- **User Journeys** - Complete flows (trial start → purchase → activation)
- **API Contracts** - Individual endpoint behavior and response formats
- **Architecture Tests** - Infrastructure validation (coming soon)

## Quick Start

```bash
# Run against local development
npm run test:e2e

# Run against staging
npm run test:e2e:staging

# Run specific journey
npm run test:e2e -- --journey j1

# Run with verbose output
npm run test:e2e -- --verbose
```

## Test Structure

```
__tests__/e2e/
├── config.js              # Environment configuration
├── runner.js              # Test orchestrator
├── lib/
│   ├── http-client.js     # HTTP client with retry/timeout
│   ├── assertions.js      # Custom E2E assertions
│   ├── test-data.js       # Test data generators
│   └── cleanup.js         # Resource cleanup utilities
├── journeys/
│   ├── j1-trial-start.test.js      # Journey 1: Trial initialization
│   ├── j2-purchase-flow.test.js    # Journey 2: Checkout → license
│   └── j3-license-activation.test.js # Journey 3: Activation flow
└── contracts/             # (coming soon)
    ├── license-api.test.js
    ├── checkout-api.test.js
    └── webhook-api.test.js
```

## User Journeys

### Journey 1: Trial Start (P0)

Tests first-launch detection and trial initialization:

- New device gets 14-day trial
- Trial state persists across calls
- Days remaining calculation
- Grace period handling

### Journey 2: Purchase Flow (P0)

Tests the complete purchase flow:

- Checkout session creation
- Stripe webhook processing
- License key generation

### Journey 3: License Activation (P0)

Tests license activation lifecycle:

- License key validation
- Device activation/deactivation
- Heartbeat/keepalive
- Seat management (team licenses)

## Environment Configuration

### Environment Variables

| Variable              | Description                                          | Default |
| --------------------- | ---------------------------------------------------- | ------- |
| `E2E_ENV`             | Target environment: `local`, `staging`, `production` | `local` |
| `E2E_VERBOSE`         | Enable verbose logging                               | `false` |
| `E2E_CLEANUP`         | Auto-cleanup test data                               | `true`  |
| `E2E_STRIPE_TEST_KEY` | Stripe test API key                                  | -       |
| `E2E_KEYGEN_TEST_KEY` | KeyGen test API key                                  | -       |

### Environments

| Environment  | API Base                     | Mutations   |
| ------------ | ---------------------------- | ----------- |
| `local`      | `http://localhost:3000`      | ✅ Enabled  |
| `staging`    | `https://staging.hic-ai.com` | ✅ Enabled  |
| `production` | `https://hic-ai.com`         | ❌ Disabled |

**Note:** Production tests are read-only to prevent data contamination.

## Running Tests

### All Journey Tests (Default)

```bash
npm run test:e2e
```

### Specific Journey

```bash
npm run test:e2e -- --journey j1    # Trial start
npm run test:e2e -- --journey j2    # Purchase flow
npm run test:e2e -- --journey j3    # License activation
```

### With Options

```bash
# Verbose output
npm run test:e2e -- --verbose

# Skip cleanup (for debugging)
npm run test:e2e -- --skip-cleanup

# Against staging
E2E_ENV=staging npm run test:e2e
```

### All Tests (Journeys + Contracts)

```bash
npm run test:e2e -- --all
```

## Writing Tests

### Basic Test Structure

```javascript
import { describe, test, beforeEach, afterEach } from "node:test";
import { E2EHttpClient } from "../lib/http-client.js";
import { expectStatus, expectSuccess } from "../lib/assertions.js";
import { createTestScope } from "../lib/cleanup.js";

describe("My Feature", () => {
  let client;
  let scope;

  beforeEach(() => {
    client = new E2EHttpClient(getEnvironment().apiBase);
    scope = createTestScope("my-feature");
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  test("should do something", async () => {
    const response = await client.post("/api/endpoint", { data: "value" });

    expectStatus(response, 200);
    expectSuccess(response);

    // Track resources for cleanup
    scope.trackTrial(response.json.trialId);
  });
});
```

### Available Assertions

```javascript
// Status codes
expectStatus(response, 200);
expectSuccess(response); // 2xx
expectError(response); // 4xx

// Response structure
expectFields(response.json, ["id", "name", "status"]);
expectLicenseKey(key);
expectTrialInit(response);
expectHeartbeat(response);
expectLicenseValidation(response);

// Values
expectIsoDate(dateString);
expectUrl(urlString);
expectDaysRemaining(days, { min: 0, max: 14 });

// Performance
await expectCompletesWithin(asyncFn, 5000, "operation name");
```

### Test Data Generators

```javascript
import {
  generateFingerprint,
  generateMachineId,
  generateDeviceData,
  generateCheckoutData,
  generateHeartbeatData,
  generateStripeWebhookEvent,
} from "../lib/test-data.js";

// Device data
const device = generateDeviceData();
// { fingerprint, machineId, machineName, platform, ... }

// Checkout data
const checkout = generateCheckoutData({ licenseType: "team", seats: 5 });

// Webhook events
const event = generateStripeWebhookEvent("checkout.session.completed");
```

### Resource Cleanup

Resources created during tests are automatically tracked and cleaned up:

```javascript
const scope = createTestScope("my-test");

// Track resources
scope.trackTrial(trialId);
scope.trackLicense(licenseKey);
scope.trackDevice(fingerprint, activationId);
scope.trackSession(sessionId);

// Cleanup happens automatically in afterEach
await scope.cleanup();
```

## Mutation Control

Tests that modify data require the `requireMutations()` guard:

```javascript
test("should create something", async () => {
  requireMutations("creating a thing"); // Skips in production

  // ... test code that creates data
});
```

This prevents accidental data creation in production.

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run E2E Tests (Staging)
  env:
    E2E_ENV: staging
    E2E_STRIPE_TEST_KEY: ${{ secrets.STRIPE_TEST_KEY }}
  run: npm run test:e2e
```

### Local Pre-commit

```bash
# Quick smoke test before pushing
npm run test:e2e -- --journey j1
```

## Troubleshooting

### Tests hang or timeout

- Check `E2E_ENV` points to running server
- Verify API is responding: `curl http://localhost:3000/health`
- Increase timeout: modify `testConfig.timeout` in config.js

### Cleanup failures

- Use `--skip-cleanup` to debug test data
- Check server logs for deletion errors
- Verify cleanup endpoints exist

### Unexpected 500 errors

- Enable verbose mode: `--verbose`
- Check server logs
- Verify required environment variables

## Related Documentation

- [E2E Backend Validation Spec](../../docs/plg/20260129_E2E_BACKEND_VALIDATION_SPEC.md)
- [PLG Roadmap](../../docs/plg/PLG_ROADMAP_v4.md)
- [Completion Plan](../../docs/plg/COMPLETION_PLAN_v1.md)
