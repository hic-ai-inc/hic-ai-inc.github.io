/**
 * Library Index Tests
 *
 * Tests the index.js barrel export that re-exports lib modules.
 *
 * Behaviors tested:
 * - Exports from auth module
 * - Exports from stripe module
 * - Exports from constants module
 */

import {
  describe,
  it,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";

import * as lib from "../../../src/lib/index.js";

describe("lib/index.js", () => {
  describe("auth exports", () => {
    it("should export AuthError", () => {
      expect(lib.AuthError).toBeDefined();
      expect(typeof lib.AuthError).toBe("function");
    });

    it("should export getCustomerId", () => {
      expect(lib.getCustomerId).toBeDefined();
      expect(typeof lib.getCustomerId).toBe("function");
    });

    it("should export getOrgId", () => {
      expect(lib.getOrgId).toBeDefined();
      expect(typeof lib.getOrgId).toBe("function");
    });

    it("should export getAccountType", () => {
      expect(lib.getAccountType).toBeDefined();
      expect(typeof lib.getAccountType).toBe("function");
    });

    it("should export isBillingContact", () => {
      expect(lib.isBillingContact).toBeDefined();
      expect(typeof lib.isBillingContact).toBe("function");
    });

    it("should export isAdmin", () => {
      expect(lib.isAdmin).toBeDefined();
      expect(typeof lib.isAdmin).toBe("function");
    });

    it("should export validateReturnTo", () => {
      expect(lib.validateReturnTo).toBeDefined();
      expect(typeof lib.validateReturnTo).toBe("function");
    });
  });

  describe("stripe exports", () => {
    it("should export getStripeClient", () => {
      expect(lib.getStripeClient).toBeDefined();
      expect(typeof lib.getStripeClient).toBe("function");
    });

    it("should export createCheckoutSession", () => {
      expect(lib.createCheckoutSession).toBeDefined();
      expect(typeof lib.createCheckoutSession).toBe("function");
    });

    it("should export createPortalSession", () => {
      expect(lib.createPortalSession).toBeDefined();
      expect(typeof lib.createPortalSession).toBe("function");
    });

    it("should export updateSubscriptionQuantity", () => {
      expect(lib.updateSubscriptionQuantity).toBeDefined();
      expect(typeof lib.updateSubscriptionQuantity).toBe("function");
    });

    it("should export verifyWebhookSignature", () => {
      expect(lib.verifyWebhookSignature).toBeDefined();
      expect(typeof lib.verifyWebhookSignature).toBe("function");
    });

    it("should export STRIPE_PRODUCTS", () => {
      expect(lib.STRIPE_PRODUCTS).toBeDefined();
      expect(typeof lib.STRIPE_PRODUCTS).toBe("object");
    });

    it("should export STRIPE_COUPONS", () => {
      expect(lib.STRIPE_COUPONS).toBeDefined();
      expect(typeof lib.STRIPE_COUPONS).toBe("object");
    });
  });

  describe("constants exports", () => {
    it("should export PRICING", () => {
      expect(lib.PRICING).toBeDefined();
      expect(typeof lib.PRICING).toBe("object");
    });

    it("should export LICENSE_STATUS", () => {
      expect(lib.LICENSE_STATUS).toBeDefined();
      expect(typeof lib.LICENSE_STATUS).toBe("object");
    });

    it("should export LICENSE_STATUS_DISPLAY", () => {
      expect(lib.LICENSE_STATUS_DISPLAY).toBeDefined();
      expect(typeof lib.LICENSE_STATUS_DISPLAY).toBe("object");
    });

    it("should export NAV_LINKS", () => {
      expect(lib.NAV_LINKS).toBeDefined();
      expect(Array.isArray(lib.NAV_LINKS)).toBe(true);
    });

    it("should export PORTAL_NAV", () => {
      expect(lib.PORTAL_NAV).toBeDefined();
      expect(Array.isArray(lib.PORTAL_NAV)).toBe(true);
    });

    it("should export EXTERNAL_URLS", () => {
      expect(lib.EXTERNAL_URLS).toBeDefined();
      expect(typeof lib.EXTERNAL_URLS).toBe("object");
    });

    it("should export AUTH_NAMESPACE", () => {
      expect(lib.AUTH_NAMESPACE).toBeDefined();
      expect(typeof lib.AUTH_NAMESPACE).toBe("string");
    });

    it("should export APP_NAME", () => {
      expect(lib.APP_NAME).toBeDefined();
      expect(lib.APP_NAME).toBe("Mouse");
    });
  });
});
