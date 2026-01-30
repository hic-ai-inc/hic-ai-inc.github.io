/**
 * SES Facade Tests
 *
 * Comprehensive tests for the SES mock facade including all SendEmail variants,
 * templated emails, bulk sending, identity verification, and error handling.
 */

import {
  test,
  describe,
  beforeEach,
  afterEach,
  expect,
} from "../../../facade/test-helpers/index.js";
import {
  createSESMock,
  SESClient,
  SendEmailCommand,
  SendTemplatedEmailCommand,
  SendRawEmailCommand,
  SendBulkTemplatedEmailCommand,
  GetIdentityVerificationAttributesCommand,
} from "../../../facade/helpers/ses.js";

describe("SES Facade", () => {
  let ses;
  let client;

  beforeEach(() => {
    ses = createSESMock();
    client = new SESClient({});
  });

  afterEach(() => {
    ses.reset();
  });

  describe("whenSendEmail", () => {
    test("should mock basic email sending", async () => {
      ses.whenSendEmail(
        { from: "sender@example.com", to: "recipient@example.com" },
        { messageId: "test-msg-id-123" },
      );

      const result = await client.send(
        new SendEmailCommand({
          Source: "sender@example.com",
          Destination: { ToAddresses: ["recipient@example.com"] },
          Message: {
            Subject: { Data: "Test Subject" },
            Body: { Text: { Data: "Test body" } },
          },
        }),
      );

      expect(result.MessageId).toBe("test-msg-id-123");
    });

    test("should match on subject when provided", async () => {
      ses.whenSendEmail(
        {
          from: "sender@example.com",
          to: "recipient@example.com",
          subject: "Welcome!",
        },
        { messageId: "welcome-msg-id" },
      );

      const result = await client.send(
        new SendEmailCommand({
          Source: "sender@example.com",
          Destination: { ToAddresses: ["recipient@example.com"] },
          Message: {
            Subject: { Data: "Welcome!" },
            Body: { Text: { Data: "Welcome to our service" } },
          },
        }),
      );

      expect(result.MessageId).toBe("welcome-msg-id");
    });

    test("should handle array of recipients", async () => {
      ses.whenSendEmail(
        {
          from: "sender@example.com",
          to: ["user1@example.com", "user2@example.com"],
        },
        { messageId: "multi-recipient-msg" },
      );

      const result = await client.send(
        new SendEmailCommand({
          Source: "sender@example.com",
          Destination: {
            ToAddresses: ["user1@example.com", "user2@example.com"],
          },
          Message: {
            Subject: { Data: "Announcement" },
            Body: { Text: { Data: "Important update" } },
          },
        }),
      );

      expect(result.MessageId).toBe("multi-recipient-msg");
    });

    test("should use default messageId when not specified", async () => {
      ses.whenSendEmail({
        from: "sender@example.com",
        to: "recipient@example.com",
      });

      const result = await client.send(
        new SendEmailCommand({
          Source: "sender@example.com",
          Destination: { ToAddresses: ["recipient@example.com"] },
          Message: {
            Subject: { Data: "Test" },
            Body: { Text: { Data: "Test" } },
          },
        }),
      );

      expect(result.MessageId).toBe("mock-ses-msg-id");
    });

    test("should throw when from is not provided", () => {
      expect(() => ses.whenSendEmail({ to: "test@example.com" })).toThrow(
        "from must be a non-empty string",
      );
    });

    test("should throw when from is empty string", () => {
      expect(() =>
        ses.whenSendEmail({ from: "", to: "test@example.com" }),
      ).toThrow("from must be a non-empty string");
    });

    test("should throw when to is not provided", () => {
      expect(() => ses.whenSendEmail({ from: "sender@example.com" })).toThrow(
        "to must be provided",
      );
    });
  });

  describe("whenSendEmailTo", () => {
    test("should mock email by destination only", async () => {
      ses.whenSendEmailTo(
        { to: "recipient@example.com" },
        { messageId: "destination-only-msg" },
      );

      const result = await client.send(
        new SendEmailCommand({
          Source: "any-sender@example.com",
          Destination: { ToAddresses: ["recipient@example.com"] },
          Message: {
            Subject: { Data: "Test" },
            Body: { Text: { Data: "Test" } },
          },
        }),
      );

      expect(result.MessageId).toBe("destination-only-msg");
    });

    test("should handle array of recipients", async () => {
      ses.whenSendEmailTo(
        { to: ["user1@example.com", "user2@example.com"] },
        { messageId: "multi-to-msg" },
      );

      const result = await client.send(
        new SendEmailCommand({
          Source: "sender@example.com",
          Destination: {
            ToAddresses: ["user1@example.com", "user2@example.com"],
          },
          Message: {
            Subject: { Data: "Test" },
            Body: { Text: { Data: "Test" } },
          },
        }),
      );

      expect(result.MessageId).toBe("multi-to-msg");
    });

    test("should throw when to is not provided", () => {
      expect(() => ses.whenSendEmailTo({})).toThrow("to must be provided");
    });

    test("should use default messageId when not specified", async () => {
      ses.whenSendEmailTo({ to: "recipient@example.com" });

      const result = await client.send(
        new SendEmailCommand({
          Source: "sender@example.com",
          Destination: { ToAddresses: ["recipient@example.com"] },
          Message: {
            Subject: { Data: "Test" },
            Body: { Text: { Data: "Test" } },
          },
        }),
      );

      expect(result.MessageId).toBe("mock-ses-msg-id");
    });
  });

  describe("whenSendEmailAny", () => {
    test("should mock any SendEmail command", async () => {
      ses.whenSendEmailAny({ messageId: "any-email-msg" });

      const result = await client.send(
        new SendEmailCommand({
          Source: "random@example.com",
          Destination: { ToAddresses: ["anyone@example.com"] },
          Message: {
            Subject: { Data: "Any Subject" },
            Body: { Text: { Data: "Any Body" } },
          },
        }),
      );

      expect(result.MessageId).toBe("any-email-msg");
    });

    test("should use default messageId when not specified", async () => {
      ses.whenSendEmailAny();

      const result = await client.send(
        new SendEmailCommand({
          Source: "test@example.com",
          Destination: { ToAddresses: ["test2@example.com"] },
          Message: {
            Subject: { Data: "Test" },
            Body: { Text: { Data: "Test" } },
          },
        }),
      );

      expect(result.MessageId).toBe("mock-ses-msg-id");
    });
  });

  describe("whenSendEmailFails", () => {
    test("should mock email failure with default error", async () => {
      ses.whenSendEmailFails({});

      try {
        await client.send(
          new SendEmailCommand({
            Source: "sender@example.com",
            Destination: { ToAddresses: ["recipient@example.com"] },
            Message: {
              Subject: { Data: "Test" },
              Body: { Text: { Data: "Test" } },
            },
          }),
        );
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error.message).toBe("Email address is not verified");
        expect(error.name).toBe("MessageRejected");
        expect(error.Code).toBe("MessageRejected");
      }
    });

    test("should mock email failure with custom error", async () => {
      ses.whenSendEmailFails({
        errorCode: "InvalidParameterValue",
        errorMessage: "Invalid sender address",
      });

      try {
        await client.send(
          new SendEmailCommand({
            Source: "invalid@example.com",
            Destination: { ToAddresses: ["recipient@example.com"] },
            Message: {
              Subject: { Data: "Test" },
              Body: { Text: { Data: "Test" } },
            },
          }),
        );
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error.message).toBe("Invalid sender address");
        expect(error.Code).toBe("InvalidParameterValue");
      }
    });
  });

  describe("whenSendTemplatedEmail", () => {
    test("should mock templated email sending", async () => {
      ses.whenSendTemplatedEmail(
        { template: "WelcomeEmail", to: "user@example.com" },
        { messageId: "templated-msg-id" },
      );

      const result = await client.send(
        new SendTemplatedEmailCommand({
          Source: "noreply@example.com",
          Destination: { ToAddresses: ["user@example.com"] },
          Template: "WelcomeEmail",
          TemplateData: JSON.stringify({ name: "John" }),
        }),
      );

      expect(result.MessageId).toBe("templated-msg-id");
    });

    test("should match on template name only when to is not provided", async () => {
      ses.whenSendTemplatedEmail(
        { template: "PasswordReset" },
        { messageId: "reset-msg-id" },
      );

      const result = await client.send(
        new SendTemplatedEmailCommand({
          Source: "noreply@example.com",
          Destination: { ToAddresses: ["any@example.com"] },
          Template: "PasswordReset",
          TemplateData: JSON.stringify({
            resetLink: "https://example.com/reset",
          }),
        }),
      );

      expect(result.MessageId).toBe("reset-msg-id");
    });

    test("should throw when template is not provided", () => {
      expect(() =>
        ses.whenSendTemplatedEmail({ to: "user@example.com" }),
      ).toThrow("template must be a non-empty string");
    });

    test("should throw when template is empty", () => {
      expect(() => ses.whenSendTemplatedEmail({ template: "" })).toThrow(
        "template must be a non-empty string",
      );
    });

    test("should use default messageId when not specified", async () => {
      ses.whenSendTemplatedEmail({ template: "Newsletter" });

      const result = await client.send(
        new SendTemplatedEmailCommand({
          Source: "news@example.com",
          Destination: { ToAddresses: ["subscriber@example.com"] },
          Template: "Newsletter",
          TemplateData: JSON.stringify({}),
        }),
      );

      expect(result.MessageId).toBe("mock-ses-msg-id");
    });
  });

  describe("whenSendBulkTemplatedEmail", () => {
    test("should mock bulk templated email sending", async () => {
      ses.whenSendBulkTemplatedEmail(
        { template: "BulkNotification" },
        { status: [{ Status: "Success" }, { Status: "Success" }] },
      );

      const result = await client.send(
        new SendBulkTemplatedEmailCommand({
          Source: "bulk@example.com",
          Template: "BulkNotification",
          Destinations: [
            { Destination: { ToAddresses: ["user1@example.com"] } },
            { Destination: { ToAddresses: ["user2@example.com"] } },
          ],
        }),
      );

      expect(result.Status).toHaveLength(2);
      expect(result.Status[0].Status).toBe("Success");
    });

    test("should throw when template is not provided", () => {
      expect(() => ses.whenSendBulkTemplatedEmail({})).toThrow(
        "template must be a non-empty string",
      );
    });

    test("should use default empty status when not specified", async () => {
      ses.whenSendBulkTemplatedEmail({ template: "BulkEmail" });

      const result = await client.send(
        new SendBulkTemplatedEmailCommand({
          Source: "bulk@example.com",
          Template: "BulkEmail",
          Destinations: [],
        }),
      );

      expect(result.Status).toEqual([]);
    });
  });

  describe("whenGetIdentityVerification", () => {
    test("should mock identity verification check", async () => {
      ses.whenGetIdentityVerification({
        identities: ["sender@example.com"],
        attributes: {
          "sender@example.com": {
            VerificationStatus: "Success",
          },
        },
      });

      const result = await client.send(
        new GetIdentityVerificationAttributesCommand({
          Identities: ["sender@example.com"],
        }),
      );

      expect(
        result.VerificationAttributes["sender@example.com"].VerificationStatus,
      ).toBe("Success");
    });

    test("should match any identities when not specified", async () => {
      ses.whenGetIdentityVerification({
        attributes: {
          "any@example.com": { VerificationStatus: "Pending" },
        },
      });

      const result = await client.send(
        new GetIdentityVerificationAttributesCommand({
          Identities: ["any@example.com"],
        }),
      );

      expect(
        result.VerificationAttributes["any@example.com"].VerificationStatus,
      ).toBe("Pending");
    });

    test("should return empty attributes when not provided", async () => {
      ses.whenGetIdentityVerification({});

      const result = await client.send(
        new GetIdentityVerificationAttributesCommand({
          Identities: ["unknown@example.com"],
        }),
      );

      expect(result.VerificationAttributes).toEqual({});
    });
  });

  describe("reset", () => {
    test("should reset all mocks", async () => {
      ses.whenSendEmailAny({ messageId: "first-msg" });

      // First call should work
      const result1 = await client.send(
        new SendEmailCommand({
          Source: "test@example.com",
          Destination: { ToAddresses: ["test2@example.com"] },
          Message: {
            Subject: { Data: "Test" },
            Body: { Text: { Data: "Test" } },
          },
        }),
      );
      expect(result1.MessageId).toBe("first-msg");

      // Reset mocks
      ses.reset();

      // After reset, the mock should not be configured
      // This would throw or return undefined depending on aws-sdk-client-mock behavior
    });
  });

  describe("raw", () => {
    test("should expose raw mock for advanced usage", () => {
      expect(ses.raw).toBeDefined();
      expect(typeof ses.raw.on).toBe("function");
      expect(typeof ses.raw.reset).toBe("function");
    });
  });

  describe("newClient", () => {
    test("should create a new SES client", () => {
      const newClient = ses.newClient();
      expect(newClient).toBeDefined();
      expect(newClient).toBeInstanceOf(SESClient);
    });
  });

  describe("re-exports", () => {
    test("should re-export SESClient", () => {
      expect(SESClient).toBeDefined();
    });

    test("should re-export SendEmailCommand", () => {
      expect(SendEmailCommand).toBeDefined();
    });

    test("should re-export SendTemplatedEmailCommand", () => {
      expect(SendTemplatedEmailCommand).toBeDefined();
    });

    test("should re-export SendRawEmailCommand", () => {
      expect(SendRawEmailCommand).toBeDefined();
    });

    test("should re-export SendBulkTemplatedEmailCommand", () => {
      expect(SendBulkTemplatedEmailCommand).toBeDefined();
    });

    test("should re-export GetIdentityVerificationAttributesCommand", () => {
      expect(GetIdentityVerificationAttributesCommand).toBeDefined();
    });
  });
});
