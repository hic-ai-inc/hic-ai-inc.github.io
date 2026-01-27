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
  AUTH0_NAMESPACE,
  APP_NAME,
  APP_DESCRIPTION,
  COMPANY_NAME,
} from "../../../src/lib/constants.js";

describe("constants.js", () => {
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
      expect(LICENSE_STATUS.PENDING_ACCOUNT).toBe("PENDING_ACCOUNT");
    });

    it("should have TRIAL status", () => {
      expect(LICENSE_STATUS.TRIAL).toBe("TRIAL");
    });

    it("should have ACTIVE status", () => {
      expect(LICENSE_STATUS.ACTIVE).toBe("ACTIVE");
    });

    it("should have PAST_DUE status", () => {
      expect(LICENSE_STATUS.PAST_DUE).toBe("PAST_DUE");
    });

    it("should have CANCELLED status", () => {
      expect(LICENSE_STATUS.CANCELLED).toBe("CANCELLED");
    });

    it("should have EXPIRED status", () => {
      expect(LICENSE_STATUS.EXPIRED).toBe("EXPIRED");
    });

    it("should have RETIRED status (A.5.3)", () => {
      expect(LICENSE_STATUS.RETIRED).toBe("RETIRED");
    });

    it("should have DISPUTED status (A.6.2)", () => {
      expect(LICENSE_STATUS.DISPUTED).toBe("DISPUTED");
    });

    it("should have REVOKED status (A.7)", () => {
      expect(LICENSE_STATUS.REVOKED).toBe("REVOKED");
    });
  });

  describe("LICENSE_STATUS_DISPLAY", () => {
    it("should have display config for all LICENSE_STATUS values", () => {
      Object.keys(LICENSE_STATUS).forEach((status) => {
        expect(LICENSE_STATUS_DISPLAY[status]).toBeDefined();
        expect(LICENSE_STATUS_DISPLAY[status].label).toBeDefined();
        expect(LICENSE_STATUS_DISPLAY[status].variant).toBeDefined();
      });
    });

    it("ACTIVE should have success variant", () => {
      expect(LICENSE_STATUS_DISPLAY.ACTIVE.variant).toBe("success");
    });

    it("PAST_DUE should have error variant", () => {
      expect(LICENSE_STATUS_DISPLAY.PAST_DUE.variant).toBe("error");
    });

    it("TRIAL should have info variant", () => {
      expect(LICENSE_STATUS_DISPLAY.TRIAL.variant).toBe("info");
    });

    it("DISPUTED should have warning variant", () => {
      expect(LICENSE_STATUS_DISPLAY.DISPUTED.variant).toBe("warning");
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
    it("should have docs URL", () => {
      expect(EXTERNAL_URLS.docs).toBe("https://docs.hic-ai.com");
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
    it("should have AUTH0_NAMESPACE defined", () => {
      expect(AUTH0_NAMESPACE).toBe("https://hic-ai.com");
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
});
