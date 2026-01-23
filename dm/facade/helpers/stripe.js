/**
 * Stripe Mock Factory
 *
 * Provides mock implementations for Stripe SDK operations used in PLG.
 * Follows the same pattern as other HIC mock factories (createDynamoMock, etc.)
 *
 * @see dm/facade/helpers/dynamodb.js for pattern reference
 */

import { createSpy } from "../test-helpers/spy.js";

/**
 * Create a mock Stripe client with all methods used in PLG
 *
 * Usage:
 *   import { createStripeMock } from 'hic-test-helpers';
 *   const stripeMock = createStripeMock();
 *
 *   // Configure mock responses
 *   stripeMock.customers.create.mockResolvedValue({ id: 'cus_123' });
 *   stripeMock.checkout.sessions.create.mockResolvedValue({ id: 'cs_123', url: 'https://...' });
 *
 *   // Inject into module under test
 *   __setStripeClientForTests(stripeMock);
 *
 * @returns {Object} Mock Stripe client with spied methods
 */
export function createStripeMock() {
  const mock = {
    // Customer operations
    customers: {
      create: createSpy("stripe.customers.create"),
      retrieve: createSpy("stripe.customers.retrieve"),
      update: createSpy("stripe.customers.update"),
      del: createSpy("stripe.customers.del"),
      list: createSpy("stripe.customers.list"),
    },

    // Subscription operations
    subscriptions: {
      create: createSpy("stripe.subscriptions.create"),
      retrieve: createSpy("stripe.subscriptions.retrieve"),
      update: createSpy("stripe.subscriptions.update"),
      cancel: createSpy("stripe.subscriptions.cancel"),
      list: createSpy("stripe.subscriptions.list"),
    },

    // Checkout operations (used in createCheckoutSession)
    checkout: {
      sessions: {
        create: createSpy("stripe.checkout.sessions.create"),
        retrieve: createSpy("stripe.checkout.sessions.retrieve"),
        list: createSpy("stripe.checkout.sessions.list"),
        expire: createSpy("stripe.checkout.sessions.expire"),
      },
    },

    // Billing Portal operations (used in createPortalSession)
    billingPortal: {
      sessions: {
        create: createSpy("stripe.billingPortal.sessions.create"),
      },
    },

    // Webhook verification (used in verifyWebhookSignature)
    webhooks: {
      constructEvent: createSpy("stripe.webhooks.constructEvent"),
    },

    // Prices operations
    prices: {
      create: createSpy("stripe.prices.create"),
      retrieve: createSpy("stripe.prices.retrieve"),
      update: createSpy("stripe.prices.update"),
      list: createSpy("stripe.prices.list"),
    },

    // Products operations
    products: {
      create: createSpy("stripe.products.create"),
      retrieve: createSpy("stripe.products.retrieve"),
      update: createSpy("stripe.products.update"),
      list: createSpy("stripe.products.list"),
    },

    // Invoice operations
    invoices: {
      create: createSpy("stripe.invoices.create"),
      retrieve: createSpy("stripe.invoices.retrieve"),
      list: createSpy("stripe.invoices.list"),
      pay: createSpy("stripe.invoices.pay"),
      voidInvoice: createSpy("stripe.invoices.voidInvoice"),
      upcoming: createSpy("stripe.invoices.upcoming"),
    },

    // Payment Intent operations
    paymentIntents: {
      create: createSpy("stripe.paymentIntents.create"),
      retrieve: createSpy("stripe.paymentIntents.retrieve"),
      confirm: createSpy("stripe.paymentIntents.confirm"),
      cancel: createSpy("stripe.paymentIntents.cancel"),
    },

    // Payment Method operations
    paymentMethods: {
      create: createSpy("stripe.paymentMethods.create"),
      retrieve: createSpy("stripe.paymentMethods.retrieve"),
      attach: createSpy("stripe.paymentMethods.attach"),
      detach: createSpy("stripe.paymentMethods.detach"),
      list: createSpy("stripe.paymentMethods.list"),
    },

    // Coupon operations
    coupons: {
      create: createSpy("stripe.coupons.create"),
      retrieve: createSpy("stripe.coupons.retrieve"),
      del: createSpy("stripe.coupons.del"),
      list: createSpy("stripe.coupons.list"),
    },
  };

  // Attach helper methods for test setup
  mock.reset = () => {
    resetNestedSpies(mock);
  };

  return mock;
}

/**
 * Recursively reset all spies in a nested object
 */
function resetNestedSpies(obj) {
  for (const key in obj) {
    const val = obj[key];
    if (typeof val === "function" && typeof val.reset === "function") {
      val.reset();
    } else if (val && typeof val === "object" && key !== "reset") {
      resetNestedSpies(val);
    }
  }
}

/**
 * Create mock Stripe webhook event for testing
 *
 * @param {string} type - Event type (e.g., 'checkout.session.completed')
 * @param {Object} data - Event data object
 * @param {Object} options - Additional event options
 * @returns {Object} Mock Stripe event
 */
export function createMockStripeEvent(type, data, options = {}) {
  return {
    id: options.id || `evt_test_${Date.now()}`,
    object: "event",
    api_version: options.apiVersion || "2024-12-18.acacia",
    created: options.created || Math.floor(Date.now() / 1000),
    type,
    data: {
      object: data,
    },
    livemode: options.livemode ?? false,
    pending_webhooks: options.pendingWebhooks || 1,
    request: {
      id: options.requestId || `req_test_${Date.now()}`,
      idempotency_key: options.idempotencyKey || null,
    },
  };
}

/**
 * Create mock Stripe checkout session for testing
 */
export function createMockCheckoutSession(overrides = {}) {
  return {
    id: `cs_test_${Date.now()}`,
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    customer: "cus_test_123",
    subscription: "sub_test_123",
    url: null,
    success_url: "https://example.com/success",
    cancel_url: "https://example.com/cancel",
    metadata: {},
    ...overrides,
  };
}

/**
 * Create mock Stripe subscription for testing
 */
export function createMockSubscription(overrides = {}) {
  return {
    id: `sub_test_${Date.now()}`,
    object: "subscription",
    status: "active",
    customer: "cus_test_123",
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // +30 days
    items: {
      object: "list",
      data: [
        {
          id: "si_test_123",
          object: "subscription_item",
          price: {
            id: "price_test_123",
            product: "prod_test_123",
          },
          quantity: 1,
        },
      ],
    },
    metadata: {},
    ...overrides,
  };
}

/**
 * Create mock Stripe customer for testing
 */
export function createMockCustomer(overrides = {}) {
  return {
    id: `cus_test_${Date.now()}`,
    object: "customer",
    email: "test@example.com",
    name: "Test Customer",
    metadata: {},
    subscriptions: {
      object: "list",
      data: [],
    },
    ...overrides,
  };
}
