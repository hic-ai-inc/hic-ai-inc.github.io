/**
 * Constants Module Tests
 *
 * Tests the constants.js module that provides application-wide configuration.
 * These tests verify the structure and values of pricing, license status,
 * and other critical constants.
 *
 * Behaviors tested:
 * - PRICING tier structure and values
 * - PROMO_CODES structure
 * - LICENSE_STATUS values
 * - LICENSE_STATUS_DISPLAY mapping
 * - STRIPE_PRICES structure
 * - Navigation constants
 * - External URLs
 */

import {
  describe,
  it,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";

import {
  PRICING,
  PROMO_CODES,
  LICENSE_STATUS,
  LICENSE_STATUS_DISPLAY,
  STRIPE_PRICES,
  NAV_LINKS,
  PORTAL_NAV,
  PORTAL_NAV_BUSINESS,
  EXTERNAL_URLS,
  MARKETPLACE_ENABLED,
  AUTH_NAMESPACE,
  APP_NAME,
  APP_DESCRIPTION,
  COMPANY_NAME,
  DEFAULT_MAX_DEVICES,
  DEVICE_ACTIVITY_WINDOW_HOURS,
  DEVICE_ACTIVITY_WINDOW_MS,
  getMaxDevicesForAccountType,
  EVENT_TYPES,
} from "../../../src/lib/constants.js";

describe("constants.js", () => {
  describe("Device policy constants", () => {
    it("should define default max devices as 3", () => {
      expect(DEFAULT_MAX_DEVICES).toBe(3);
    });

    it("should define activity window as 2 hours", () => {
      expect(DEVICE_ACTIVITY_WINDOW_HOURS).toBe(2);
      expect(DEVICE_ACTIVITY_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
    });

    it("should resolve individual max devices from shared helper", () => {
      expect(getMaxDevicesForAccountType("individual")).toBe(3);
    });

    it("should resolve business max devices from shared helper", () => {
      expect(getMaxDevicesForAccountType("business")).toBe(5);
    });

    it("should fallback to default max devices for unknown account type", () => {
      expect(getMaxDevicesForAccountType("unknown")).toBe(3);
      expect(getMaxDevicesForAccountType(undefined)).toBe(3);
    });
  });

  describe("MAX_PAYMENT_FAILURES", () => {
    it("should not be exported from constants (Requirement 4.8)", async () => {
      const constants = await import("../../../src/lib/constants.js");
      expect(constants.MAX_PAYMENT_FAILURES).toBeUndefined();
    });
  });

  describe("PRICING", () => {
    describe("individual tier", () => {
      it("should have id of individual", () => {
        expect(PRICING.individual.id).toBe("individual");
      });

      it("should have monthly price of $15", () => {
        expect(PRICING.individual.priceMonthly).toBe(15);
      });

      it("should have annual price of $150 (2 months free)", () => {
        expect(PRICING.individual.priceAnnual).toBe(150);
      });

      it("should have 1 seat", () => {
        expect(PRICING.individual.seats).toBe(1);
      });

      it("should allow 3 concurrent machines", () => {
        expect(PRICING.individual.maxConcurrentMachines).toBe(3);
      });

      it("should have 14-day trial", () => {
        expect(PRICING.individual.trialDays).toBe(14);
      });

      it("should not require card for trial", () => {
        expect(PRICING.individual.requiresCard).toBe(false);
      });

      it("should have features array", () => {
        expect(Array.isArray(PRICING.individual.features)).toBe(true);
        expect(PRICING.individual.features.length).toBeGreaterThan(0);
      });
    });

    describe("business tier", () => {
      it("should have id of business", () => {
        expect(PRICING.business.id).toBe("business");
      });

      it("should have price per seat of $35", () => {
        expect(PRICING.business.pricePerSeat).toBe(35);
      });

      it("should have minimum of 1 seat", () => {
        expect(PRICING.business.minSeats).toBe(1);
      });

      it("should allow 5 concurrent machines per seat", () => {
        expect(PRICING.business.maxConcurrentMachinesPerSeat).toBe(5);
      });

      it("should have 14-day trial", () => {
        expect(PRICING.business.trialDays).toBe(14);
      });

      it("should not require card for trial", () => {
        expect(PRICING.business.requiresCard).toBe(false);
      });

      it("should have volume discounts", () => {
        expect(PRICING.business.volumeDiscounts).toBeDefined();
        expect(PRICING.business.volumeDiscounts[50]).toBe(0.1);
        expect(PRICING.business.volumeDiscounts[100]).toBe(0.15);
        expect(PRICING.business.volumeDiscounts[500]).toBe(0.2);
      });

      it("should have features array", () => {
        expect(Array.isArray(PRICING.business.features)).toBe(true);
        expect(PRICING.business.features.length).toBeGreaterThan(0);
      });
    });
  });

  describe("PROMO_CODES", () => {
    it("should have EARLYADOPTER20 code", () => {
      expect(PROMO_CODES.EARLYADOPTER20).toBeDefined();
      expect(PROMO_CODES.EARLYADOPTER20.code).toBe("EARLYADOPTER20");
      expect(PROMO_CODES.EARLYADOPTER20.discount).toBe(0.2);
    });

    it("should have STUDENT50 code", () => {
      expect(PROMO_CODES.STUDENT50).toBeDefined();
      expect(PROMO_CODES.STUDENT50.code).toBe("STUDENT50");
      expect(PROMO_CODES.STUDENT50.discount).toBe(0.5);
      expect(PROMO_CODES.STUDENT50.requiresVerification).toBe(true);
    });

    it("should have NONPROFIT40 code", () => {
      expect(PROMO_CODES.NONPROFIT40).toBeDefined();
      expect(PROMO_CODES.NONPROFIT40.code).toBe("NONPROFIT40");
      expect(PROMO_CODES.NONPROFIT40.discount).toBe(0.4);
      expect(PROMO_CODES.NONPROFIT40.requiresVerification).toBe(true);
    });

    it("EARLYADOPTER20 should apply to both individual and business", () => {
      expect(PROMO_CODES.EARLYADOPTER20.applicableTiers).toContain(
        "individual",
      );
      expect(PROMO_CODES.EARLYADOPTER20.applicableTiers).toContain("business");
    });

    it("STUDENT50 should only apply to individual", () => {
      expect(PROMO_CODES.STUDENT50.applicableTiers).toContain("individual");
      expect(PROMO_CODES.STUDENT50.applicableTiers).not.toContain("business");
    });
  });

  describe("LICENSE_STATUS", () => {
    it("should have PENDING_ACCOUNT status", () => {
      expect(LICENSE_STATUS.PENDING_ACCOUNT).toBe("pending_account");
    });

    it("should NOT have TRIAL status (Task 11.0 — dead code removed)", () => {
      expect(LICENSE_STATUS.TRIAL).toBeUndefined();
    });

    it("should have ACTIVE status", () => {
      expect(LICENSE_STATUS.ACTIVE).toBe("active");
    });

    it("should have PAST_DUE status", () => {
      expect(LICENSE_STATUS.PAST_DUE).toBe("past_due");
    });

    it("should have CANCELED status", () => {
      expect(LICENSE_STATUS.CANCELED).toBe("canceled");
    });

    it("should have EXPIRED status", () => {
      expect(LICENSE_STATUS.EXPIRED).toBe("expired");
    });

    it("should NOT have RETIRED status (Fix 6 — dead code removed)", () => {
      expect(LICENSE_STATUS.RETIRED).toBeUndefined();
    });

    it("should have DISPUTED status (A.6.2)", () => {
      expect(LICENSE_STATUS.DISPUTED).toBe("disputed");
    });

    it("should have REVOKED status (A.7)", () => {
      expect(LICENSE_STATUS.REVOKED).toBe("revoked");
    });

    it("should have CANCELLATION_PENDING status", () => {
      expect(LICENSE_STATUS.CANCELLATION_PENDING).toBe("cancellation_pending");
    });

    it("should NOT have CANCELLED (double-L) status", () => {
      expect(LICENSE_STATUS.CANCELLED).toBeUndefined();
    });

    it("should have SUSPENDED status (Fix 3 — admin-only)", () => {
      expect(LICENSE_STATUS.SUSPENDED).toBe("suspended");
    });
  });

  describe("LICENSE_STATUS_DISPLAY", () => {
    it("should have display config for all LICENSE_STATUS values", () => {
      Object.keys(LICENSE_STATUS).forEach((key) => {
        const value = LICENSE_STATUS[key];
        expect(LICENSE_STATUS_DISPLAY[value]).toBeDefined();
        expect(LICENSE_STATUS_DISPLAY[value].label).toBeDefined();
        expect(LICENSE_STATUS_DISPLAY[value].variant).toBeDefined();
      });
    });

    it("ACTIVE should have success variant", () => {
      expect(LICENSE_STATUS_DISPLAY.active.variant).toBe("success");
    });

    it("PAST_DUE should have error variant", () => {
      expect(LICENSE_STATUS_DISPLAY.past_due.variant).toBe("error");
    });

    it("TRIAL should NOT have display config (Task 11.0 — dead code removed)", () => {
      expect(LICENSE_STATUS_DISPLAY.trial).toBeUndefined();
    });

    it("DISPUTED should have warning variant", () => {
      expect(LICENSE_STATUS_DISPLAY.disputed.variant).toBe("warning");
    });

    it("CANCELLATION_PENDING should have warning variant and correct label", () => {
      expect(LICENSE_STATUS_DISPLAY.cancellation_pending.variant).toBe("warning");
      expect(LICENSE_STATUS_DISPLAY.cancellation_pending.label).toBe("Cancellation Pending");
    });

    it("should NOT have RETIRED key (Fix 6 — dead code removed)", () => {
      expect(LICENSE_STATUS_DISPLAY.RETIRED).toBeUndefined();
      expect(Object.keys(LICENSE_STATUS_DISPLAY)).not.toContain("RETIRED");
    });
  });

  describe("STRIPE_PRICES", () => {
    it("should have individual pricing structure", () => {
      expect(STRIPE_PRICES.individual).toBeDefined();
      expect(STRIPE_PRICES.individual).toHaveProperty("monthly");
      expect(STRIPE_PRICES.individual).toHaveProperty("annual");
    });

    // v4.2: Business tier has monthly/annual pricing
    it("should have business pricing structure", () => {
      expect(STRIPE_PRICES.business).toBeDefined();
      expect(STRIPE_PRICES.business).toHaveProperty("monthly");
      expect(STRIPE_PRICES.business).toHaveProperty("annual");
    });
  });

  describe("NAV_LINKS", () => {
    it("should have Features link", () => {
      const featuresLink = NAV_LINKS.find((l) => l.label === "Features");
      expect(featuresLink).toBeDefined();
      expect(featuresLink.href).toBe("/features");
    });

    it("should have Pricing link", () => {
      const pricingLink = NAV_LINKS.find((l) => l.label === "Pricing");
      expect(pricingLink).toBeDefined();
      expect(pricingLink.href).toBe("/pricing");
    });

    it("should have Docs link", () => {
      const docsLink = NAV_LINKS.find((l) => l.label === "Docs");
      expect(docsLink).toBeDefined();
      expect(docsLink.href).toBe("/docs");
    });
  });

  describe("PORTAL_NAV", () => {
    it("should have Dashboard link", () => {
      const dashboardLink = PORTAL_NAV.find((l) => l.label === "Dashboard");
      expect(dashboardLink).toBeDefined();
      expect(dashboardLink.href).toBe("/portal");
    });

    it("should have License link", () => {
      const licenseLink = PORTAL_NAV.find((l) => l.label === "License");
      expect(licenseLink).toBeDefined();
      expect(licenseLink.href).toBe("/portal/license");
    });

    it("should have Devices link", () => {
      const devicesLink = PORTAL_NAV.find((l) => l.label === "Devices");
      expect(devicesLink).toBeDefined();
      expect(devicesLink.href).toBe("/portal/devices");
    });

    it("should have Billing link", () => {
      const billingLink = PORTAL_NAV.find((l) => l.label === "Billing");
      expect(billingLink).toBeDefined();
      expect(billingLink.href).toBe("/portal/billing");
    });

    it("should have Settings link as last item", () => {
      const lastItem = PORTAL_NAV[PORTAL_NAV.length - 1];
      expect(lastItem.label).toBe("Settings");
    });
  });

  describe("PORTAL_NAV_BUSINESS", () => {
    it("should have Team link", () => {
      const teamLink = PORTAL_NAV_BUSINESS.find((l) => l.label === "Team");
      expect(teamLink).toBeDefined();
      expect(teamLink.href).toBe("/portal/team");
    });

    it("should have Settings link as last item", () => {
      const lastItem = PORTAL_NAV_BUSINESS[PORTAL_NAV_BUSINESS.length - 1];
      expect(lastItem.label).toBe("Settings");
    });
  });

  describe("EXTERNAL_URLS", () => {
    it("should have docs URL pointing to local /docs path", () => {
      expect(EXTERNAL_URLS.docs).toBe("/docs");
    });

    it("should have MARKETPLACE_ENABLED as a boolean", () => {
      expect(typeof MARKETPLACE_ENABLED).toBe("boolean");
    });

    it("should have github URL", () => {
      expect(EXTERNAL_URLS.github).toBe("https://github.com/hic-ai-inc/mouse");
    });

    it("should have marketplace URL", () => {
      expect(EXTERNAL_URLS.marketplace).toContain(
        "marketplace.visualstudio.com",
      );
    });

    it("should have support email", () => {
      expect(EXTERNAL_URLS.support).toBe("mailto:support@hic-ai.com");
    });
  });

  describe("App Metadata", () => {
    it("should have AUTH_NAMESPACE defined", () => {
      expect(AUTH_NAMESPACE).toBe("https://hic-ai.com");
    });

    it("should have APP_NAME as Mouse", () => {
      expect(APP_NAME).toBe("Mouse");
    });

    it("should have APP_DESCRIPTION defined", () => {
      expect(APP_DESCRIPTION).toBeDefined();
      expect(typeof APP_DESCRIPTION).toBe("string");
    });

    it("should have COMPANY_NAME as HIC AI", () => {
      expect(COMPANY_NAME).toBe("HIC AI");
    });
  });


  describe("EVENT_TYPES", () => {
    const EXPECTED_KEYS = [
      "CUSTOMER_CREATED",
      "LICENSE_CREATED",
      "PAYMENT_FAILED",
      "SUBSCRIPTION_REACTIVATED",
      "CANCELLATION_REQUESTED",
      "CANCELLATION_REVERSED",
      "VOLUNTARY_CANCELLATION_EXPIRED",
      "NONPAYMENT_CANCELLATION_EXPIRED",
      "TEAM_INVITE_CREATED",
      "TEAM_INVITE_RESENT",
      "LICENSE_REVOKED",
      "LICENSE_SUSPENDED",
    ];

    it("should contain all 12 expected event type keys", () => {
      const keys = Object.keys(EVENT_TYPES);
      expect(keys.length).toBe(12);
      for (const key of EXPECTED_KEYS) {
        expect(EVENT_TYPES[key]).toBeDefined();
      }
    });

    it("should have string values matching their keys", () => {
      for (const [key, value] of Object.entries(EVENT_TYPES)) {
        expect(typeof value).toBe("string");
        expect(value).toBe(key);
      }
    });

    it("should have no unexpected keys beyond the 10 defined", () => {
      const keys = Object.keys(EVENT_TYPES);
      for (const key of keys) {
        expect(EXPECTED_KEYS).toContain(key);
      }
    });

    it("Stripe webhook handler should use EVENT_TYPES enum, not hardcoded strings", async () => {
      // Grep verification: read the Stripe webhook source and confirm no bare event strings
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/stripe/route.js"),
        "utf-8",
      );
      // Match quoted strings like "PAYMENT_FAILED" that are NOT preceded by EVENT_TYPES.
      for (const key of EXPECTED_KEYS) {
        const barePattern = new RegExp(`(?<!EVENT_TYPES\\.)"${key}"`, "g");
        const matches = src.match(barePattern) || [];
        expect(matches.length).toBe(0);
      }
    });

    it("Keygen webhook handler should use EVENT_TYPES enum, not hardcoded strings", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/webhooks/keygen/route.js"),
        "utf-8",
      );
      for (const key of EXPECTED_KEYS) {
        const barePattern = new RegExp(`(?<!EVENT_TYPES\\.)"${key}"`, "g");
        const matches = src.match(barePattern) || [];
        expect(matches.length).toBe(0);
      }
    });

    it("Portal team route should use EVENT_TYPES enum, not hardcoded strings", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/app/api/portal/team/route.js"),
        "utf-8",
      );
      for (const key of EXPECTED_KEYS) {
        const barePattern = new RegExp(`(?<!EVENT_TYPES\\.)"${key}"`, "g");
        const matches = src.match(barePattern) || [];
        expect(matches.length).toBe(0);
      }
    });

    it("Email templates EVENT_TYPE_TO_TEMPLATE keys should all be valid EVENT_TYPES", async () => {
      const { EVENT_TYPE_TO_TEMPLATE } = await import("../../../../dm/layers/ses/src/email-templates.js");
      const templateKeys = Object.keys(EVENT_TYPE_TO_TEMPLATE);
      // Every template key must be a valid EVENT_TYPES key (template keys ⊂ EVENT_TYPES)
      // Not all EVENT_TYPES trigger emails — LICENSE_SUSPENDED is audit-only (removed in Fix 5)
      for (const key of templateKeys) {
        expect(EXPECTED_KEYS).toContain(key);
      }
    });

    it("DynamoDB module should use EVENT_TYPES enum, not hardcoded strings", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(import.meta.dirname, "../../../src/lib/dynamodb.js"),
        "utf-8",
      );
      for (const key of EXPECTED_KEYS) {
        const barePattern = new RegExp(`(?<!EVENT_TYPES\\.)"${key}"`, "g");
        const matches = src.match(barePattern) || [];
        expect(matches.length).toBe(0);
      }
    });

  });

  // Feature: status-remediation-plan, Property 1
  // **Validates: Requirements 2.1, 2.2**
  describe("Property 1: LICENSE_STATUS values are lowercase and DISPLAY keys match", () => {
    it("every LICENSE_STATUS value should be a lowercase string", () => {
      for (const [key, value] of Object.entries(LICENSE_STATUS)) {
        expect(typeof value).toBe("string");
        expect(value).toBe(value.toLowerCase());
      }
    });

    it("every LICENSE_STATUS_DISPLAY key should exist as a value in LICENSE_STATUS", () => {
      const statusValues = Object.values(LICENSE_STATUS);
      for (const displayKey of Object.keys(LICENSE_STATUS_DISPLAY)) {
        expect(statusValues).toContain(displayKey);
      }
    });
  });

});
