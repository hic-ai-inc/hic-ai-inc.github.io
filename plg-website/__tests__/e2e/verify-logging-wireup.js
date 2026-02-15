#!/usr/bin/env node
/**
 * Structured Logging Wire-Up Verification Script
 *
 * Hits every wired API endpoint with a unique probe ID, waits for
 * CloudWatch logs to propagate, then queries CloudWatch to verify
 * that structured JSON log entries actually appeared.
 *
 * This proves the full pipeline:
 *   createApiLogger() → log.requestReceived() → console.log(JSON.stringify())
 *   → Amplify SSR stdout capture → CloudWatch log group
 *
 * Requires:
 *   - AWS SSO session active (aws sso login --profile ...)
 *   - E2E_ENV=staging (default) — must hit a deployed environment
 *   - CloudWatch log group /aws/amplify/d2yhz9h4xdd5rb exists
 *
 * Usage:
 *   npm run test:logging-wireup                              (staging, default)
 *   npm run test:logging-wireup -- --env production           (production)
 *   npm run test:logging-wireup -- --skip-cloudwatch          (HTTP-only)
 *   npm run test:logging-wireup -- --endpoint 1,2,3           (subset)
 *   npm run test:logging-wireup -- --poll-seconds 20          (slow CW)
 *
 * @see docs/plg/20260215_REPORT_ON_STRUCTURED_LOGGING_INTEGRATION_WITH_AMPLIFY.md
 */

import { getEnvironment } from "./config.js";

// ============================================================================
// Constants
// ============================================================================

const LOG_GROUP_NAME = "/aws/amplify/d2yhz9h4xdd5rb";
const AWS_REGION = "us-east-1";

// Time to wait for CloudWatch ingestion before querying (ms)
const DEFAULT_POLL_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 3_000;

// ============================================================================
// Endpoint Test Definitions — All 33 Handlers
// ============================================================================

const ENDPOINT_TESTS = [
  // --- Checkout (2) ---
  {
    id: 1,
    endpoint: "/api/checkout",
    method: "POST",
    body: {},
    expectedStatuses: [400],
    service: "plg-api-checkout",
    description: "Checkout create — empty body → 400",
  },
  {
    id: 2,
    endpoint: "/api/checkout/verify",
    method: "GET",
    expectedStatuses: [400],
    service: "plg-api-checkout-verify",
    description: "Checkout verify — no session_id → 400",
  },

  // --- License (8) ---
  {
    id: 3,
    endpoint: "/api/license/activate",
    method: "POST",
    body: { licenseKey: "wireup-test" },
    expectedStatuses: [401],
    service: "plg-api-license-activate",
    description: "License activate — no auth → 401",
  },
  {
    id: 4,
    endpoint: "/api/license/check",
    method: "GET",
    expectedStatuses: [400],
    service: "plg-api-license-check",
    description: "License check — missing email → 400",
  },
  {
    id: 5,
    endpoint: "/api/license/deactivate",
    method: "DELETE",
    body: {},
    expectedStatuses: [400],
    service: "plg-api-license-deactivate",
    description: "License deactivate DELETE — missing fields → 400",
  },
  {
    id: 6,
    endpoint: "/api/license/deactivate",
    method: "POST",
    body: {},
    expectedStatuses: [400],
    service: "plg-api-license-deactivate",
    description: "License deactivate POST — missing fields → 400",
  },
  {
    id: 7,
    endpoint: "/api/license/heartbeat",
    method: "POST",
    body: { fingerprint: "wireup-test-fp" },
    expectedStatuses: [200, 400, 500],
    service: "plg-api-license-heartbeat",
    description: "License heartbeat — trial path or validation error",
  },
  {
    id: 8,
    endpoint: "/api/license/validate",
    method: "POST",
    body: {},
    expectedStatuses: [400],
    service: "plg-api-license-validate",
    description: "License validate — missing fingerprint → 400",
  },
  {
    id: 9,
    endpoint: "/api/license/trial/init",
    method: "POST",
    body: { fingerprint: "abc" },
    expectedStatuses: [400],
    service: "plg-api-license-trial-init",
    description: "Trial init POST — invalid fingerprint → 400",
  },
  {
    id: 10,
    endpoint: "/api/license/trial/init",
    method: "GET",
    query: { fingerprint: "abc" },
    expectedStatuses: [400],
    service: "plg-api-license-trial-init",
    description: "Trial init GET — invalid fingerprint → 400",
  },

  // --- Portal (18) ---
  {
    id: 11,
    endpoint: "/api/portal/billing",
    method: "GET",
    expectedStatuses: [401],
    service: "plg-api-portal-billing",
    description: "Portal billing — no auth → 401",
  },
  {
    id: 12,
    endpoint: "/api/portal/devices",
    method: "GET",
    expectedStatuses: [401],
    service: "plg-api-portal-devices",
    description: "Portal devices — no auth → 401",
  },
  {
    id: 13,
    endpoint: "/api/portal/invite/wireup-fake-token",
    method: "GET",
    expectedStatuses: [400, 404, 500],
    service: "plg-api-portal-invite",
    description: "Portal invite GET — fake token lookup",
  },
  {
    id: 14,
    endpoint: "/api/portal/invite/wireup-fake-token",
    method: "POST",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-invite",
    description: "Portal invite POST — no auth → 401",
  },
  {
    id: 15,
    endpoint: "/api/portal/license",
    method: "GET",
    expectedStatuses: [401],
    service: "plg-api-portal-license",
    description: "Portal license — no auth → 401",
  },
  {
    id: 16,
    endpoint: "/api/portal/seats",
    method: "GET",
    expectedStatuses: [401],
    service: "plg-api-portal-seats",
    description: "Portal seats GET — no auth → 401",
  },
  {
    id: 17,
    endpoint: "/api/portal/seats",
    method: "POST",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-seats",
    description: "Portal seats POST — no auth → 401",
  },
  {
    id: 18,
    endpoint: "/api/portal/settings",
    method: "GET",
    expectedStatuses: [401],
    service: "plg-api-portal-settings",
    description: "Portal settings GET — no auth → 401",
  },
  {
    id: 19,
    endpoint: "/api/portal/settings",
    method: "PATCH",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-settings",
    description: "Portal settings PATCH — no auth → 401",
  },
  {
    id: 20,
    endpoint: "/api/portal/settings/delete-account",
    method: "POST",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-settings-delete",
    description: "Portal delete-account POST — no auth → 401",
  },
  {
    id: 21,
    endpoint: "/api/portal/settings/delete-account",
    method: "DELETE",
    expectedStatuses: [401],
    service: "plg-api-portal-settings-delete",
    description: "Portal delete-account DELETE — no auth → 401",
  },
  {
    id: 22,
    endpoint: "/api/portal/settings/export",
    method: "POST",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-settings-export",
    description: "Portal export — no auth → 401",
  },
  {
    id: 23,
    endpoint: "/api/portal/settings/leave-organization",
    method: "POST",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-settings-leave-org",
    description: "Portal leave-org — no auth → 401",
  },
  {
    id: 24,
    endpoint: "/api/portal/status",
    method: "GET",
    expectedStatuses: [401],
    service: "plg-api-portal-status",
    description: "Portal status — no auth → 401",
  },
  {
    id: 25,
    endpoint: "/api/portal/stripe-session",
    method: "POST",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-stripe-session",
    description: "Portal stripe-session — no auth → 401",
  },
  {
    id: 26,
    endpoint: "/api/portal/team",
    method: "GET",
    expectedStatuses: [401],
    service: "plg-api-portal-team",
    description: "Portal team GET — no auth → 401",
  },
  {
    id: 27,
    endpoint: "/api/portal/team",
    method: "POST",
    body: {},
    expectedStatuses: [401],
    service: "plg-api-portal-team",
    description: "Portal team POST — no auth → 401",
  },
  {
    id: 28,
    endpoint: "/api/portal/team",
    method: "DELETE",
    expectedStatuses: [401],
    service: "plg-api-portal-team",
    description: "Portal team DELETE — no auth → 401",
  },

  // --- Webhooks (2) ---
  {
    id: 29,
    endpoint: "/api/webhooks/stripe",
    method: "POST",
    body: {},
    expectedStatuses: [400],
    service: "plg-api-webhooks-stripe",
    description: "Stripe webhook — no signature → 400",
  },
  {
    id: 30,
    endpoint: "/api/webhooks/keygen",
    method: "POST",
    body: {},
    expectedStatuses: [400, 401],
    service: "plg-api-webhooks-keygen",
    description: "Keygen webhook — no signature → 401",
  },

  // --- Provisioning / Admin (3) ---
  {
    id: 31,
    endpoint: "/api/provision-license",
    method: "POST",
    body: { sessionId: "wireup-test" },
    expectedStatuses: [401],
    service: "plg-api-provision-license",
    description: "Provision license — no auth → 401",
  },
  {
    id: 32,
    endpoint: "/api/admin/provision-test-license",
    method: "POST",
    body: { email: "wireup@test.hic-ai.com" },
    expectedStatuses: [401, 403],
    service: "plg-api-admin-provision-test",
    description: "Admin provision POST — no key → 401/403",
  },
  {
    id: 33,
    endpoint: "/api/admin/provision-test-license",
    method: "GET",
    expectedStatuses: [200, 403],
    service: "plg-api-admin-provision-test",
    description: "Admin provision GET — info endpoint",
  },
];

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    env: null,
    skipCloudWatch: false,
    endpointFilter: null,
    pollSeconds: DEFAULT_POLL_WAIT_MS / 1000,
    help: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--env":
        options.env = args[++i];
        break;
      case "--skip-cloudwatch":
        options.skipCloudWatch = true;
        break;
      case "--endpoint":
      case "-e":
        options.endpointFilter = args[++i]
          .split(",")
          .map((n) => parseInt(n.trim(), 10));
        break;
      case "--poll-seconds":
      case "-p":
        options.pollSeconds = parseInt(args[++i], 10);
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Structured Logging Wire-Up Verification

Sends probe requests to all 33 wired API handlers, then queries
CloudWatch to verify structured log entries appeared.

Usage:
  node __tests__/e2e/verify-logging-wireup.js [options]

Options:
  --env <name>              Target environment: staging (default) or production
  -e, --endpoint <ids>      Test specific endpoints (comma-separated IDs, 1-33)
  -p, --poll-seconds <n>    CloudWatch poll wait in seconds (default: ${DEFAULT_POLL_WAIT_MS / 1000})
  --skip-cloudwatch         Skip CloudWatch verification (HTTP-only mode)
  -v, --verbose             Show detailed output per test
  -h, --help                Show this help

Examples:
  # Full verification against staging (default)
  npm run test:logging-wireup

  # Full verification against production
  npm run test:logging-wireup -- --env production

  # Test only checkout endpoints
  npm run test:logging-wireup -- -e 1,2

  # Longer CloudWatch poll (slow ingestion)
  npm run test:logging-wireup -- -p 30
`);
}

// ============================================================================
// HTTP Request Helpers
// ============================================================================

/**
 * Send a probe request to an endpoint.
 * Returns { status, data, probeId, error? }
 */
async function sendProbeRequest(env, test, probeId) {
  const baseUrl = env.apiBase;
  let url = `${baseUrl}${test.endpoint}`;

  if (test.query) {
    const params = new URLSearchParams(test.query);
    url = `${url}?${params.toString()}`;
  }

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "HIC-Wireup-Verifier/1.0",
    "x-hic-probe-id": probeId,
    "x-correlation-id": probeId,
  };

  const fetchOptions = {
    method: test.method,
    headers,
  };

  if (test.body && test.method !== "GET") {
    fetchOptions.body = JSON.stringify(test.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  fetchOptions.signal = controller.signal;

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeout);

    let data = null;
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }
    } else {
      data = await response.text();
    }

    return { status: response.status, data, probeId };
  } catch (err) {
    clearTimeout(timeout);
    return {
      status: 0,
      data: null,
      probeId,
      error: err.name === "AbortError" ? "TIMEOUT" : err.message,
    };
  }
}

// ============================================================================
// CloudWatch Query Helpers
// ============================================================================

let _cwClient = null;
let _FilterLogEventsCommand = null;

async function getCwClient() {
  if (_cwClient)
    return {
      client: _cwClient,
      FilterLogEventsCommand: _FilterLogEventsCommand,
    };

  const { CloudWatchLogsClient, FilterLogEventsCommand } =
    await import("@aws-sdk/client-cloudwatch-logs");

  _cwClient = new CloudWatchLogsClient({ region: AWS_REGION });
  _FilterLogEventsCommand = FilterLogEventsCommand;
  return { client: _cwClient, FilterLogEventsCommand };
}

/**
 * Query CloudWatch for log events matching a probe ID.
 * Uses the JSON filter pattern syntax for structured logs.
 *
 * @param {string} probeId - The probe ID to search for
 * @param {number} startTime - Epoch ms for search window start
 * @param {number} endTime - Epoch ms for search window end
 * @returns {Promise<Array>} Matched log events
 */
async function queryCloudWatchForProbe(probeId, startTime, endTime) {
  const { client, FilterLogEventsCommand } = await getCwClient();

  // Use CloudWatch JSON filter pattern to find our probe ID in the
  // correlationId field of the structured JSON log entries
  const filterPattern = `"${probeId}"`;

  try {
    const response = await client.send(
      new FilterLogEventsCommand({
        logGroupName: LOG_GROUP_NAME,
        startTime,
        endTime,
        filterPattern,
        limit: 100,
      }),
    );

    return (response.events || []).map((event) => {
      let parsed = null;
      try {
        parsed = JSON.parse(event.message);
      } catch {
        // Not JSON — Amplify runtime logs, ignore
      }
      return {
        timestamp: event.timestamp,
        message: event.message,
        parsed,
        logStreamName: event.logStreamName,
      };
    });
  } catch (err) {
    // AccessDeniedException, ResourceNotFoundException, etc.
    return { error: err.name, message: err.message };
  }
}

/**
 * Poll CloudWatch until at least one matching log event appears,
 * or until the poll timeout expires.
 */
async function waitForCloudWatchLogs(
  probeId,
  searchStartTime,
  pollWaitMs,
  verbose = false,
) {
  const deadline = Date.now() + pollWaitMs;
  const endTime = Date.now() + pollWaitMs + 60_000; // wide end window
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;
    const result = await queryCloudWatchForProbe(
      probeId,
      searchStartTime,
      endTime,
    );

    // Error from AWS SDK
    if (result && result.error) {
      return { found: false, events: [], error: result.message, attempts };
    }

    // Filter to only structured JSON entries with our probe ID
    const structured = result.filter(
      (e) =>
        e.parsed &&
        (e.parsed.correlationId === probeId || e.parsed.probeId === probeId),
    );

    if (structured.length > 0) {
      return { found: true, events: structured, error: null, attempts };
    }

    if (verbose) {
      process.stdout.write(".");
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return { found: false, events: [], error: "TIMEOUT", attempts };
}

// ============================================================================
// Validation Logic
// ============================================================================

/**
 * Validate a single CloudWatch log event has the expected structured fields.
 */
function validateLogEntry(entry, test) {
  const issues = [];
  const p = entry.parsed;

  if (!p) {
    issues.push("Log entry is not valid JSON");
    return issues;
  }

  // Required fields from HicLog._log()
  if (!p.timestamp) issues.push("Missing field: timestamp");
  if (!p.level) issues.push("Missing field: level");
  if (!p.service) issues.push("Missing field: service");
  if (!p.correlationId) issues.push("Missing field: correlationId");
  if (!p.event) issues.push("Missing field: event");
  if (!p.message) issues.push("Missing field: message");

  // Service name should match expected
  if (p.service && p.service !== test.service) {
    issues.push(
      `Service mismatch: expected "${test.service}", got "${p.service}"`,
    );
  }

  // Must have at least one request_received event across the batch
  // (checked at the batch level in runSingleTest)

  return issues;
}

// ============================================================================
// Test Execution
// ============================================================================

async function runSingleTest(env, test, options) {
  const ts = Date.now();
  const probeId = `wireup-${test.id}-${test.method.toLowerCase()}-${ts}`;
  const searchStartTime = ts - 5_000; // 5s buffer before request

  // --- Phase 1: Send HTTP probe ---
  const httpResult = await sendProbeRequest(env, test, probeId);

  const httpPass = test.expectedStatuses.includes(httpResult.status);
  const httpDetail = httpResult.error
    ? `ERROR: ${httpResult.error}`
    : `HTTP ${httpResult.status}`;

  if (!httpPass) {
    return {
      test,
      probeId,
      httpPass: false,
      httpStatus: httpResult.status,
      httpDetail: `${httpDetail} (expected: ${test.expectedStatuses.join("|")})`,
      cwPass: false,
      cwDetail: "SKIPPED (HTTP failed)",
      cwEvents: [],
      pass: false,
    };
  }

  // --- Phase 2: Query CloudWatch ---
  if (options.skipCloudWatch) {
    return {
      test,
      probeId,
      httpPass: true,
      httpStatus: httpResult.status,
      httpDetail,
      cwPass: null,
      cwDetail: "SKIPPED",
      cwEvents: [],
      pass: true,
    };
  }

  const pollWaitMs = options.pollSeconds * 1000;

  if (options.verbose) {
    process.stdout.write(`  CloudWatch poll (up to ${options.pollSeconds}s)`);
  }

  const cwResult = await waitForCloudWatchLogs(
    probeId,
    searchStartTime,
    pollWaitMs,
    options.verbose,
  );

  if (options.verbose) {
    process.stdout.write("\n");
  }

  if (!cwResult.found) {
    return {
      test,
      probeId,
      httpPass: true,
      httpStatus: httpResult.status,
      httpDetail,
      cwPass: false,
      cwDetail:
        cwResult.error === "TIMEOUT"
          ? `NOT FOUND after ${cwResult.attempts} polls (${options.pollSeconds}s)`
          : `AWS ERROR: ${cwResult.error}`,
      cwEvents: [],
      pass: false,
    };
  }

  // --- Phase 3: Validate structured content ---
  const events = cwResult.events;
  const allIssues = [];
  let hasRequestReceived = false;

  for (const event of events) {
    const issues = validateLogEntry(event, test);
    if (issues.length > 0) {
      allIssues.push(...issues);
    }
    if (event.parsed?.event === "request_received") {
      hasRequestReceived = true;
    }
  }

  if (!hasRequestReceived) {
    allIssues.push(
      'No "request_received" event found — log.requestReceived() may not be called',
    );
  }

  const cwPass = allIssues.length === 0;

  return {
    test,
    probeId,
    httpPass: true,
    httpStatus: httpResult.status,
    httpDetail,
    cwPass,
    cwDetail: cwPass
      ? `${events.length} entries, ${cwResult.attempts} polls`
      : allIssues.join("; "),
    cwEvents: events,
    pass: cwPass,
  };
}

// ============================================================================
// Report Formatting
// ============================================================================

function formatReport(results, env, options) {
  const divider = "=".repeat(100);
  const thinDivider = "-".repeat(100);
  const lines = [];

  lines.push("");
  lines.push(divider);
  lines.push("  Structured Logging Wire-Up Verification");
  lines.push(`  Target: ${env.apiBase}`);
  lines.push(`  Log Group: ${LOG_GROUP_NAME}`);
  lines.push(`  Date: ${new Date().toISOString()}`);
  lines.push(
    `  Mode: ${options.skipCloudWatch ? "HTTP-only (CloudWatch skipped)" : "Full (HTTP + CloudWatch)"}`,
  );
  lines.push(divider);
  lines.push("");

  // Column headers
  const hdr = [
    pad("#", 4),
    pad("Endpoint", 45),
    pad("Method", 7),
    pad("HTTP", 6),
    pad("CloudWatch", 55),
    pad("Result", 6),
  ].join(" ");
  lines.push(hdr);
  lines.push(thinDivider);

  for (const r of results) {
    const cwCol =
      r.cwPass === null
        ? "SKIPPED"
        : r.cwPass
          ? `OK (${r.cwDetail})`
          : `FAIL: ${r.cwDetail}`;

    const resultCol = r.pass ? "PASS" : "FAIL";

    const row = [
      pad(String(r.test.id), 4),
      pad(r.test.endpoint, 45),
      pad(r.test.method, 7),
      pad(String(r.httpStatus), 6),
      pad(cwCol, 55),
      pad(resultCol, 6),
    ].join(" ");

    lines.push(row);
  }

  lines.push(thinDivider);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const total = results.length;

  lines.push("");
  lines.push(`  Summary: ${passed}/${total} PASS | ${failed} FAIL`);

  if (failed > 0) {
    lines.push("");
    lines.push("  Failed endpoints:");
    for (const r of results.filter((r) => !r.pass)) {
      lines.push(`    #${r.test.id} ${r.test.method} ${r.test.endpoint}`);
      if (!r.httpPass) lines.push(`      HTTP: ${r.httpDetail}`);
      if (r.cwPass === false) lines.push(`      CW:   ${r.cwDetail}`);
      lines.push(`      Probe: ${r.probeId}`);
    }
  }

  lines.push("");
  lines.push(divider);

  return lines.join("\n");
}

function pad(str, len) {
  return str.length >= len
    ? str.slice(0, len)
    : str + " ".repeat(len - str.length);
}

// ============================================================================
// Verbose Detail Output
// ============================================================================

function printVerboseDetail(result) {
  if (result.cwEvents.length > 0) {
    console.log(`    CloudWatch entries for probe ${result.probeId}:`);
    for (const event of result.cwEvents) {
      if (event.parsed) {
        console.log(
          `      [${event.parsed.level}] ${event.parsed.event}: ${event.parsed.message}`,
        );
      } else {
        console.log(`      (raw) ${event.message?.slice(0, 120)}`);
      }
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Environment — --env flag takes priority, then E2E_ENV, then defaults to staging
  if (options.env) {
    process.env.E2E_ENV = options.env;
  } else if (!process.env.E2E_ENV) {
    process.env.E2E_ENV = "staging";
  }

  let env;
  try {
    env = getEnvironment();
  } catch (err) {
    console.error(`Environment error: ${err.message}`);
    process.exit(1);
  }

  if (env.name === "local" && !options.skipCloudWatch) {
    console.error(
      "CloudWatch verification requires a deployed environment (staging/production).",
    );
    console.error(
      "Use --env staging or --env production, or add --skip-cloudwatch for HTTP-only mode.",
    );
    process.exit(1);
  }

  // Filter endpoints if requested
  let tests = ENDPOINT_TESTS;
  if (options.endpointFilter) {
    tests = tests.filter((t) => options.endpointFilter.includes(t.id));
    if (tests.length === 0) {
      console.error(
        `No endpoints match filter: ${options.endpointFilter.join(",")}`,
      );
      process.exit(1);
    }
  }

  // Pre-flight: verify CloudWatch access
  if (!options.skipCloudWatch) {
    console.log(`Verifying CloudWatch access to ${LOG_GROUP_NAME}...`);
    try {
      const { client, FilterLogEventsCommand } = await getCwClient();
      await client.send(
        new FilterLogEventsCommand({
          logGroupName: LOG_GROUP_NAME,
          startTime: Date.now() - 60_000,
          endTime: Date.now(),
          filterPattern: '"preflight-check"',
          limit: 1,
        }),
      );
      console.log("CloudWatch access confirmed.\n");
    } catch (err) {
      console.error(`CloudWatch access failed: ${err.name} — ${err.message}`);
      console.error(
        "Ensure your AWS SSO session is active (aws sso login) and the log group exists.",
      );
      process.exit(1);
    }
  }

  // Run tests
  console.log(
    `Running ${tests.length} endpoint tests against ${env.apiBase}...`,
  );
  if (!options.skipCloudWatch) {
    console.log(`CloudWatch poll wait: ${options.pollSeconds}s per endpoint\n`);
  }

  const results = [];

  for (const test of tests) {
    const label = `#${pad(String(test.id), 2)} ${pad(test.method, 6)} ${test.endpoint}`;
    process.stdout.write(`${label} ... `);

    const result = await runSingleTest(env, test, options);
    results.push(result);

    if (result.pass) {
      console.log(`PASS (HTTP ${result.httpStatus})`);
    } else {
      console.log(`FAIL`);
    }

    if (options.verbose) {
      printVerboseDetail(result);
    }
  }

  // Report
  const report = formatReport(results, env, options);
  console.log(report);

  // Exit code
  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed > 0 ? 1 : 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
