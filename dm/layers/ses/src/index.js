// dm/layers/ses/src/index.js
// Exports AWS SDK for Simple Email Service (SES) to Lambda layer
// Also exports HIC email templates (single source of truth)
export * from "@aws-sdk/client-ses";

// HIC Email Templates - centralized templates for all email senders
export {
  createTemplates,
  TEMPLATE_NAMES,
  EVENT_TYPE_TO_TEMPLATE,
} from "./email-templates.js";
