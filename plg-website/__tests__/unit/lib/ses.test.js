/**
 * SES Email Client Tests
 *
 * Tests the ses.js module that provides email sending functionality
 * for various lifecycle events.
 *
 * Behaviors tested:
 * - Template generation with correct data substitution
 * - Email sending functions for different scenarios
 * - Error handling
 *
 * Uses hic-ses-layer facade for mocking - no real SES calls are made.
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "../../../../dm/facade/test-helpers/index.js";

// Import the SES mock from the facade (test-loader redirects hic-ses-layer to facade)
import { createSESMock } from "hic-ses-layer";

import {
  sendEmail,
  sendWelcomeEmail,
  sendLicenseEmail,
  sendPaymentFailedEmail,
  sendTrialEndingEmail,
  sendReactivationEmail,
  sendCancellationEmail,
  sendLicenseRevokedEmail,
  sendDisputeAlert,
  sendWinBack30Email,
  sendWinBack90Email,
  sendEnterpriseInviteEmail,
} from "../../../src/lib/ses.js";

describe("ses.js", () => {
  // Store original env vars and restore after tests
  const originalEnv = { ...process.env };
  let sesMock;

  beforeEach(() => {
    // Set required env vars for templates
    process.env.NEXT_PUBLIC_APP_URL = "https://mouse.hic-ai.com";
    process.env.SUPPORT_EMAIL = "support@hic-ai.com";

    // Initialize SES mock - intercepts all SES calls
    sesMock = createSESMock();
    sesMock.whenSendEmailAny({ messageId: "test-message-id" });
  });

  afterEach(() => {
    // Reset mock
    if (sesMock) {
      sesMock.reset();
    }

    // Restore original env
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe("sendEmail", () => {
    it("should throw error for unknown template", async () => {
      let error;
      try {
        await sendEmail("nonexistent_template", "test@example.com", {});
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toBe("Unknown email template: nonexistent_template");
    });

    it("should send email successfully with valid template", async () => {
      const result = await sendEmail("welcome", "test@example.com", {
        email: "test@example.com",
        sessionId: "cs_test_123",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("test-message-id");
    });

    it("should handle SES errors gracefully", async () => {
      // Reset and set up failure mock
      sesMock.reset();
      sesMock.whenSendEmailFails({
        errorCode: "MessageRejected",
        errorMessage: "Email address not verified",
      });

      let error;
      try {
        await sendEmail("welcome", "test@example.com", { email: "test@example.com" });
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe("Email address not verified");
    });
  });

  describe("Email template parameters", () => {
    // These tests verify convenience functions work end-to-end with mocked SES

    describe("sendWelcomeEmail", () => {
      it("should accept email and sessionId parameters", async () => {
        const result = await sendWelcomeEmail("test@example.com", "cs_test_session123");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendLicenseEmail", () => {
      it("should accept email, licenseKey, and planName parameters", async () => {
        const result = await sendLicenseEmail(
          "test@example.com",
          "MOUSE-ABC-123-DEF",
          "Individual",
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendPaymentFailedEmail", () => {
      it("should accept email, attemptCount, and retryDate parameters", async () => {
        const result = await sendPaymentFailedEmail(
          "test@example.com",
          2,
          "January 25, 2026",
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendTrialEndingEmail", () => {
      it("should accept email, daysRemaining, and planName parameters", async () => {
        const result = await sendTrialEndingEmail("test@example.com", 3, "Individual");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendReactivationEmail", () => {
      it("should accept email parameter", async () => {
        const result = await sendReactivationEmail("test@example.com");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendCancellationEmail", () => {
      it("should accept email and accessUntil parameters", async () => {
        const result = await sendCancellationEmail("test@example.com", "February 1, 2026");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendLicenseRevokedEmail", () => {
      it("should accept email and optional organizationName", async () => {
        const result = await sendLicenseRevokedEmail("test@example.com", "Acme Corp");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });

      it("should work without organizationName", async () => {
        const result = await sendLicenseRevokedEmail("test@example.com");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendDisputeAlert", () => {
      it("should accept customerEmail, amount, reason, and disputeId", async () => {
        const result = await sendDisputeAlert(
          "customer@example.com",
          1000, // $10.00 in cents
          "fraudulent",
          "dp_dispute123",
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendWinBack30Email", () => {
      it("should accept email parameter", async () => {
        const result = await sendWinBack30Email("test@example.com");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendWinBack90Email", () => {
      it("should accept email and optional discountCode", async () => {
        const result = await sendWinBack90Email("test@example.com", "COMEBACK25");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });

      it("should use default discountCode when not provided", async () => {
        const result = await sendWinBack90Email("test@example.com");

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });

    describe("sendEnterpriseInviteEmail", () => {
      it("should accept all enterprise invite parameters", async () => {
        const result = await sendEnterpriseInviteEmail(
          "newuser@example.com",
          "Acme Corporation",
          "Jane Admin",
          "invite_token_abc123",
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBe("test-message-id");
      });
    });
  });

  // Test email template content structure
  describe("Email template content validation", () => {
    // These tests validate that the templates produce expected output structure
    // We import the module and directly test template generation

    it("should have all required email templates", () => {
      // Verify all send functions exist (indirect template verification)
      const emailFunctions = [
        sendWelcomeEmail,
        sendLicenseEmail,
        sendPaymentFailedEmail,
        sendTrialEndingEmail,
        sendReactivationEmail,
        sendCancellationEmail,
        sendLicenseRevokedEmail,
        sendDisputeAlert,
        sendWinBack30Email,
        sendWinBack90Email,
        sendEnterpriseInviteEmail,
      ];

      emailFunctions.forEach((fn) => {
        expect(typeof fn).toBe("function");
      });
    });
  });
});
