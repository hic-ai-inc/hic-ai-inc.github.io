# E2E Back-End Validation Technical Specification

**Document:** 20260129_E2E_BACKEND_VALIDATION_SPEC.md  
**Created:** 2026-01-29  
**Author:** GC  
**Status:** 📋 DRAFT  
**Version:** 1.0

---

## 1. Executive Summary

This specification defines the architecture and implementation plan for end-to-end (E2E) back-end validation testing for the PLG (Product-Led Growth) infrastructure. The goal is to validate that all deployed AWS infrastructure, API routes, and data flows work correctly in live environments before proceeding with front-end integration or VS Code extension wire-up.

### 1.1 Why E2E Back-End Validation?

Unit tests validate isolated components with mocked dependencies. E2E tests validate that:

1. **Live APIs respond correctly** to real HTTP requests
2. **DynamoDB writes propagate** to SNS for downstream consumption
3. **Webhooks trigger Lambdas** that correctly transform and persist data
4. **Complete user journeys** work from the back-end perspective

This is a necessary prerequisite before:
- Front-end work in this repository
- VS Code extension wire-up in the `hic` repository

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| API route contract validation | Browser/UI testing |
| DynamoDB → SNS event propagation | Visual regression testing |
| Webhook → Lambda → DynamoDB flows | Performance/load testing |
| License lifecycle journeys | Front-end component tests |
| Local and CI/CD execution | Production data mutation |

---

## 2. Existing Infrastructure Assessment

### 2.1 API Routes Inventory

The PLG website exposes 20+ API routes across these domains:

| Domain | Routes | Purpose |
|--------|--------|---------|
| `/api/license/*` | 6 | License validation, activation, heartbeat |
| `/api/checkout/*` | 2 | Stripe checkout session management |
| `/api/webhooks/*` | 2 | Stripe and KeyGen event handlers |
| `/api/portal/*` | 8+ | User portal operations |
| `/api/provision-license` | 1 | License provisioning |

#### 2.1.1 License API Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/license/trial/init` | POST | Start a new trial | No |
| `/api/license/trial/init` | GET | Check trial status | No |
| `/api/license/validate` | POST | Validate license key | No |
| `/api/license/activate` | POST | Activate license on device | No |
| `/api/license/deactivate` | DELETE | Deactivate device | No |
| `/api/license/heartbeat` | POST | Keep session alive | No |
| `/api/license/check` | GET | Quick license status check | No |

#### 2.1.2 Checkout API Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/checkout` | POST | Create Stripe checkout session | No |
| `/api/checkout/verify` | GET | Verify payment completion | No |

#### 2.1.3 Webhook Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/webhooks/stripe` | POST | Handle Stripe events | Signature |
| `/api/webhooks/keygen` | POST | Handle KeyGen events | Signature |

#### 2.1.4 Portal API Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/portal/status` | GET | User status overview | Yes (Cognito) |
| `/api/portal/license` | GET | License details | Yes |
| `/api/portal/billing` | GET | Billing information | Yes |
| `/api/portal/invoices` | GET | Invoice history | Yes |
| `/api/portal/team` | GET/POST/DELETE | Team management | Yes |
| `/api/portal/settings` | GET/PUT | User settings | Yes |
| `/api/portal/stripe-session` | POST | Manage subscription | Yes |

### 2.2 Deployed Lambda Functions

Four Lambda functions deployed to staging (2026-01-29):

| Function | Purpose | Triggers |
|----------|---------|----------|
| `plg-customer-update-staging` | Process customer updates | DynamoDB Stream |
| `plg-email-sender-staging` | Send transactional emails | SNS |
| `plg-scheduled-tasks-staging` | Periodic maintenance | CloudWatch Events |
| `plg-stream-processor-staging` | Process DynamoDB streams | DynamoDB Stream |

### 2.3 Existing Test Infrastructure

| Directory | Purpose | Test Count |
|-----------|---------|------------|
| `__tests__/unit/` | Unit tests with mocks | ~696 |
| `__tests__/integration/` | Multi-component tests | ~30 |
| `__tests__/infrastructure/` | Deployment validation | ~67 |
| `__tests__/fixtures/` | Shared test data | N/A |
| `__tests__/lib/` | Test utilities | N/A |

**Test Runner:** Node.js native test module with HIC custom ESM loader  
**Test Helpers:** `dm/facade/test-helpers/` (Jest-like syntax)

---

## 3. E2E Test Architecture

### 3.1 Two-Layer Testing Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    E2E TEST LAYERS                          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: API Contract Tests (HTTP)                         │
│  ─────────────────────────────────────────────────────────  │
│  • HTTP requests against live endpoints                     │
│  • Request/response schema validation                       │
│  • Error response verification                              │
│  • Rate limiting behavior                                   │
│  • Runs locally and in CI/CD                                │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Architecture Tests (AWS)                          │
│  ─────────────────────────────────────────────────────────  │
│  • DynamoDB → SNS propagation verification                  │
│  • Webhook → Lambda → DynamoDB flow                         │
│  • Event ordering and timing validation                     │
│  • Cross-service data consistency                           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Directory Structure

```
plg-website/
└── __tests__/
    └── e2e/
        ├── README.md                 # E2E test documentation
        ├── config.js                 # Environment configuration
        ├── runner.js                 # E2E-specific test runner
        │
        ├── lib/
        │   ├── http-client.js        # Thin wrapper around fetch
        │   ├── assertions.js         # E2E-specific assertions
        │   ├── test-data.js          # Test data generators
        │   ├── cleanup.js            # Test data cleanup utilities
        │   └── aws-helpers.js        # DynamoDB/SNS verification
        │
        ├── journeys/
        │   ├── j1-trial-start.test.js
        │   ├── j2-purchase-flow.test.js
        │   ├── j3-license-activation.test.js
        │   ├── j4-multi-device.test.js
        │   ├── j5-heartbeat-loop.test.js
        │   ├── j6-concurrent-limits.test.js
        │   ├── j7-deactivation.test.js
        │   └── j8-subscription-lifecycle.test.js
        │
        ├── contracts/
        │   ├── license-api.test.js   # License API contract tests
        │   ├── checkout-api.test.js  # Checkout API contract tests
        │   ├── webhook-api.test.js   # Webhook API contract tests
        │   └── portal-api.test.js    # Portal API contract tests
        │
        └── architecture/
            ├── dynamo-sns-propagation.test.js
            ├── webhook-lambda-flow.test.js
            └── event-ordering.test.js
```

### 3.3 Implementation Approach

**Decision:** Node.js + fetch (Option B)

**Rationale:**
- Consistent with existing test infrastructure
- Shares test helpers with unit/integration tests
- Native test runner works in both local and CI/CD
- Easier maintenance alongside existing tests
- Better error messages and debugging

---

## 4. Environment Configuration

### 4.1 Configuration Module

```javascript
// __tests__/e2e/config.js

/**
 * E2E Test Environment Configuration
 * 
 * Supports local, staging, and production environments.
 * Production tests are READ-ONLY (no mutations).
 */

export const environments = {
  local: {
    name: 'local',
    apiBase: 'http://localhost:3000/api',
    stripeMode: 'test',
    allowMutations: true,
    timeout: 5000,
  },
  staging: {
    name: 'staging',
    apiBase: 'https://staging.hic-ai.com/api',
    stripeMode: 'test',
    allowMutations: true,
    timeout: 10000,
  },
  production: {
    name: 'production',
    apiBase: 'https://hic-ai.com/api',
    stripeMode: 'live',
    allowMutations: false,  // READ-ONLY!
    timeout: 10000,
  }
};

// Selected via E2E_ENV environment variable
export function getEnvironment() {
  const envName = process.env.E2E_ENV || 'local';
  const env = environments[envName];
  
  if (!env) {
    throw new Error(`Unknown E2E environment: ${envName}`);
  }
  
  return env;
}
```

### 4.2 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `E2E_ENV` | No | Environment name: `local`, `staging`, `production` (default: `local`) |
| `E2E_STRIPE_TEST_KEY` | Yes* | Stripe test API key for checkout tests |
| `E2E_KEYGEN_TEST_KEY` | Yes* | KeyGen test API key for license tests |
| `E2E_COGNITO_TEST_USER` | Yes* | Test user email for authenticated tests |
| `E2E_COGNITO_TEST_PASS` | Yes* | Test user password |
| `E2E_VERBOSE` | No | Enable verbose logging |
| `E2E_CLEANUP` | No | Clean up test data after run (default: `true`) |

*Required for staging/production environments

### 4.3 npm Scripts

```json
{
  "scripts": {
    "test:e2e": "E2E_ENV=local node --loader ../dm/facade/utils/test-loader.js __tests__/e2e/runner.js",
    "test:e2e:staging": "E2E_ENV=staging node --loader ../dm/facade/utils/test-loader.js __tests__/e2e/runner.js",
    "test:e2e:prod": "E2E_ENV=production node --loader ../dm/facade/utils/test-loader.js __tests__/e2e/runner.js",
    "test:e2e:journey": "E2E_ENV=local node --loader ../dm/facade/utils/test-loader.js __tests__/e2e/runner.js --journey",
    "test:e2e:contract": "E2E_ENV=local node --loader ../dm/facade/utils/test-loader.js __tests__/e2e/runner.js --contract"
  }
}
```

---

## 5. User Journey Test Suites

### 5.1 Journey Overview

| ID | Journey | Description | APIs Involved | Priority |
|----|---------|-------------|---------------|----------|
| J1 | Trial Start | New user → trial token → valid for 14 days | `trial/init` | P0 |
| J2 | Purchase Flow | Checkout → Stripe → webhook → license created | `checkout`, `webhooks/stripe` | P0 |
| J3 | License Activation | Key entry → validate → activate on device | `validate`, `activate` | P0 |
| J4 | Multi-Device | Same license → 2nd device activation | `activate` (x2) | P1 |
| J5 | Heartbeat Loop | Active session → periodic heartbeat | `heartbeat` | P1 |
| J6 | Concurrent Limits | Exceed device limit → rejection | `activate` (x4) | P1 |
| J7 | Deactivation | Remove device → re-activate elsewhere | `deactivate`, `activate` | P2 |
| J8 | Subscription Lifecycle | Cancel → grace period → suspension | `webhooks/stripe` | P2 |

### 5.2 Journey 1: Trial Start

**Purpose:** Validate that a new user can start a 14-day trial.

**Sequence:**

```
┌─────────────────────────────────────────────────────────────┐
│  Journey 1: Trial Start                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. POST /api/license/trial/init                            │
│     Body: { machineFingerprint: "test-fp-xxx" }             │
│     ↓                                                       │
│  2. Response: 201 Created                                   │
│     { trialToken: "...", expiresAt: "...", daysRemaining }  │
│     ↓                                                       │
│  3. GET /api/license/trial/init?fingerprint=test-fp-xxx     │
│     ↓                                                       │
│  4. Response: 200 OK                                        │
│     { status: "active", daysRemaining: 14, ... }            │
│     ↓                                                       │
│  5. Verify: DynamoDB record created with TTL                │
│     ↓                                                       │
│  6. Cleanup: Delete test trial record                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Test Cases:**

```javascript
describe('Journey 1: Trial Start', () => {
  test('J1.1: New fingerprint creates trial', async () => {
    // POST /api/license/trial/init
    // Expect: 201, trialToken, expiresAt, daysRemaining: 14
  });

  test('J1.2: Same fingerprint returns existing trial', async () => {
    // POST same fingerprint again
    // Expect: 200, same trialToken
  });

  test('J1.3: Trial status check returns correct data', async () => {
    // GET /api/license/trial/init?fingerprint=...
    // Expect: 200, status: "active"
  });

  test('J1.4: Invalid fingerprint format rejected', async () => {
    // POST with malformed fingerprint
    // Expect: 400, error message
  });

  test('J1.5: DynamoDB record has correct TTL', async () => {
    // Query DynamoDB directly
    // Expect: TTL = now + 14 days
  });
});
```

### 5.3 Journey 2: Purchase Flow

**Purpose:** Validate complete purchase flow from checkout to license creation.

**Sequence:**

```
┌─────────────────────────────────────────────────────────────┐
│  Journey 2: Purchase Flow                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. POST /api/checkout                                      │
│     Body: { priceId: "price_xxx", email: "test@..." }       │
│     ↓                                                       │
│  2. Response: 200 OK                                        │
│     { sessionId: "cs_test_xxx", url: "https://..." }        │
│     ↓                                                       │
│  3. [Stripe Test Mode] Complete checkout                    │
│     ↓                                                       │
│  4. POST /api/webhooks/stripe (simulated)                   │
│     Event: checkout.session.completed                       │
│     ↓                                                       │
│  5. Response: 200 OK                                        │
│     { received: true }                                      │
│     ↓                                                       │
│  6. Verify: License created in DynamoDB                     │
│     ↓                                                       │
│  7. Verify: SNS event published                             │
│     ↓                                                       │
│  8. GET /api/checkout/verify?session_id=cs_test_xxx         │
│     ↓                                                       │
│  9. Response: 200 OK                                        │
│     { success: true, licenseKey: "MOUSE-XXXX-..." }         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Journey 3: License Activation

**Purpose:** Validate license key activation on a device.

**Sequence:**

```
┌─────────────────────────────────────────────────────────────┐
│  Journey 3: License Activation                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. POST /api/license/validate                              │
│     Body: { licenseKey: "MOUSE-XXXX-..." }                  │
│     ↓                                                       │
│  2. Response: 200 OK                                        │
│     { valid: true, status: "active", maxDevices: 3 }        │
│     ↓                                                       │
│  3. POST /api/license/activate                              │
│     Body: { licenseKey, machineId, fingerprint }            │
│     ↓                                                       │
│  4. Response: 200 OK                                        │
│     { activated: true, deviceCount: 1, maxDevices: 3 }      │
│     ↓                                                       │
│  5. Verify: Device record in DynamoDB                       │
│     ↓                                                       │
│  6. POST /api/license/heartbeat                             │
│     Body: { licenseKey, machineId, sessionId }              │
│     ↓                                                       │
│  7. Response: 200 OK                                        │
│     { valid: true, nextHeartbeat: 600 }                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 Journey 4-8: Additional Journeys

Detailed sequences for remaining journeys follow the same pattern:

- **J4 (Multi-Device):** Activate same license on 2nd device, verify both active
- **J5 (Heartbeat Loop):** Send 3 consecutive heartbeats, verify session continuity
- **J6 (Concurrent Limits):** Attempt 4th device on 3-device license, expect rejection
- **J7 (Deactivation):** Deactivate device, verify slot freed, re-activate on new device
- **J8 (Subscription Lifecycle):** Simulate cancel webhook, verify grace period, then suspension

---

## 6. API Contract Tests

### 6.1 Contract Test Purpose

Contract tests validate that APIs:
- Accept valid requests
- Reject invalid requests with appropriate errors
- Return responses matching documented schemas
- Handle edge cases correctly

### 6.2 License API Contract

```javascript
// __tests__/e2e/contracts/license-api.test.js

describe('License API Contract', () => {
  describe('POST /api/license/validate', () => {
    test('accepts valid license key format', async () => {
      // MOUSE-XXXX-XXXX-XXXX-XXXX
    });

    test('rejects invalid license key format', async () => {
      // Expect: 400 Bad Request
    });

    test('returns 404 for non-existent license', async () => {
      // Valid format but doesn't exist
    });

    test('includes required response fields', async () => {
      // valid, status, maxDevices, expiresAt
    });
  });

  describe('POST /api/license/activate', () => {
    test('requires licenseKey field', async () => {});
    test('requires machineId field', async () => {});
    test('requires fingerprint field', async () => {});
    test('rejects duplicate activation', async () => {});
    test('respects maxDevices limit', async () => {});
  });

  describe('POST /api/license/heartbeat', () => {
    test('requires licenseKey field', async () => {});
    test('requires machineId field', async () => {});
    test('requires sessionId field', async () => {});
    test('enforces rate limit (10/min)', async () => {});
    test('returns nextHeartbeat interval', async () => {});
  });

  describe('DELETE /api/license/deactivate', () => {
    test('requires licenseKey field', async () => {});
    test('requires machineId field', async () => {});
    test('returns success for active device', async () => {});
    test('returns 404 for unknown device', async () => {});
  });
});
```

### 6.3 Webhook API Contract

```javascript
// __tests__/e2e/contracts/webhook-api.test.js

describe('Webhook API Contract', () => {
  describe('POST /api/webhooks/stripe', () => {
    test('rejects requests without signature header', async () => {
      // Expect: 401 Unauthorized
    });

    test('rejects invalid signature', async () => {
      // Expect: 401 Unauthorized
    });

    test('accepts valid checkout.session.completed', async () => {
      // With valid test signature
    });

    test('accepts valid customer.subscription.updated', async () => {});
    test('accepts valid customer.subscription.deleted', async () => {});
    test('ignores unknown event types gracefully', async () => {});
  });

  describe('POST /api/webhooks/keygen', () => {
    test('rejects requests without signature header', async () => {});
    test('accepts valid license.created event', async () => {});
    test('accepts valid license.suspended event', async () => {});
    test('accepts valid machine.heartbeat.dead event', async () => {});
  });
});
```

---

## 7. Architecture Tests

### 7.1 DynamoDB → SNS Propagation

**Purpose:** Verify that DynamoDB writes trigger SNS events for downstream consumers.

```javascript
// __tests__/e2e/architecture/dynamo-sns-propagation.test.js

describe('DynamoDB → SNS Propagation', () => {
  test('License creation publishes to SNS', async () => {
    // 1. Create license via API
    // 2. Poll SQS queue (subscribed to SNS topic)
    // 3. Verify event payload matches DynamoDB record
    // 4. Cleanup
  });

  test('License update publishes to SNS', async () => {
    // 1. Update license status
    // 2. Verify UPDATE event in SQS
  });

  test('Device activation publishes to SNS', async () => {
    // 1. Activate device
    // 2. Verify DEVICE_ACTIVATED event
  });

  test('Events arrive within SLA (< 5 seconds)', async () => {
    // Timing validation
  });
});
```

### 7.2 Webhook → Lambda → DynamoDB Flow

**Purpose:** Verify that webhooks trigger Lambdas that persist data correctly.

```javascript
// __tests__/e2e/architecture/webhook-lambda-flow.test.js

describe('Webhook → Lambda → DynamoDB', () => {
  test('Stripe checkout.session.completed creates license', async () => {
    // 1. POST webhook event
    // 2. Wait for Lambda execution (poll CloudWatch)
    // 3. Query DynamoDB for new license
    // 4. Verify all fields populated correctly
  });

  test('Stripe customer.subscription.deleted suspends license', async () => {
    // 1. Create active license
    // 2. POST subscription.deleted webhook
    // 3. Verify license status changed to 'suspended'
  });

  test('Lambda errors are logged to CloudWatch', async () => {
    // 1. POST malformed webhook
    // 2. Check CloudWatch for error log entry
  });
});
```

### 7.3 Event Ordering

**Purpose:** Verify that events are processed in correct order.

```javascript
// __tests__/e2e/architecture/event-ordering.test.js

describe('Event Ordering', () => {
  test('Multiple rapid updates maintain consistency', async () => {
    // 1. Send 5 rapid updates to same license
    // 2. Verify final state matches last update
    // 3. Verify all intermediate events captured
  });

  test('Cross-service events arrive in order', async () => {
    // 1. Stripe checkout → DynamoDB → SNS → Email Lambda
    // 2. Verify email Lambda received correct data
  });
});
```

---

## 8. Test Utilities

### 8.1 HTTP Client

```javascript
// __tests__/e2e/lib/http-client.js

import { getEnvironment } from '../config.js';

/**
 * Lightweight HTTP client for E2E tests.
 * Wraps fetch with environment-aware base URL and timeout.
 */
export class E2EHttpClient {
  constructor() {
    this.env = getEnvironment();
    this.baseUrl = this.env.apiBase;
    this.timeout = this.env.timeout;
  }

  async request(method, path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        data,
        ok: response.ok,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  get(path, options) { return this.request('GET', path, options); }
  post(path, body, options) { return this.request('POST', path, { ...options, body }); }
  put(path, body, options) { return this.request('PUT', path, { ...options, body }); }
  delete(path, options) { return this.request('DELETE', path, options); }
}

export const http = new E2EHttpClient();
```

### 8.2 Assertions

```javascript
// __tests__/e2e/lib/assertions.js

import { expect } from '../../../../dm/facade/test-helpers/index.js';

/**
 * E2E-specific assertions for API responses.
 */

export function expectStatus(response, expectedStatus) {
  expect(response.status).toBe(expectedStatus);
}

export function expectSuccess(response) {
  expect(response.ok).toBe(true);
}

export function expectError(response, expectedStatus, expectedMessage) {
  expect(response.status).toBe(expectedStatus);
  if (expectedMessage) {
    expect(response.data?.error || response.data?.message).toContain(expectedMessage);
  }
}

export function expectFields(data, requiredFields) {
  for (const field of requiredFields) {
    expect(data[field]).toBeDefined();
  }
}

export function expectLicenseKey(key) {
  expect(key).toMatch(/^MOUSE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
}
```

### 8.3 Test Data Generators

```javascript
// __tests__/e2e/lib/test-data.js

import { randomBytes } from 'crypto';

/**
 * Generate unique test data to avoid collisions.
 */

export function generateFingerprint() {
  return `e2e-fp-${randomBytes(8).toString('hex')}`;
}

export function generateMachineId() {
  return `e2e-mach-${randomBytes(8).toString('hex')}`;
}

export function generateSessionId() {
  return `e2e-sess-${randomBytes(8).toString('hex')}`;
}

export function generateTestEmail() {
  return `e2e-${Date.now()}@test.hic-ai.com`;
}

export function generateLicenseKeyBody() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let body = '';
  for (let i = 0; i < 12; i++) {
    body += chars[Math.floor(Math.random() * chars.length)];
  }
  return body;
}
```

### 8.4 Cleanup Utilities

```javascript
// __tests__/e2e/lib/cleanup.js

/**
 * Track and clean up test data after E2E runs.
 */

const testRecords = {
  trials: [],
  licenses: [],
  devices: [],
};

export function trackTrial(fingerprint) {
  testRecords.trials.push(fingerprint);
}

export function trackLicense(licenseKey) {
  testRecords.licenses.push(licenseKey);
}

export function trackDevice(licenseKey, machineId) {
  testRecords.devices.push({ licenseKey, machineId });
}

export async function cleanupAll() {
  // Clean up in reverse order of dependency
  for (const device of testRecords.devices) {
    await deactivateDevice(device.licenseKey, device.machineId);
  }
  
  for (const licenseKey of testRecords.licenses) {
    await deleteLicense(licenseKey);
  }
  
  for (const fingerprint of testRecords.trials) {
    await deleteTrial(fingerprint);
  }
  
  // Reset tracking
  testRecords.trials = [];
  testRecords.licenses = [];
  testRecords.devices = [];
}
```

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Workflow

```yaml
# .github/workflows/e2e-tests.yml

name: E2E Tests

on:
  push:
    branches: [development, main]
  pull_request:
    branches: [development]
  schedule:
    # Run daily at 6 AM UTC
    - cron: '0 6 * * *'

jobs:
  e2e-staging:
    runs-on: ubuntu-latest
    environment: staging
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        working-directory: plg-website
        
      - name: Run E2E tests against staging
        env:
          E2E_ENV: staging
          E2E_STRIPE_TEST_KEY: ${{ secrets.E2E_STRIPE_TEST_KEY }}
          E2E_KEYGEN_TEST_KEY: ${{ secrets.E2E_KEYGEN_TEST_KEY }}
        run: npm run test:e2e:staging
        working-directory: plg-website
        
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: plg-website/__tests__/e2e/results/
```

### 9.2 Pre-Production Gate

```yaml
# Part of deployment workflow
deploy-production:
  needs: [e2e-staging]
  if: github.ref == 'refs/heads/main'
  
  steps:
    - name: Gate check - E2E must pass
      run: |
        if [ "${{ needs.e2e-staging.result }}" != "success" ]; then
          echo "E2E tests failed - blocking production deploy"
          exit 1
        fi
```

---

## 10. Implementation Plan

### 10.1 Phase 1: Foundation (4-6h)

| Task | Est. | Description |
|------|------|-------------|
| Create directory structure | 30min | `__tests__/e2e/*` |
| Implement `config.js` | 1h | Environment configuration |
| Implement `http-client.js` | 1h | Fetch wrapper |
| Implement `assertions.js` | 1h | E2E assertions |
| Implement `test-data.js` | 30min | Data generators |
| Implement `cleanup.js` | 1h | Cleanup utilities |
| Add npm scripts | 30min | `test:e2e*` commands |

### 10.2 Phase 2: Journey Tests (8-12h)

| Task | Est. | Priority |
|------|------|----------|
| J1: Trial Start | 1.5h | P0 |
| J2: Purchase Flow | 2h | P0 |
| J3: License Activation | 1.5h | P0 |
| J4: Multi-Device | 1h | P1 |
| J5: Heartbeat Loop | 1h | P1 |
| J6: Concurrent Limits | 1h | P1 |
| J7: Deactivation | 1h | P2 |
| J8: Subscription Lifecycle | 2h | P2 |

### 10.3 Phase 3: Contract Tests (4-6h)

| Task | Est. |
|------|------|
| License API contracts | 2h |
| Checkout API contracts | 1h |
| Webhook API contracts | 2h |
| Portal API contracts | 1h |

### 10.4 Phase 4: Architecture Tests (4-6h)

| Task | Est. |
|------|------|
| DynamoDB → SNS propagation | 2h |
| Webhook → Lambda flow | 2h |
| Event ordering validation | 2h |

### 10.5 Phase 5: CI/CD Integration (2-4h)

| Task | Est. |
|------|------|
| GitHub Actions workflow | 1h |
| Secrets configuration | 30min |
| Production gate | 30min |
| Documentation | 1h |

---

## 11. Success Criteria

### 11.1 Functional Success

- [ ] All 8 user journeys pass in staging environment
- [ ] All API contracts validated
- [ ] DynamoDB → SNS propagation verified
- [ ] Webhook → Lambda flows confirmed
- [ ] Tests run successfully locally and in CI/CD

### 11.2 Non-Functional Success

- [ ] Test suite completes in < 5 minutes
- [ ] No flaky tests (100% reproducible)
- [ ] Clear error messages for failures
- [ ] Automatic cleanup of test data
- [ ] Documentation complete

### 11.3 Gate Criteria for Front-End Work

Before proceeding with front-end integration:

1. ✅ All P0 journeys passing (J1, J2, J3)
2. ✅ Stripe webhook flow verified
3. ✅ License activation/validation confirmed
4. ✅ Heartbeat mechanism working
5. ✅ CI/CD pipeline green

---

## 12. Appendices

### A. Related Documents

| Document | Purpose |
|----------|---------|
| [PLG_ROADMAP_v4.md](./PLG_ROADMAP_v4.md) | Master roadmap |
| [COMPLETION_PLAN_v1.md](./COMPLETION_PLAN_v1.md) | Near-term completion plan |
| [PRE_E2E_INFRASTRUCTURE_AND_WIRING_REQUIREMENTS.md](../20260127_PRE_E2E_INFRASTRUCTURE_AND_WIRING_REQUIREMENTS.md) | Infrastructure prerequisites |

### B. API Response Schemas

```typescript
// Trial Init Response
interface TrialInitResponse {
  trialToken: string;
  expiresAt: string;  // ISO 8601
  daysRemaining: number;
  status: 'active' | 'expired';
}

// License Validate Response
interface LicenseValidateResponse {
  valid: boolean;
  status: 'active' | 'suspended' | 'expired';
  maxDevices: number;
  currentDevices: number;
  expiresAt: string | null;
}

// License Activate Response
interface LicenseActivateResponse {
  activated: boolean;
  deviceCount: number;
  maxDevices: number;
  machineId: string;
}

// Heartbeat Response
interface HeartbeatResponse {
  valid: boolean;
  nextHeartbeat: number;  // seconds
  status: 'active' | 'warning' | 'expired';
}
```

### C. Test Environment URLs

| Environment | API Base | Stripe Mode |
|-------------|----------|-------------|
| Local | `http://localhost:3000/api` | Test |
| Staging | `https://staging.hic-ai.com/api` | Test |
| Production | `https://hic-ai.com/api` | Live (read-only) |

---

*Document generated: 2026-01-29*  
*Next review: After Phase 1 implementation*
