# PLG Unit Tests - Library Modules

This directory contains unit tests for PLG library modules:

- `stripe.test.js` - Stripe payment operations
- `keygen.test.js` - Keygen license management
- `auth0.test.js` - Auth0 authentication wrapper

## Running Tests

```bash
# Interactive mode
./scripts/debug-tests.sh

# Direct execution
node --loader ../dm/facade/utils/test-loader.js --test __tests__/unit/lib/*.test.js
```

## Test Pattern

Each test file follows this structure:

```javascript
import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";
import { createStripeMock } from "../../../../dm/facade/helpers/index.js";
import { testUsers, testSubscriptions } from "../../fixtures/index.js";

// Import module under test
import {
  functionUnderTest,
  __setClientForTests,
} from "../../../src/lib/module.js";

describe("Module Name", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = createMockClient();
    __setClientForTests(mockClient);
  });

  afterEach(() => {
    mockClient.reset();
  });

  // Tests...
});
```
