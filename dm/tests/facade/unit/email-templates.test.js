/**
 * Email Templates Tests
 *
 * Tests for the centralized email template system in hic-ses-layer.
 * Verifies:
 * - Template creation with configuration
 * - All 12 template functions exist and return correct structure
 * - Template content includes required elements (subject, html, text)
 * - Dynamic interpolation of configuration values
 * - EVENT_TYPE_TO_TEMPLATE mapping is complete
 * - TEMPLATE_NAMES list is accurate
 *
 * @see PLG Technical Specification v4 - Phase 2: Template Consolidation
 */

import {
  test,
  describe,
  beforeEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import {
  createTemplates,
  TEMPLATE_NAMES,
  EVENT_TYPE_TO_TEMPLATE,
} from "../../../layers/ses/src/index.js";

describe("Email Templates", () => {
  let templates;
  const testConfig = {
    appUrl: "https://test.example.com",
    companyName: "Test Company",
    productName: "TestProduct",
  };

  beforeEach(() => {
    templates = createTemplates(testConfig);
  });

  describe("createTemplates", () => {
    test("should create templates with custom configuration", () => {
      expect(typeof templates).toBe("object");
      expect(Object.keys(templates).length).toBeGreaterThan(0);
    });

    test("should use default values when no config provided", () => {
      const defaultTemplates = createTemplates();
      const welcomeEmail = defaultTemplates.welcome({
        email: "test@example.com",
        sessionId: "sess_123",
      });

      expect(welcomeEmail.subject).toContain("Mouse");
      expect(welcomeEmail.html).toContain("https://mouse.hic-ai.com");
      expect(welcomeEmail.text).toContain("HIC AI");
    });

    test("should inject custom appUrl into templates", () => {
      const welcomeEmail = templates.welcome({
        email: "test@example.com",
        sessionId: "sess_123",
      });

      expect(welcomeEmail.html).toContain(testConfig.appUrl);
      expect(welcomeEmail.text).toContain(testConfig.appUrl);
    });

    test("should inject custom productName into templates", () => {
      const welcomeEmail = templates.welcome({
        email: "test@example.com",
        sessionId: "sess_123",
      });

      expect(welcomeEmail.subject).toContain(testConfig.productName);
      expect(welcomeEmail.html).toContain(testConfig.productName);
      expect(welcomeEmail.text).toContain(testConfig.productName);
    });

    test("should inject custom companyName into templates", () => {
      const welcomeEmail = templates.welcome({
        email: "test@example.com",
        sessionId: "sess_123",
      });

      expect(welcomeEmail.html).toContain(testConfig.companyName);
      expect(welcomeEmail.text).toContain(testConfig.companyName);
    });
  });

  describe("TEMPLATE_NAMES", () => {
    test("should export array of all template names", () => {
      expect(Array.isArray(TEMPLATE_NAMES)).toBe(true);
      expect(TEMPLATE_NAMES.length).toBe(12);
    });

    test("should include all expected template names", () => {
      const expectedNames = [
        "welcome",
        "licenseDelivery",
        "paymentFailed",
        "trialEnding",
        "reactivation",
        "cancellation",
        "licenseRevoked",
        "licenseSuspended",
        "winBack30",
        "winBack90",
        "enterpriseInvite",
        "disputeAlert",
      ];

      expectedNames.forEach((name) => {
        expect(TEMPLATE_NAMES).toContain(name);
      });
    });

    test("should match actual template functions", () => {
      TEMPLATE_NAMES.forEach((name) => {
        expect(typeof templates[name]).toBe("function");
      });
    });
  });

  describe("EVENT_TYPE_TO_TEMPLATE", () => {
    test("should export event type mapping object", () => {
      expect(typeof EVENT_TYPE_TO_TEMPLATE).toBe("object");
    });

    test("should map LICENSE_CREATED to licenseDelivery", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.LICENSE_CREATED).toBe("licenseDelivery");
    });

    test("should map LICENSE_REVOKED to licenseRevoked", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.LICENSE_REVOKED).toBe("licenseRevoked");
    });

    test("should map LICENSE_SUSPENDED to licenseSuspended", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.LICENSE_SUSPENDED).toBe("licenseSuspended");
    });

    test("should map CUSTOMER_CREATED to welcome", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.CUSTOMER_CREATED).toBe("welcome");
    });

    test("should map SUBSCRIPTION_CANCELLED to cancellation", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.SUBSCRIPTION_CANCELLED).toBe(
        "cancellation",
      );
    });

    test("should map SUBSCRIPTION_REACTIVATED to reactivation", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.SUBSCRIPTION_REACTIVATED).toBe(
        "reactivation",
      );
    });

    test("should map PAYMENT_FAILED to paymentFailed", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.PAYMENT_FAILED).toBe("paymentFailed");
    });

    test("should map TRIAL_ENDING to trialEnding", () => {
      expect(EVENT_TYPE_TO_TEMPLATE.TRIAL_ENDING).toBe("trialEnding");
    });

    test("all mappings should reference valid templates", () => {
      Object.values(EVENT_TYPE_TO_TEMPLATE).forEach((templateName) => {
        expect(TEMPLATE_NAMES).toContain(templateName);
      });
    });
  });

  describe("Template Structure", () => {
    const templateTestCases = [
      {
        name: "welcome",
        data: { email: "test@example.com", sessionId: "sess_123" },
      },
      {
        name: "licenseDelivery",
        data: {
          email: "test@example.com",
          licenseKey: "KEY-123",
          planName: "Pro",
        },
      },
      {
        name: "paymentFailed",
        data: {
          email: "test@example.com",
          attemptCount: 2,
          retryDate: "2026-02-01",
        },
      },
      {
        name: "trialEnding",
        data: { email: "test@example.com", daysRemaining: 3, planName: "Pro" },
      },
      {
        name: "reactivation",
        data: { email: "test@example.com" },
      },
      {
        name: "cancellation",
        data: { email: "test@example.com", accessUntil: "2026-02-28" },
      },
      {
        name: "licenseRevoked",
        data: { email: "test@example.com", organizationName: "Acme Corp" },
      },
      {
        name: "licenseSuspended",
        data: { email: "test@example.com" },
      },
      {
        name: "winBack30",
        data: { email: "test@example.com" },
      },
      {
        name: "winBack90",
        data: { email: "test@example.com", discountCode: "WINBACK20" },
      },
      {
        name: "enterpriseInvite",
        data: {
          email: "test@example.com",
          organizationName: "Acme Corp",
          inviterName: "John Doe",
          inviteToken: "inv_abc123",
        },
      },
      {
        name: "disputeAlert",
        data: {
          customerEmail: "customer@example.com",
          amount: 1000, // cents
          reason: "fraudulent",
          disputeId: "dp_123",
        },
      },
    ];

    templateTestCases.forEach(({ name, data }) => {
      describe(`${name} template`, () => {
        test("should return object with subject, html, and text", () => {
          const result = templates[name](data);

          expect(typeof result).toBe("object");
          expect(typeof result.subject).toBe("string");
          expect(typeof result.html).toBe("string");
          expect(typeof result.text).toBe("string");
        });

        test("should have non-empty subject", () => {
          const result = templates[name](data);
          expect(result.subject.length).toBeGreaterThan(0);
        });

        test("should have non-empty html body", () => {
          const result = templates[name](data);
          expect(result.html.length).toBeGreaterThan(0);
          expect(result.html).toContain("<!DOCTYPE html>");
        });

        test("should have non-empty text body", () => {
          const result = templates[name](data);
          expect(result.text.length).toBeGreaterThan(0);
        });

        test("should include company name in html or text (except internal emails)", () => {
          // disputeAlert is internal email sent to support team, no company branding needed
          if (name === "disputeAlert") {
            expect(true).toBe(true); // skip for internal emails
            return;
          }
          const result = templates[name](data);
          const hasCompanyName = result.html.includes(testConfig.companyName) || 
                                 result.text.includes(testConfig.companyName);
          expect(hasCompanyName).toBe(true);
        });
      });
    });
  });

  describe("Template Content Validation", () => {
    test("welcome template should include session link", () => {
      const result = templates.welcome({
        email: "test@example.com",
        sessionId: "sess_abc123",
      });

      expect(result.html).toContain("session_id=sess_abc123");
      expect(result.text).toContain("session_id=sess_abc123");
    });

    test("licenseDelivery template should include license key", () => {
      const result = templates.licenseDelivery({
        email: "test@example.com",
        licenseKey: "MOUSE-PRO-12345",
        planName: "Pro",
      });

      expect(result.html).toContain("MOUSE-PRO-12345");
      expect(result.text).toContain("MOUSE-PRO-12345");
    });

    test("paymentFailed template should show attempt count", () => {
      const result = templates.paymentFailed({
        email: "test@example.com",
        attemptCount: 2,
        retryDate: "February 5, 2026",
      });

      expect(result.html).toContain("attempt 2 of 3");
      expect(result.html).toContain("February 5, 2026");
    });

    test("paymentFailed template should show final attempt message", () => {
      const result = templates.paymentFailed({
        email: "test@example.com",
        attemptCount: 3,
        retryDate: null,
      });

      expect(result.html).toContain("final attempt");
      expect(result.html).toContain("suspended");
    });

    test("cancellation template should include access end date", () => {
      const result = templates.cancellation({
        email: "test@example.com",
        accessUntil: "March 1, 2026",
      });

      expect(result.html).toContain("March 1, 2026");
      expect(result.text).toContain("March 1, 2026");
    });

    test("licenseRevoked template should include organization name when provided", () => {
      const result = templates.licenseRevoked({
        email: "test@example.com",
        organizationName: "Acme Corp",
      });

      expect(result.html).toContain("Acme Corp");
      expect(result.text).toContain("Acme Corp");
    });

    test("licenseRevoked template should work without organization name", () => {
      const result = templates.licenseRevoked({
        email: "test@example.com",
        organizationName: null,
      });

      expect(result.html).not.toContain("from null");
      expect(result.subject).toContain("Revoked");
    });

    test("winBack90 template should include discount code", () => {
      const result = templates.winBack90({
        email: "test@example.com",
        discountCode: "SPECIAL20",
      });

      expect(result.html).toContain("SPECIAL20");
      expect(result.text).toContain("SPECIAL20");
      expect(result.html).toContain("20% OFF");
    });

    test("winBack90 template should use default discount code", () => {
      const result = templates.winBack90({
        email: "test@example.com",
      });

      expect(result.html).toContain("WINBACK20");
    });

    test("enterpriseInvite template should include all invite details", () => {
      const result = templates.enterpriseInvite({
        email: "test@example.com",
        organizationName: "Acme Corp",
        inviterName: "Jane Smith",
        inviteToken: "inv_xyz789",
      });

      expect(result.html).toContain("Acme Corp");
      expect(result.html).toContain("Jane Smith");
      expect(result.html).toContain("token=inv_xyz789");
    });

    test("disputeAlert template should format amount correctly", () => {
      const result = templates.disputeAlert({
        customerEmail: "customer@example.com",
        amount: 2999, // $29.99 in cents
        reason: "product_not_received",
        disputeId: "dp_dispute123",
      });

      expect(result.html).toContain("$29.99");
      expect(result.html).toContain("customer@example.com");
      expect(result.html).toContain("dp_dispute123");
      expect(result.subject).toContain("$29.99");
    });

    test("trialEnding template should include days remaining", () => {
      const result = templates.trialEnding({
        email: "test@example.com",
        daysRemaining: 3,
        planName: "Pro",
      });

      expect(result.subject).toContain("3 days");
      expect(result.html).toContain("3 days");
    });
  });

  describe("Email HTML Standards", () => {
    test("all templates should have proper HTML structure", () => {
      const allTemplates = createTemplates(testConfig);

      Object.keys(allTemplates).forEach((name) => {
        // Use minimal valid data for each template
        const minimalData = {
          email: "test@example.com",
          sessionId: "test",
          licenseKey: "KEY",
          planName: "Plan",
          attemptCount: 1,
          retryDate: "date",
          daysRemaining: 1,
          accessUntil: "date",
          organizationName: "Org",
          inviterName: "Name",
          inviteToken: "token",
          discountCode: "CODE",
          customerEmail: "customer@test.com",
          amount: 100,
          reason: "reason",
          disputeId: "dp_id",
        };

        const result = allTemplates[name](minimalData);

        expect(result.html).toContain("<!DOCTYPE html>");
        expect(result.html).toContain("<html>");
        expect(result.html).toContain("</html>");
        expect(result.html).toContain("<body");
        expect(result.html).toContain("</body>");
      });
    });

    test("customer-facing templates should be mobile-responsive", () => {
      const allTemplates = createTemplates(testConfig);
      // disputeAlert is internal email sent to support team, not customer-facing
      const customerFacingTemplates = Object.keys(allTemplates).filter(
        (name) => name !== "disputeAlert"
      );

      customerFacingTemplates.forEach((name) => {
        const minimalData = {
          email: "test@example.com",
          sessionId: "test",
          licenseKey: "KEY",
          planName: "Plan",
          attemptCount: 1,
          retryDate: "date",
          daysRemaining: 1,
          accessUntil: "date",
          organizationName: "Org",
          inviterName: "Name",
          inviteToken: "token",
          discountCode: "CODE",
          customerEmail: "customer@test.com",
          amount: 100,
          reason: "reason",
          disputeId: "dp_id",
        };

        const result = allTemplates[name](minimalData);

        // Check for viewport meta tag (mobile responsiveness)
        expect(result.html).toContain('name="viewport"');
      });
    });
  });
});
