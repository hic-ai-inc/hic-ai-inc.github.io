#!/usr/bin/env node
/**
 * PLG Metrics Dashboard Script
 *
 * Retrieves current values for all 7 core PLG metrics plus extended analytics.
 * Data sources: Stripe (payments), KeyGen (licenses), Amplify/CloudWatch (optional).
 *
 * Usage:
 *   node scripts/plg-metrics.js                    # Full report
 *   node scripts/plg-metrics.js --json             # JSON output
 *   node scripts/plg-metrics.js --period=7d        # Last 7 days
 *   node scripts/plg-metrics.js --period=30d       # Last 30 days (default)
 *   node scripts/plg-metrics.js --period=90d       # Last 90 days
 *
 * Required Environment Variables:
 *   STRIPE_SECRET_KEY          - Stripe API key
 *   KEYGEN_ACCOUNT_ID          - KeyGen account ID
 *   KEYGEN_PRODUCT_TOKEN       - KeyGen API token
 *
 * @see PLG Roadmap v3 Section 1.3 - PLG Metrics to Track (7 Core)
 */

import https from "https";

// ============================================================================
// Configuration
// ============================================================================

const config = {
  stripe: {
    apiKey: process.env.STRIPE_SECRET_KEY,
    baseUrl: "api.stripe.com",
  },
  keygen: {
    accountId: process.env.KEYGEN_ACCOUNT_ID,
    productToken: process.env.KEYGEN_PRODUCT_TOKEN,
    baseUrl: "api.keygen.sh",
  },
};

// Parse command line arguments
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const periodArg = args.find((a) => a.startsWith("--period="));
const period = periodArg ? periodArg.split("=")[1] : "30d";

// Calculate date range
function getDateRange(periodStr) {
  const now = new Date();
  const days = parseInt(periodStr.replace("d", ""), 10) || 30;

  const endDate = now;
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);

  return {
    days,
    startTimestamp: Math.floor(startDate.getTime() / 1000),
    endTimestamp: Math.floor(endDate.getTime() / 1000),
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

const dateRange = getDateRange(period);

// ============================================================================
// HTTP Helpers
// ============================================================================

// Mock holder for httpsRequest (set via test injection)
let _httpsRequestMock = null;

function httpsRequest(options, postData = null) {
  // Use mock if injected for tests
  if (typeof _httpsRequestMock === "function") {
    return _httpsRequestMock(options, postData);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ============================================================================
// Stripe API Functions
// ============================================================================

async function stripeRequest(endpoint, params = {}) {
  if (!config.stripe.apiKey) {
    return { error: "STRIPE_SECRET_KEY not set" };
  }

  const queryString = new URLSearchParams(params).toString();
  const path = `/v1/${endpoint}${queryString ? `?${queryString}` : ""}`;

  const options = {
    hostname: config.stripe.baseUrl,
    port: 443,
    path,
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.stripe.apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  try {
    const response = await httpsRequest(options);
    if (response.status !== 200) {
      return {
        error: response.data?.error?.message || `HTTP ${response.status}`,
      };
    }
    return response.data;
  } catch (err) {
    return { error: err.message };
  }
}

async function getStripeMetrics() {
  const metrics = {
    // Revenue metrics
    revenue: { today: 0, thisWeek: 0, thisMonth: 0, total: 0 },
    // Subscription metrics
    subscriptions: { active: 0, trialing: 0, canceled: 0, pastDue: 0 },
    // Checkout metrics
    checkouts: { completed: 0, abandoned: 0 },
    // Customer metrics
    customers: { total: 0, new: 0 },
    // Churn
    churn: { canceled: 0, rate: 0 },
  };

  // Get all subscriptions
  const subs = await stripeRequest("subscriptions", {
    limit: 100,
    status: "all",
  });
  if (subs.error) {
    return { error: subs.error, metrics };
  }

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  const weekAgo = now - 86400 * 7;
  const monthAgo = now - 86400 * 30;

  let activeAtStartOfPeriod = 0;
  let canceledInPeriod = 0;

  for (const sub of subs.data || []) {
    // Count by status
    if (sub.status === "active") metrics.subscriptions.active++;
    else if (sub.status === "trialing") metrics.subscriptions.trialing++;
    else if (sub.status === "canceled") metrics.subscriptions.canceled++;
    else if (sub.status === "past_due") metrics.subscriptions.pastDue++;

    // Churn calculation (canceled in period)
    if (sub.canceled_at && sub.canceled_at >= dateRange.startTimestamp) {
      canceledInPeriod++;
    }

    // Active at start of period (for churn rate denominator)
    if (
      sub.created < dateRange.startTimestamp &&
      (sub.status === "active" ||
        sub.status === "trialing" ||
        sub.canceled_at >= dateRange.startTimestamp)
    ) {
      activeAtStartOfPeriod++;
    }
  }

  metrics.churn.canceled = canceledInPeriod;
  metrics.churn.rate =
    activeAtStartOfPeriod > 0
      ? ((canceledInPeriod / activeAtStartOfPeriod) * 100).toFixed(2) + "%"
      : "N/A";

  // Get successful charges for revenue
  const charges = await stripeRequest("charges", {
    limit: 100,
    created: { gte: monthAgo },
  });

  if (!charges.error && charges.data) {
    for (const charge of charges.data) {
      if (charge.status === "succeeded" && !charge.refunded) {
        const amount = charge.amount / 100; // Convert cents to dollars
        metrics.revenue.total += amount;

        if (charge.created >= dayAgo) metrics.revenue.today += amount;
        if (charge.created >= weekAgo) metrics.revenue.thisWeek += amount;
        if (charge.created >= monthAgo) metrics.revenue.thisMonth += amount;
      }
    }
  }

  // Get checkout sessions for conversion tracking
  const sessions = await stripeRequest("checkout/sessions", {
    limit: 100,
    created: { gte: dateRange.startTimestamp },
  });

  if (!sessions.error && sessions.data) {
    for (const session of sessions.data) {
      if (session.payment_status === "paid") {
        metrics.checkouts.completed++;
      } else if (session.status === "expired") {
        metrics.checkouts.abandoned++;
      }
    }
  }

  // Get customer count
  const customers = await stripeRequest("customers", { limit: 1 });
  if (!customers.error) {
    // Stripe returns total_count in list response when has_more is checked
    metrics.customers.total = customers.data?.length || 0;
    // For actual count, we'd need to paginate - this is just a sample
  }

  return metrics;
}

// ============================================================================
// KeyGen API Functions
// ============================================================================

async function keygenRequest(endpoint) {
  if (!config.keygen.accountId || !config.keygen.productToken) {
    return { error: "KEYGEN_ACCOUNT_ID or KEYGEN_PRODUCT_TOKEN not set" };
  }

  const options = {
    hostname: config.keygen.baseUrl,
    port: 443,
    path: `/v1/accounts/${config.keygen.accountId}/${endpoint}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.keygen.productToken}`,
      Accept: "application/vnd.api+json",
    },
  };

  try {
    const response = await httpsRequest(options);
    if (response.status !== 200) {
      return {
        error: response.data?.errors?.[0]?.detail || `HTTP ${response.status}`,
      };
    }
    return response.data;
  } catch (err) {
    return { error: err.message };
  }
}

async function getKeygenMetrics() {
  const metrics = {
    licenses: { total: 0, active: 0, inactive: 0, suspended: 0, expired: 0 },
    machines: { total: 0, activated: 0 },
    activations: { today: 0, thisWeek: 0, thisMonth: 0 },
  };

  // Get all licenses
  const licenses = await keygenRequest("licenses?limit=100");
  if (licenses.error) {
    return { error: licenses.error, metrics };
  }

  const now = new Date();
  const dayAgo = new Date(now - 86400000);
  const weekAgo = new Date(now - 86400000 * 7);
  const monthAgo = new Date(now - 86400000 * 30);

  for (const license of licenses.data || []) {
    metrics.licenses.total++;
    const status = license.attributes?.status;
    if (status === "ACTIVE") metrics.licenses.active++;
    else if (status === "INACTIVE") metrics.licenses.inactive++;
    else if (status === "SUSPENDED") metrics.licenses.suspended++;
    else if (status === "EXPIRED") metrics.licenses.expired++;
  }

  // Get all machines (activations)
  const machines = await keygenRequest("machines?limit=100");
  if (!machines.error && machines.data) {
    for (const machine of machines.data) {
      metrics.machines.total++;
      metrics.machines.activated++;

      const createdAt = new Date(machine.attributes?.created);
      if (createdAt >= dayAgo) metrics.activations.today++;
      if (createdAt >= weekAgo) metrics.activations.thisWeek++;
      if (createdAt >= monthAgo) metrics.activations.thisMonth++;
    }
  }

  return metrics;
}

// ============================================================================
// Report Generation
// ============================================================================

async function generateReport() {
  const report = {
    generated: new Date().toISOString(),
    period: `${dateRange.days} days (${dateRange.startDate} to ${dateRange.endDate})`,
    coreMetrics: {},
    stripe: {},
    keygen: {},
    errors: [],
  };

  // Fetch data from both sources
  const [stripeMetrics, keygenMetrics] = await Promise.all([
    getStripeMetrics(),
    getKeygenMetrics(),
  ]);

  if (stripeMetrics.error) report.errors.push(`Stripe: ${stripeMetrics.error}`);
  if (keygenMetrics.error) report.errors.push(`KeyGen: ${keygenMetrics.error}`);

  report.stripe = stripeMetrics.error
    ? { error: stripeMetrics.error }
    : stripeMetrics;
  report.keygen = keygenMetrics.error
    ? { error: keygenMetrics.error }
    : keygenMetrics;

  // Calculate 7 Core PLG Metrics
  report.coreMetrics = {
    // 1. Visitors - Would need Plausible/CloudWatch for this
    visitors: "N/A (requires Plausible or CloudWatch)",

    // 2. Pricing Page Views - Would need Plausible for this
    pricingPageViews: "N/A (requires Plausible)",

    // 3. Checkout Started - From Stripe sessions
    checkoutStarted:
      (stripeMetrics.checkouts?.completed || 0) +
      (stripeMetrics.checkouts?.abandoned || 0),

    // 4. Checkout Completed - From Stripe
    checkoutCompleted: stripeMetrics.checkouts?.completed || 0,

    // 5. Trial Activations - From KeyGen machines
    trialActivations: keygenMetrics.activations?.thisMonth || 0,

    // 6. Conversions (Trial→Paid) - Active subscriptions
    conversions: stripeMetrics.subscriptions?.active || 0,

    // 7. Churn - Canceled subscriptions in period
    churn: {
      count: stripeMetrics.churn?.canceled || 0,
      rate: stripeMetrics.churn?.rate || "N/A",
    },
  };

  return report;
}

function formatReport(report) {
  const divider = "═".repeat(60);
  const lines = [];

  lines.push("");
  lines.push(divider);
  lines.push("  📊 PLG METRICS DASHBOARD");
  lines.push(divider);
  lines.push(`  Generated: ${report.generated}`);
  lines.push(`  Period: ${report.period}`);
  lines.push("");

  // Core Metrics
  lines.push("  ┌─────────────────────────────────────────────────────────┐");
  lines.push("  │  7 CORE PLG METRICS                                     │");
  lines.push("  ├─────────────────────────────────────────────────────────┤");
  lines.push(
    `  │  1. Visitors:              ${String(report.coreMetrics.visitors).padEnd(27)}│`,
  );
  lines.push(
    `  │  2. Pricing Page Views:    ${String(report.coreMetrics.pricingPageViews).padEnd(27)}│`,
  );
  lines.push(
    `  │  3. Checkout Started:      ${String(report.coreMetrics.checkoutStarted).padEnd(27)}│`,
  );
  lines.push(
    `  │  4. Checkout Completed:    ${String(report.coreMetrics.checkoutCompleted).padEnd(27)}│`,
  );
  lines.push(
    `  │  5. Trial Activations:     ${String(report.coreMetrics.trialActivations).padEnd(27)}│`,
  );
  lines.push(
    `  │  6. Conversions:           ${String(report.coreMetrics.conversions).padEnd(27)}│`,
  );
  lines.push(
    `  │  7. Churn:                 ${String(report.coreMetrics.churn.count + " (" + report.coreMetrics.churn.rate + ")").padEnd(27)}│`,
  );
  lines.push("  └─────────────────────────────────────────────────────────┘");
  lines.push("");

  // Stripe Metrics
  if (!report.stripe.error) {
    lines.push("  ┌─────────────────────────────────────────────────────────┐");
    lines.push("  │  💳 STRIPE (PAYMENTS)                                   │");
    lines.push("  ├─────────────────────────────────────────────────────────┤");
    lines.push("  │  Revenue                                                │");
    lines.push(
      `  │    Today:      $${String(report.stripe.revenue?.today?.toFixed(2) || "0.00").padEnd(40)}│`,
    );
    lines.push(
      `  │    This Week:  $${String(report.stripe.revenue?.thisWeek?.toFixed(2) || "0.00").padEnd(40)}│`,
    );
    lines.push(
      `  │    This Month: $${String(report.stripe.revenue?.thisMonth?.toFixed(2) || "0.00").padEnd(40)}│`,
    );
    lines.push("  │                                                         │");
    lines.push("  │  Subscriptions                                          │");
    lines.push(
      `  │    Active:     ${String(report.stripe.subscriptions?.active || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Trialing:   ${String(report.stripe.subscriptions?.trialing || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Past Due:   ${String(report.stripe.subscriptions?.pastDue || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Canceled:   ${String(report.stripe.subscriptions?.canceled || 0).padEnd(42)}│`,
    );
    lines.push("  │                                                         │");
    lines.push("  │  Checkouts                                              │");
    lines.push(
      `  │    Completed:  ${String(report.stripe.checkouts?.completed || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Abandoned:  ${String(report.stripe.checkouts?.abandoned || 0).padEnd(42)}│`,
    );
    const convRate =
      report.stripe.checkouts?.completed + report.stripe.checkouts?.abandoned >
      0
        ? (
            (report.stripe.checkouts?.completed /
              (report.stripe.checkouts?.completed +
                report.stripe.checkouts?.abandoned)) *
            100
          ).toFixed(1) + "%"
        : "N/A";
    lines.push(`  │    Conv. Rate: ${String(convRate).padEnd(42)}│`);
    lines.push("  └─────────────────────────────────────────────────────────┘");
  } else {
    lines.push(`  ⚠️  Stripe Error: ${report.stripe.error}`);
  }
  lines.push("");

  // KeyGen Metrics
  if (!report.keygen.error) {
    lines.push("  ┌─────────────────────────────────────────────────────────┐");
    lines.push("  │  🔑 KEYGEN (LICENSES)                                   │");
    lines.push("  ├─────────────────────────────────────────────────────────┤");
    lines.push("  │  Licenses                                               │");
    lines.push(
      `  │    Total:      ${String(report.keygen.licenses?.total || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Active:     ${String(report.keygen.licenses?.active || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Inactive:   ${String(report.keygen.licenses?.inactive || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Suspended:  ${String(report.keygen.licenses?.suspended || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Expired:    ${String(report.keygen.licenses?.expired || 0).padEnd(42)}│`,
    );
    lines.push("  │                                                         │");
    lines.push("  │  Activations (Machines)                                 │");
    lines.push(
      `  │    Total:      ${String(report.keygen.machines?.total || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    Today:      ${String(report.keygen.activations?.today || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    This Week:  ${String(report.keygen.activations?.thisWeek || 0).padEnd(42)}│`,
    );
    lines.push(
      `  │    This Month: ${String(report.keygen.activations?.thisMonth || 0).padEnd(42)}│`,
    );
    lines.push("  └─────────────────────────────────────────────────────────┘");
  } else {
    lines.push(`  ⚠️  KeyGen Error: ${report.keygen.error}`);
  }
  lines.push("");

  // Errors
  if (report.errors.length > 0) {
    lines.push("  ⚠️  ERRORS:");
    for (const err of report.errors) {
      lines.push(`      - ${err}`);
    }
    lines.push("");
  }

  // Notes
  lines.push("  📝 NOTES:");
  lines.push("      - Visitors/Page Views require Plausible or CloudWatch");
  lines.push("      - Run with --json for machine-readable output");
  lines.push("      - Run with --period=7d|30d|90d to change date range");
  lines.push("");
  lines.push(divider);
  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    const report = await generateReport();

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report));
    }

    // Exit with error code if there were issues
    if (report.errors.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  }
}

// ============================================================================
// Test Injection Points
// ============================================================================

/**
 * Set a mock for httpsRequest (for testing)
 * @param {Function} mockFn - Mock function
 */
function __setHttpsRequestForTests(mockFn) {
  _httpsRequestMock = mockFn;
}

/**
 * Reset httpsRequest to real implementation
 */
function __resetHttpsRequestForTests() {
  _httpsRequestMock = null;
}

/**
 * Get internal https request mock (used by httpsRequest)
 */
function __getHttpsRequestMock() {
  return _httpsRequestMock;
}

/**
 * Set config for testing
 */
function __setConfigForTests(newConfig) {
  if (newConfig.stripe) Object.assign(config.stripe, newConfig.stripe);
  if (newConfig.keygen) Object.assign(config.keygen, newConfig.keygen);
}

/**
 * Reset config to env vars
 */
function __resetConfigForTests() {
  config.stripe.apiKey = process.env.STRIPE_SECRET_KEY;
  config.keygen.accountId = process.env.KEYGEN_ACCOUNT_ID;
  config.keygen.productToken = process.env.KEYGEN_PRODUCT_TOKEN;
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  getDateRange,
  httpsRequest,
  stripeRequest,
  getStripeMetrics,
  keygenRequest,
  getKeygenMetrics,
  generateReport,
  formatReport,
  config,
  __setHttpsRequestForTests,
  __resetHttpsRequestForTests,
  __getHttpsRequestMock,
  __setConfigForTests,
  __resetConfigForTests,
};

// Only run main if this is the entry point
const isMainModule = process.argv[1]?.endsWith("plg-metrics.js");
if (isMainModule) {
  main();
}
