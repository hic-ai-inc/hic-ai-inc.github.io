# PLG Unit Tests - Middleware

This directory contains unit tests for PLG middleware:

- `middleware.test.js` - Route protection and authentication middleware

## Test Scenarios

1. **Public routes** - Unauthenticated access allowed
2. **Portal routes** - Require authentication
3. **Admin routes** - Require authentication + enterprise organization
4. **Auth0 middleware** - Session handling and redirects

## Running Tests

```bash
# Interactive mode
./scripts/debug-tests.sh

# Direct execution
node --loader ../dm/facade/utils/test-loader.js --test __tests__/unit/middleware/*.test.js
```
