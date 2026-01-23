# PLG Integration Tests

This directory contains integration tests that test multiple components working together.

## Scope

Integration tests verify:

- Complete user journeys (signup → subscription → license activation)
- Webhook processing flows
- Cross-service communication (Stripe → DynamoDB → Keygen)

## Running Tests

```bash
# Interactive mode
./scripts/debug-tests.sh

# Direct execution
node --loader ../dm/facade/utils/test-loader.js --test __tests__/integration/*.test.js
```

## Note

Integration tests may require more complex mock setup and should be run separately from unit tests during development.
