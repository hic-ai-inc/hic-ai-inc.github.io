# PLG Unit Tests - API Routes

This directory contains unit tests for PLG API endpoints:

## Directory Structure

```
api/
├── auth/           # Authentication endpoints
│   ├── login.test.js
│   ├── callback.test.js
│   └── logout.test.js
├── billing/        # Billing/subscription endpoints
│   ├── checkout.test.js
│   ├── portal.test.js
│   ├── webhook.test.js
│   └── subscription.test.js
├── license/        # License management endpoints
│   ├── create.test.js
│   ├── validate.test.js
│   ├── activate.test.js
│   └── deactivate.test.js
└── user/           # User profile endpoints
    ├── profile.test.js
    └── preferences.test.js
```

## Running Tests

```bash
# Interactive mode
./scripts/debug-tests.sh

# Run all API tests
node --loader ../dm/facade/utils/test-loader.js --test __tests__/unit/api/**/*.test.js

# Run specific category
node --loader ../dm/facade/utils/test-loader.js --test __tests__/unit/api/billing/*.test.js
```
