# PLG Backend & API Unit Testing Plan

**Date:** January 23, 2026  
**Status:** Planning Phase  
**Previous Commit:** `078e709` - Third-party SDK mock factories and injectable seams

---

## Executive Summary

This document provides a comprehensive plan for implementing unit tests across the entire PLG backend and API. The testing infrastructure is now in place with:

1. **HIC Custom Test Framework** (`dm/facade/test-helpers/`) - Jest-like testing utilities
2. **AWS SDK Mock Factories** (`dm/facade/helpers/`) - DynamoDB, SNS, SQS, S3, Lambda, etc.
3. **Third-Party SDK Mock Factories** (`dm/facade/helpers/`) - Stripe, Auth0, Keygen.sh
4. **Injectable Seams** in PLG lib files for dependency injection

---

## Testing Infrastructure Overview

### Test Framework Components

| Component        | Location                  | Purpose                                                      |
| ---------------- | ------------------------- | ------------------------------------------------------------ |
| `expect.js`      | `dm/facade/test-helpers/` | Jest-like assertions (`toBe`, `toEqual`, `toThrow`, etc.)    |
| `spy.js`         | `dm/facade/test-helpers/` | Function spies (`createSpy`, `mockResolvedValue`, etc.)      |
| `lifecycle.js`   | `dm/facade/test-helpers/` | Mock registry & auto-reset (`registerMock`, `resetAllMocks`) |
| `test-loader.js` | `dm/facade/utils/`        | ESM resolve hook for `hic-*-layer` imports                   |

### Mock Factories

#### AWS Services (via `hic-*-layer` interception)

- `createDynamoMock()` - DynamoDB document client
- `createSNSMock()` - SNS publishing
- `createSQSMock()` - SQS messaging
- `createS3Mock()` - S3 storage
- `createLambdaMock()` - Lambda invocation
- `createSFNMock()` - Step Functions
- `createSecretsMock()` - Secrets Manager
- `createSSMMock()` - SSM Parameter Store
- `createBedrockMock()` - Bedrock AI
- `createMetricsMock()` - CloudWatch Metrics

#### Third-Party Services (via injectable seams)

- `createStripeMock()` - Stripe payments
- `createAuth0Mock()` - Auth0 authentication
- `createKeygenMock()` - Keygen.sh licensing

---

## Test Organization Structure

```
plg-website/
├── __tests__/                    # Test root directory
│   ├── unit/                     # Unit tests
│   │   ├── api/                  # API route tests
│   │   │   ├── auth/
│   │   │   │   ├── callback.test.js
│   │   │   │   ├── login.test.js
│   │   │   │   └── logout.test.js
│   │   │   ├── billing/
│   │   │   │   ├── checkout.test.js
│   │   │   │   ├── portal.test.js
│   │   │   │   ├── webhook.test.js
│   │   │   │   └── subscription.test.js
│   │   │   ├── license/
│   │   │   │   ├── create.test.js
│   │   │   │   ├── validate.test.js
│   │   │   │   ├── activate.test.js
│   │   │   │   └── deactivate.test.js
│   │   │   └── user/
│   │   │       ├── profile.test.js
│   │   │       └── preferences.test.js
│   │   ├── lib/                  # Library module tests
│   │   │   ├── stripe.test.js
│   │   │   ├── keygen.test.js
│   │   │   └── auth0.test.js
│   │   ├── middleware/           # Middleware tests
│   │   │   └── middleware.test.js
│   │   └── hooks/                # React hook tests (if any)
│   ├── integration/              # Integration tests (future)
│   └── fixtures/                 # Test data fixtures
│       ├── users.js
│       ├── subscriptions.js
│       └── licenses.js
├── test-runner.js                # Custom test runner
└── test.config.js                # Test configuration
```

---

## Test Categories & Coverage Goals

### 1. API Route Tests

#### 1.1 Authentication Routes (`/api/auth/`)

| Route                | Method | Test Cases                                          |
| -------------------- | ------ | --------------------------------------------------- |
| `/api/auth/login`    | GET    | Redirect to Auth0, state parameter, return URL      |
| `/api/auth/callback` | GET    | Token exchange, session creation, user profile sync |
| `/api/auth/logout`   | GET    | Session destruction, Auth0 logout, redirect         |
| `/api/auth/me`       | GET    | Return current user, handle unauthenticated         |

**Dependencies:** Auth0Mock

#### 1.2 Billing Routes (`/api/billing/`)

| Route                       | Method | Test Cases                                                |
| --------------------------- | ------ | --------------------------------------------------------- |
| `/api/billing/checkout`     | POST   | Create checkout session, attach customer, handle errors   |
| `/api/billing/portal`       | POST   | Create portal session, verify customer ownership          |
| `/api/billing/webhook`      | POST   | Signature verification, event processing, idempotency     |
| `/api/billing/subscription` | GET    | Retrieve subscription status, handle missing subscription |

**Dependencies:** StripeMock, Auth0Mock, DynamoMock

#### 1.3 License Routes (`/api/license/`)

| Route                     | Method | Test Cases                                              |
| ------------------------- | ------ | ------------------------------------------------------- |
| `/api/license/create`     | POST   | Create license, attach to user, handle duplicate        |
| `/api/license/validate`   | POST   | Validate license key, check fingerprint, handle expired |
| `/api/license/activate`   | POST   | Activate device, check max devices, handle conflict     |
| `/api/license/deactivate` | POST   | Deactivate device, update machine count                 |
| `/api/license/heartbeat`  | POST   | Update last seen, handle stale license                  |
| `/api/license/checkout`   | POST   | Generate offline certificate                            |

**Dependencies:** KeygenMock, Auth0Mock, DynamoMock

#### 1.4 User Routes (`/api/user/`)

| Route                   | Method  | Test Cases                          |
| ----------------------- | ------- | ----------------------------------- |
| `/api/user/profile`     | GET/PUT | Retrieve/update profile, validation |
| `/api/user/preferences` | GET/PUT | Retrieve/update preferences         |

**Dependencies:** Auth0Mock, DynamoMock

### 2. Library Module Tests

#### 2.1 Stripe Library (`lib/stripe.js`)

| Function                     | Test Cases                                             |
| ---------------------------- | ------------------------------------------------------ |
| `createCheckoutSession`      | Valid params, missing params, with/without customer ID |
| `createPortalSession`        | Valid customer, invalid customer                       |
| `updateSubscriptionQuantity` | Increase/decrease seats, proration                     |
| `verifyWebhookSignature`     | Valid signature, invalid signature, expired            |

#### 2.2 Keygen Library (`lib/keygen.js`)

| Function           | Test Cases                                   |
| ------------------ | -------------------------------------------- |
| `createLicense`    | Valid policy, invalid policy, with metadata  |
| `getLicense`       | Existing license, non-existent license       |
| `validateLicense`  | Valid key, invalid key, expired, suspended   |
| `suspendLicense`   | Active license, already suspended            |
| `reinstateLicense` | Suspended license, not suspended             |
| `revokeLicense`    | Existing license, non-existent               |
| `activateDevice`   | Under limit, at limit, duplicate fingerprint |
| `deactivateDevice` | Existing device, non-existent                |
| `machineHeartbeat` | Active machine, inactive machine             |
| `checkoutLicense`  | Valid TTL, custom TTL                        |

#### 2.3 Auth0 Library (`lib/auth0.js`)

| Function              | Test Cases                                |
| --------------------- | ----------------------------------------- |
| `getAuth0Client`      | Returns client instance                   |
| `getSession`          | Authenticated, unauthenticated            |
| `getOrganizationId`   | Enterprise user, individual user          |
| `isEnterpriseUser`    | True for enterprise, false for individual |
| `getPlanType`         | OSS, individual, enterprise               |
| `getStripeCustomerId` | With ID, without ID                       |

### 3. Middleware Tests

#### 3.1 Route Protection (`middleware.js`)

| Scenario                       | Expected Behavior  |
| ------------------------------ | ------------------ |
| Public route (unauthenticated) | Allow through      |
| Portal route (authenticated)   | Allow through      |
| Portal route (unauthenticated) | Redirect to login  |
| Admin route (enterprise user)  | Allow through      |
| Admin route (individual user)  | Redirect to portal |
| Admin route (unauthenticated)  | Redirect to login  |

---

## Test File Template

```javascript
/**
 * Unit Tests: [Module Name]
 *
 * Tests for [description]
 */

import {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
} from "../../../dm/facade/test-helpers/index.js";
import {
  createStripeMock,
  createAuth0Mock,
  createKeygenMock,
  createMockSession,
  createMockSubscription,
} from "../../../dm/facade/helpers/index.js";

// Import module under test
import {
  functionUnderTest,
  __setClientForTests,
} from "../../src/lib/module.js";

describe("Module Name", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = createMockClient();
    __setClientForTests(mockClient);
  });

  afterEach(() => {
    mockClient.reset();
  });

  describe("functionUnderTest", () => {
    it("should handle success case", async () => {
      // Arrange
      mockClient.method.mockResolvedValue({ id: "test_123" });

      // Act
      const result = await functionUnderTest({ param: "value" });

      // Assert
      expect(result.id).toBe("test_123");
      expect(mockClient.method.called).toBe(true);
      expect(mockClient.method.calledWith({ param: "value" })).toBe(true);
    });

    it("should handle error case", async () => {
      // Arrange
      mockClient.method.mockRejectedValue(new Error("API Error"));

      // Act & Assert
      await expect(functionUnderTest({ param: "value" })).rejects.toThrow(
        "API Error",
      );
    });
  });
});
```

---

## Test Data Fixtures

### Users Fixture (`fixtures/users.js`)

```javascript
export const testUsers = {
  individualUser: {
    sub: "auth0|individual_user_123",
    email: "individual@example.com",
    "https://hic-ai.com/plan_type": "individual",
    "https://hic-ai.com/subscription_status": "active",
    "https://hic-ai.com/stripe_customer_id": "cus_individual_123",
  },
  enterpriseUser: {
    sub: "auth0|enterprise_user_123",
    email: "enterprise@example.com",
    "https://hic-ai.com/plan_type": "enterprise",
    "https://hic-ai.com/subscription_status": "active",
    "https://hic-ai.com/stripe_customer_id": "cus_enterprise_123",
    "https://hic-ai.com/org_id": "org_acme_123",
  },
  expiredUser: {
    sub: "auth0|expired_user_123",
    email: "expired@example.com",
    "https://hic-ai.com/plan_type": "individual",
    "https://hic-ai.com/subscription_status": "past_due",
    "https://hic-ai.com/stripe_customer_id": "cus_expired_123",
  },
};
```

### Subscriptions Fixture (`fixtures/subscriptions.js`)

```javascript
export const testSubscriptions = {
  activeMonthly: {
    id: "sub_active_monthly",
    status: "active",
    current_period_end: Math.floor(Date.now() / 1000) + 2592000,
    items: {
      data: [{ price: { id: "price_individual_monthly" }, quantity: 1 }],
    },
  },
  activeAnnual: {
    id: "sub_active_annual",
    status: "active",
    current_period_end: Math.floor(Date.now() / 1000) + 31536000,
    items: {
      data: [{ price: { id: "price_individual_annual" }, quantity: 1 }],
    },
  },
  pastDue: {
    id: "sub_past_due",
    status: "past_due",
    current_period_end: Math.floor(Date.now() / 1000) - 86400,
    items: {
      data: [{ price: { id: "price_individual_monthly" }, quantity: 1 }],
    },
  },
  enterpriseSeats: {
    id: "sub_enterprise_seats",
    status: "active",
    current_period_end: Math.floor(Date.now() / 1000) + 2592000,
    items: {
      data: [{ price: { id: "price_enterprise_100" }, quantity: 50 }],
    },
  },
};
```

### Licenses Fixture (`fixtures/licenses.js`)

```javascript
export const testLicenses = {
  activeLicense: {
    id: "lic_active_123",
    key: "ABCD-EFGH-IJKL-MNOP",
    status: "ACTIVE",
    maxMachines: 3,
    uses: 1,
    metadata: { email: "user@example.com" },
  },
  expiredLicense: {
    id: "lic_expired_123",
    key: "QRST-UVWX-YZAB-CDEF",
    status: "EXPIRED",
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    maxMachines: 3,
  },
  suspendedLicense: {
    id: "lic_suspended_123",
    key: "GHIJ-KLMN-OPQR-STUV",
    status: "SUSPENDED",
    maxMachines: 3,
  },
  atLimitLicense: {
    id: "lic_at_limit_123",
    key: "WXYZ-1234-5678-90AB",
    status: "ACTIVE",
    maxMachines: 3,
    uses: 3,
  },
};
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] Create test runner configuration
- [ ] Set up test directory structure
- [ ] Create test fixtures
- [ ] Implement first lib tests (stripe.js)

### Phase 2: Core Library Tests (Week 2)

- [ ] Complete stripe.js tests
- [ ] Complete keygen.js tests
- [ ] Complete auth0.js tests
- [ ] Middleware tests

### Phase 3: API Route Tests - Auth (Week 3)

- [ ] /api/auth/login tests
- [ ] /api/auth/callback tests
- [ ] /api/auth/logout tests
- [ ] /api/auth/me tests

### Phase 4: API Route Tests - Billing (Week 4)

- [ ] /api/billing/checkout tests
- [ ] /api/billing/portal tests
- [ ] /api/billing/webhook tests
- [ ] /api/billing/subscription tests

### Phase 5: API Route Tests - License (Week 5)

- [ ] /api/license/create tests
- [ ] /api/license/validate tests
- [ ] /api/license/activate tests
- [ ] /api/license/deactivate tests
- [ ] /api/license/heartbeat tests
- [ ] /api/license/checkout tests

### Phase 6: API Route Tests - User (Week 6)

- [ ] /api/user/profile tests
- [ ] /api/user/preferences tests
- [ ] Coverage report generation
- [ ] Documentation update

---

## Coverage Goals

| Category        | Target Coverage |
| --------------- | --------------- |
| Library modules | 90%             |
| API routes      | 85%             |
| Middleware      | 95%             |
| Overall         | 85%             |

---

## Test Runner Configuration

### `test-runner.js`

```javascript
#!/usr/bin/env node
/**
 * PLG Unit Test Runner
 * Uses HIC custom testing framework
 */

import { glob } from "glob";
import { pathToFileURL } from "url";

async function runTests() {
  const testFiles = await glob("__tests__/unit/**/*.test.js");

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const file of testFiles) {
    try {
      console.log(`\nRunning: ${file}`);
      await import(pathToFileURL(file).href);
      passed++;
    } catch (error) {
      failed++;
      failures.push({ file, error });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach(({ file, error }) => {
      console.log(`  ${file}: ${error.message}`);
    });
    process.exit(1);
  }
}

runTests();
```

### `package.json` script addition

```json
{
  "scripts": {
    "test": "node --loader ./dm/facade/utils/test-loader.js test-runner.js",
    "test:unit": "node --loader ./dm/facade/utils/test-loader.js test-runner.js",
    "test:coverage": "c8 npm run test"
  }
}
```

---

## Success Criteria

1. **All library modules have comprehensive tests** covering:
   - Happy path scenarios
   - Error handling
   - Edge cases
   - Parameter validation

2. **All API routes have tests** for:
   - Authentication/authorization
   - Request validation
   - Response format
   - Error responses
   - Status codes

3. **Middleware tests** cover:
   - All route patterns
   - User role combinations
   - Redirect logic

4. **Test infrastructure** provides:
   - Easy mock setup/teardown
   - Clear test output
   - CI/CD integration ready

---

## Next Steps

1. Review this plan and prioritize specific areas
2. Set up the test directory structure
3. Create the test runner and configuration
4. Begin implementing Phase 1 tests
5. Iterate based on findings

---

_Document prepared for PLG Backend Unit Testing Initiative_
