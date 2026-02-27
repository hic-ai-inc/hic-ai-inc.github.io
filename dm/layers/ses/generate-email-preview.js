#!/usr/bin/env node
/**
 * Email Template Preview Generator
 *
 * Imports the centralized email templates and generates a single
 * self-contained HTML file for SWR's line-by-line review (AP 7.7 / 7.8).
 *
 * Usage: node dm/layers/ses/generate-email-preview.js
 * Output: dm/layers/ses/email-preview.html (open in browser)
 *
 * No external dependencies. Uses only email-templates.js.
 */

import { createTemplates, TEMPLATE_NAMES } from "./src/email-templates.js";

// Configure with staging URL so links are clickable for verification (AP 7.8)
const templates = createTemplates({
  appUrl: "https://staging.hic-ai.com",
  companyName: "HIC AI",
  productName: "Mouse",
});

// Sample data for each template — realistic values for review
const sampleData = {
  welcome: {
    email: "reviewer@example.com",
    sessionId: "cs_test_a1b2c3d4e5f6",
  },
  licenseDelivery: {
    email: "reviewer@example.com",
    licenseKey: "ABCD-1234-EFGH-5678-IJKL-9012-MNOP",
    planName: "Individual Annual",
  },
  paymentFailed: {
    email: "reviewer@example.com",
    attemptCount: 1,
    retryDate: "March 5, 2026",
  },
  trialEnding: {
    email: "reviewer@example.com",
    daysRemaining: 3,
    planName: "Individual Monthly",
  },
  reactivation: {
    email: "reviewer@example.com",
  },
  cancellation: {
    email: "reviewer@example.com",
    accessUntil: "March 27, 2026",
  },
  licenseRevoked: {
    email: "reviewer@example.com",
    organizationName: "Acme Corp",
  },
  licenseSuspended: {
    email: "reviewer@example.com",
  },
  winBack30: {
    email: "reviewer@example.com",
  },
  winBack90: {
    email: "reviewer@example.com",
    discountCode: "WINBACK20",
  },
  enterpriseInvite: {
    email: "reviewer@example.com",
    organizationName: "Acme Corp",
    inviterName: "Jane Smith",
    inviteToken: "inv_test_abc123def456",
  },
  disputeAlert: {
    customerEmail: "customer@example.com",
    amount: 15000,
    reason: "product_not_received",
    disputeId: "dp_test_xyz789",
  },
};

// Template metadata for the review UI
const templateMeta = {
  welcome: { label: "1. Welcome", type: "transactional", desc: "After checkout, before account creation" },
  licenseDelivery: { label: "2. License Delivery", type: "transactional", desc: "After account creation — contains license key" },
  paymentFailed: { label: "3. Payment Failed", type: "transactional", desc: "After failed payment attempt (shows attempt 1 of 3)" },
  trialEnding: { label: "4. Trial Ending", type: "transactional", desc: "Reminder before trial expires" },
  reactivation: { label: "5. Reactivation", type: "transactional", desc: "Payment recovered after suspension" },
  cancellation: { label: "6. Cancellation", type: "transactional", desc: "Subscription cancelled confirmation" },
  licenseRevoked: { label: "7. License Revoked", type: "transactional", desc: "Admin revoked a team member's license" },
  licenseSuspended: { label: "8. License Suspended", type: "transactional", desc: "Billing or policy issue" },
  winBack30: { label: "9. Win-Back 30d", type: "marketing", desc: "30 days post-cancellation" },
  winBack90: { label: "10. Win-Back 90d", type: "marketing", desc: "90 days post-cancellation with discount" },
  enterpriseInvite: { label: "11. Enterprise Invite", type: "transactional", desc: "Team invitation from admin" },
  disputeAlert: { label: "12. Dispute Alert", type: "internal", desc: "Internal alert to support team — NOT customer-facing" },
};

// Also generate the paymentFailed final-attempt variant
const paymentFailedFinal = templates.paymentFailed({
  email: "reviewer@example.com",
  attemptCount: 3,
  retryDate: null,
});

// Render all templates
const rendered = {};
for (const name of TEMPLATE_NAMES) {
  if (!templates[name]) {
    console.warn(`Template "${name}" listed in TEMPLATE_NAMES but not found in createTemplates output — skipping`);
    continue;
  }
  if (!sampleData[name]) {
    console.warn(`No sample data for template "${name}" — skipping`);
    continue;
  }
  rendered[name] = templates[name](sampleData[name]);
}

// Escape HTML for embedding in the page (plaintext display)
function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Build the HTML preview page
let cards = "";
let navButtons = "";

for (const name of TEMPLATE_NAMES) {
  if (!rendered[name]) continue;
  const meta = templateMeta[name] || { label: name, type: "unknown", desc: "" };
  const { subject, html, text } = rendered[name];

  const badgeClass = meta.type === "internal" ? "badge internal" : meta.type === "marketing" ? "badge marketing" : "badge";
  const badgeLabel = meta.type.charAt(0).toUpperCase() + meta.type.slice(1);

  navButtons += `<button onclick="showTemplate('${name}')" id="nav-${name}">${meta.label}</button>\n`;

  // For the HTML view, we use srcdoc on an iframe so styles are fully isolated
  const iframeHtml = html.replace(/"/g, "&quot;");

  cards += `
    <div class="template-card" id="card-${name}">
      <div class="card-header">
        <div>
          <h2>${meta.label}</h2>
          <p style="font-size:12px;color:#6b7280;margin-top:4px;">${meta.desc}</p>
        </div>
        <span class="${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="subject-line"><span>Subject:</span> ${esc(subject)}</div>
      <div class="view-toggle">
        <button class="active" onclick="toggleView('${name}','html',this)">HTML Preview</button>
        <button onclick="toggleView('${name}','text',this)">Plaintext</button>
        ${name === "paymentFailed" ? '<button onclick="toggleView(\'paymentFailed\',\'variant\',this)">HTML (Final Attempt)</button>' : ""}
      </div>
      <div id="view-${name}-html">
        <iframe class="preview-frame" srcdoc="${iframeHtml}" sandbox="allow-same-origin"></iframe>
      </div>
      <div id="view-${name}-text" class="plaintext-view">${esc(text)}</div>
      ${name === "paymentFailed" ? `<div id="view-paymentFailed-variant" class="plaintext-view"><iframe class="preview-frame" srcdoc="${paymentFailedFinal.html.replace(/"/g, "&quot;")}" sandbox="allow-same-origin" style="display:block;"></iframe></div>` : ""}
      <div class="params-info">Template params: ${Object.keys(sampleData[name]).join(", ")}</div>
    </div>`;
}

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HIC Email Template Review — Stream 1C</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; color: #1f2937; }
    .header { background: #0B1220; color: #F6F8FB; padding: 24px 32px; position: sticky; top: 0; z-index: 10; }
    .header h1 { font-size: 20px; margin-bottom: 4px; }
    .header p { font-size: 13px; color: #6B7C93; }
    .nav { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 12px 32px; position: sticky; top: 76px; z-index: 9; overflow-x: auto; white-space: nowrap; }
    .nav button { background: none; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 14px; margin-right: 6px; margin-bottom: 4px; cursor: pointer; font-size: 13px; color: #374151; transition: all 0.15s; }
    .nav button:hover { background: #f9fafb; border-color: #9ca3af; }
    .nav button.active { background: #0B1220; color: #F6F8FB; border-color: #0B1220; }
    .container { max-width: 900px; margin: 0 auto; padding: 24px 32px; }
    .template-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 32px; overflow: hidden; display: none; }
    .template-card.visible { display: block; }
    .card-header { padding: 16px 24px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
    .card-header h2 { font-size: 16px; }
    .card-header p { margin: 0; }
    .badge { font-size: 11px; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; }
    .badge.internal { background: #fef3c7; color: #92400e; }
    .badge.marketing { background: #d1fae5; color: #065f46; }
    .subject-line { padding: 12px 24px; background: #f0fdf4; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    .subject-line span { font-weight: 600; }
    .view-toggle { display: flex; gap: 4px; padding: 12px 24px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    .view-toggle button { background: none; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 12px; }
    .view-toggle button.active { background: #0B1220; color: #F6F8FB; border-color: #0B1220; }
    .preview-frame { width: 100%; border: none; min-height: 500px; }
    .plaintext-view { padding: 24px; white-space: pre-wrap; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 13px; line-height: 1.7; background: #fafafa; color: #1f2937; display: none; }
    .params-info { padding: 10px 24px; background: #fffbeb; border-top: 1px solid #e5e7eb; font-size: 11px; color: #92400e; }
    .review-notes { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; }
    .review-notes h3 { font-size: 14px; color: #991b1b; margin-bottom: 8px; }
    .review-notes ul { padding-left: 20px; color: #7f1d1d; }
  </style>
</head>
<body>
  <div class="header">
    <h1>HIC Email Template Review — Stream 1C (AP 7.7 / 7.8)</h1>
    <p>12 templates rendered with sample data • Toggle HTML/Plaintext • Click links to verify routes (AP 7.8) • Generated ${new Date().toISOString().split("T")[0]}</p>
  </div>
  <div class="nav" id="nav">
    <button onclick="showAll()" id="nav-all" class="active">Show All</button>
    ${navButtons}
  </div>
  <div class="container">
    <div class="review-notes">
      <h3>Review Checklist (AP 7.7 + 7.8)</h3>
      <ul>
        <li>Tone, accuracy, branding, legal compliance across all templates</li>
        <li>Click every link — confirm correct destinations, no 404s</li>
        <li>Verify pricing references match: Individual $15/mo, $150/yr; Business $35/seat/mo, $350/seat/yr</li>
        <li>Confirm tagline consistency: "Precision Editing Tools for AI Coding Agents"</li>
        <li>Marketing emails (win-back) must have unsubscribe links; transactional must not</li>
        <li>Links rendered with staging URL (https://staging.hic-ai.com) for live click-testing</li>
      </ul>
    </div>
    ${cards}
  </div>
  <script>
    function showTemplate(name) {
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('visible'));
      document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
      document.getElementById('card-' + name).classList.add('visible');
      document.getElementById('nav-' + name).classList.add('active');
    }
    function showAll() {
      document.querySelectorAll('.template-card').forEach(c => c.classList.add('visible'));
      document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
      document.getElementById('nav-all').classList.add('active');
    }
    function toggleView(name, view, btn) {
      ['html','text','variant'].forEach(v => {
        const el = document.getElementById('view-' + name + '-' + v);
        if (el) el.style.display = 'none';
      });
      const target = document.getElementById('view-' + name + '-' + view);
      if (target) {
        target.style.display = 'block';
        // If it contains an iframe inside a plaintext-view div, show the iframe
        const iframe = target.querySelector('iframe');
        if (iframe) iframe.style.display = 'block';
      }
      btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    // Show all on load
    showAll();
  </script>
</body>
</html>`;

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, "email-preview.html");
writeFileSync(outputPath, fullHtml, "utf-8");
console.log(`\n✅ Email preview generated: ${outputPath}`);
console.log(`   Open in browser to review all 12 templates.\n`);
