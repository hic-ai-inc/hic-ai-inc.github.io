/**
 * Subscription Test Fixtures
 *
 * Provides consistent Stripe subscription data for testing.
 * Structures match Stripe API response formats.
 */

const NOW = Math.floor(Date.now() / 1000);
const ONE_DAY = 86400;
const ONE_MONTH = 30 * ONE_DAY;
const ONE_YEAR = 365 * ONE_DAY;

/**
 * Active monthly individual subscription
 */
export const activeMonthly = {
  id: "sub_active_monthly_123",
  object: "subscription",
  status: "active",
  customer: "cus_individual_123",
  current_period_start: NOW - 15 * ONE_DAY,
  current_period_end: NOW + 15 * ONE_DAY,
  cancel_at_period_end: false,
  canceled_at: null,
  items: {
    object: "list",
    data: [
      {
        id: "si_monthly_123",
        object: "subscription_item",
        price: {
          id: "price_individual_monthly",
          product: "prod_individual_123",
          unit_amount: 2900, // $29.00
          currency: "usd",
          recurring: {
            interval: "month",
            interval_count: 1,
          },
        },
        quantity: 1,
      },
    ],
  },
  metadata: {},
  default_payment_method: "pm_card_visa_123",
};

/**
 * Active annual individual subscription
 */
export const activeAnnual = {
  id: "sub_active_annual_123",
  object: "subscription",
  status: "active",
  customer: "cus_annual_123",
  current_period_start: NOW - 6 * ONE_MONTH,
  current_period_end: NOW + 6 * ONE_MONTH,
  cancel_at_period_end: false,
  canceled_at: null,
  items: {
    object: "list",
    data: [
      {
        id: "si_annual_123",
        object: "subscription_item",
        price: {
          id: "price_individual_annual",
          product: "prod_individual_123",
          unit_amount: 29000, // $290.00
          currency: "usd",
          recurring: {
            interval: "year",
            interval_count: 1,
          },
        },
        quantity: 1,
      },
    ],
  },
  metadata: {},
  default_payment_method: "pm_card_visa_456",
};

/**
 * Enterprise subscription with seat-based pricing
 */
export const enterpriseSeats = {
  id: "sub_enterprise_123",
  object: "subscription",
  status: "active",
  customer: "cus_enterprise_123",
  current_period_start: NOW - 20 * ONE_DAY,
  current_period_end: NOW + 10 * ONE_DAY,
  cancel_at_period_end: false,
  canceled_at: null,
  items: {
    object: "list",
    data: [
      {
        id: "si_enterprise_123",
        object: "subscription_item",
        price: {
          id: "price_enterprise_100",
          product: "prod_enterprise_123",
          unit_amount: 2500, // $25.00 per seat
          currency: "usd",
          recurring: {
            interval: "month",
            interval_count: 1,
          },
        },
        quantity: 50, // 50 seats
      },
    ],
  },
  metadata: {
    org_id: "org_acme_123",
    max_seats: "100",
  },
  default_payment_method: "pm_card_mastercard_123",
};

/**
 * Past due subscription (payment failed)
 */
export const pastDue = {
  id: "sub_past_due_123",
  object: "subscription",
  status: "past_due",
  customer: "cus_expired_123",
  current_period_start: NOW - ONE_MONTH - 5 * ONE_DAY,
  current_period_end: NOW - 5 * ONE_DAY,
  cancel_at_period_end: false,
  canceled_at: null,
  items: {
    object: "list",
    data: [
      {
        id: "si_past_due_123",
        object: "subscription_item",
        price: {
          id: "price_individual_monthly",
          product: "prod_individual_123",
          unit_amount: 2900,
          currency: "usd",
          recurring: {
            interval: "month",
            interval_count: 1,
          },
        },
        quantity: 1,
      },
    ],
  },
  metadata: {},
  default_payment_method: "pm_card_declined_123",
};

/**
 * Cancelled subscription (access until period end)
 */
export const cancelled = {
  id: "sub_cancelled_123",
  object: "subscription",
  status: "active", // Still active until period ends
  customer: "cus_cancelled_123",
  current_period_start: NOW - 20 * ONE_DAY,
  current_period_end: NOW + 10 * ONE_DAY,
  cancel_at_period_end: true, // Will cancel at period end
  canceled_at: NOW - 5 * ONE_DAY,
  items: {
    object: "list",
    data: [
      {
        id: "si_cancelled_123",
        object: "subscription_item",
        price: {
          id: "price_individual_monthly",
          product: "prod_individual_123",
          unit_amount: 2900,
          currency: "usd",
          recurring: {
            interval: "month",
            interval_count: 1,
          },
        },
        quantity: 1,
      },
    ],
  },
  metadata: {
    cancellation_reason: "user_requested",
  },
  default_payment_method: "pm_card_visa_cancelled",
};

/**
 * Trialing subscription (new user in trial period)
 */
export const trialing = {
  id: "sub_trialing_123",
  object: "subscription",
  status: "trialing",
  customer: "cus_trialing_123",
  current_period_start: NOW - 7 * ONE_DAY,
  current_period_end: NOW + 7 * ONE_DAY,
  trial_start: NOW - 7 * ONE_DAY,
  trial_end: NOW + 7 * ONE_DAY,
  cancel_at_period_end: false,
  canceled_at: null,
  items: {
    object: "list",
    data: [
      {
        id: "si_trialing_123",
        object: "subscription_item",
        price: {
          id: "price_individual_monthly",
          product: "prod_individual_123",
          unit_amount: 2900,
          currency: "usd",
          recurring: {
            interval: "month",
            interval_count: 1,
          },
        },
        quantity: 1,
      },
    ],
  },
  metadata: {},
  default_payment_method: null, // No payment method during trial
};

/**
 * All test subscriptions exported as a collection
 */
export const testSubscriptions = {
  activeMonthly,
  activeAnnual,
  enterpriseSeats,
  pastDue,
  cancelled,
  trialing,
};

/**
 * Create a checkout session fixture
 */
export function createCheckoutSession(overrides = {}) {
  return {
    id: `cs_test_${Date.now()}`,
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    customer: "cus_new_123",
    subscription: "sub_new_123",
    url: null,
    success_url:
      "https://mouse.hic-ai.com/portal?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://mouse.hic-ai.com/pricing",
    metadata: {},
    ...overrides,
  };
}

/**
 * Create a billing portal session fixture
 */
export function createPortalSession(overrides = {}) {
  return {
    id: `bps_test_${Date.now()}`,
    object: "billing_portal.session",
    customer: "cus_individual_123",
    return_url: "https://mouse.hic-ai.com/portal",
    url: `https://billing.stripe.com/p/session/test_${Date.now()}`,
    ...overrides,
  };
}

export default testSubscriptions;
