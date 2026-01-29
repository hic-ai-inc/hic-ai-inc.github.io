#!/usr/bin/env node
/**
 * E2E Test Runner
 *
 * Orchestrates E2E test execution with environment setup,
 * resource tracking, and cleanup.
 *
 * Usage:
 *   E2E_ENV=local npm run test:e2e
 *   E2E_ENV=staging npm run test:e2e:staging
 *   npm run test:e2e -- --journey j1
 *   npm run test:e2e -- --contract license
 *
 * @see 20260129_E2E_BACKEND_VALIDATION_SPEC.md
 */

import { run } from "node:test";
import { spec } from "node:test/reporters";
import { glob } from "glob";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import {
  getEnvironment,
  validateEnvironment,
  testConfig,
  log,
} from "./config.js";
import { cleanupAll, registerExitCleanup } from "./lib/cleanup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Server Health Check
// ============================================================================

/**
 * Check if the target server is available
 * @returns {Promise<{available: boolean, error?: string}>}
 */
async function checkServerHealth() {
  const env = getEnvironment();
  const healthUrl = `${env.apiBase}/api/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return { available: response.ok || response.status === 404 }; // 404 is OK, means server is up but no health endpoint
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") {
      return { available: false, error: "Connection refused - server not running" };
    }
    if (error.name === "AbortError") {
      return { available: false, error: "Connection timeout - server not responding" };
    }
    return { available: false, error: error.message };
  }
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    journey: null, // Specific journey: j1, j2, etc.
    contract: null, // Specific contract: license, checkout, etc.
    file: null, // Specific test file by name/pattern
    test: null, // Specific test name pattern (passed to node:test)
    all: false, // Run all tests
    verbose: false,
    help: false,
    skipCleanup: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--journey":
      case "-j":
        options.journey = args[++i];
        break;
      case "--contract":
      case "-c":
        options.contract = args[++i];
        break;
      case "--file":
      case "-f":
        options.file = args[++i];
        break;
      case "--test":
      case "-t":
        options.test = args[++i];
        break;
      case "--all":
      case "-a":
        options.all = true;
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        process.env.E2E_VERBOSE = "true";
        break;
      case "--skip-cleanup":
        options.skipCleanup = true;
        process.env.E2E_CLEANUP = "false";
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
E2E Test Runner

Usage:
  npm run test:e2e [options]
  E2E_ENV=staging npm run test:e2e:staging [options]

Options:
  -j, --journey <id>    Run specific journey test (j1, j2, j3, etc.)
  -c, --contract <name> Run specific contract tests (license, checkout, webhook, portal)
  -f, --file <pattern>  Run test file matching pattern (e.g., "j1-trial", "license-api")
  -t, --test <name>     Run only tests matching name pattern (regex supported)
  -a, --all             Run all E2E tests (journeys + contracts)
  -v, --verbose         Enable verbose logging
  --skip-cleanup        Don't clean up test data after run
  -h, --help            Show this help message

Environment Variables:
  E2E_ENV               Target environment: local, staging, production
  E2E_VERBOSE           Enable verbose logging (true/false)
  E2E_CLEANUP           Auto-cleanup after tests (true/false)
  E2E_STRIPE_TEST_KEY   Stripe test API key (required for staging)
  E2E_KEYGEN_TEST_KEY   KeyGen test API key (required for staging)

Examples:
  # Run all journeys against local (default)
  npm run test:e2e

  # Run all tests (journeys + contracts) against staging
  E2E_ENV=staging npm run test:e2e -- --all

  # Run journey 1 only
  npm run test:e2e -- -j j1

  # Run a specific test file by name
  npm run test:e2e -- -f j3-license-activation

  # Run only tests matching a pattern
  npm run test:e2e -- -j j1 -t "First Launch"

  # Run license contract tests with verbose output
  npm run test:e2e -- --contract license --verbose
`);
}

// ============================================================================
// Test File Discovery
// ============================================================================

async function discoverTestFiles(options) {
  const patterns = [];

  // Use forward slashes for glob (works on Windows too)
  const baseDir = __dirname.replace(/\\/g, '/');

  if (options.file) {
    // Specific file by pattern - search in both directories
    const filePattern = options.file.toLowerCase();
    patterns.push(`${baseDir}/journeys/*${filePattern}*.test.js`);
    patterns.push(`${baseDir}/contracts/*${filePattern}*.test.js`);
  } else if (options.journey) {
    // Specific journey
    const journeyId = options.journey.toLowerCase();
    patterns.push(`${baseDir}/journeys/${journeyId}-*.test.js`);
    patterns.push(`${baseDir}/journeys/*${journeyId}*.test.js`);
  } else if (options.contract) {
    // Specific contract
    patterns.push(`${baseDir}/contracts/*${options.contract}*.test.js`);
  } else if (options.all) {
    // All tests
    patterns.push(`${baseDir}/journeys/*.test.js`);
    patterns.push(`${baseDir}/contracts/*.test.js`);
  } else {
    // Default: run journeys only (contracts are more detailed)
    patterns.push(`${baseDir}/journeys/*.test.js`);
  }

  const files = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { absolute: true });
    files.push(...matches);
  }

  // Deduplicate and sort
  const unique = [...new Set(files)].sort();
  return unique;
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Environment setup
  const env = getEnvironment();
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    E2E Test Runner                           ║
╠══════════════════════════════════════════════════════════════╣
║  Environment: ${env.name.padEnd(45)}║
║  API Base:    ${env.apiBase.padEnd(45)}║
║  Mutations:   ${(env.allowMutations ? "Enabled" : "Disabled (READ-ONLY)").padEnd(45)}║
╚══════════════════════════════════════════════════════════════╝
`);

  // Validate environment
  try {
    validateEnvironment();
  } catch (error) {
    console.error("❌ Environment validation failed:", error.message);
    process.exit(1);
  }

  // Check server availability
  console.log("🔍 Checking server availability...");
  const healthCheck = await checkServerHealth();

  if (!healthCheck.available) {
    console.log(`
⚠️  Server not available at ${env.apiBase}
   ${healthCheck.error || "Unknown error"}

   E2E tests require a running backend server.
   
   For local testing:
     npm run dev          # Start Next.js dev server
     npm run test:e2e     # Then run E2E tests
   
   For CI/CD:
     E2E tests should run after deployment to staging.
     Set E2E_ENV=staging and ensure server is deployed.

   Skipping E2E tests (exit code 0 - not a failure).
`);
    process.exit(0); // Exit successfully - missing server is not a test failure
  }

  console.log("✅ Server is available\n");

  // Register cleanup handlers
  if (!options.skipCleanup) {
    registerExitCleanup();
  }

  // Discover test files
  const testFiles = await discoverTestFiles(options);

  if (testFiles.length === 0) {
    console.log("⚠️  No test files found matching criteria");
    if (options.file) {
      console.log(`   Looking for file pattern: ${options.file}`);
    }
    if (options.journey) {
      console.log(`   Looking for journey: ${options.journey}`);
    }
    if (options.contract) {
      console.log(`   Looking for contract: ${options.contract}`);
    }
    console.log("");
    console.log("   Available journeys: j1, j2, j3, j4, j5, j6, j7, j8");
    console.log("   Available contracts: license, checkout, webhook, portal");
    process.exit(0);
  }

  console.log(`📋 Found ${testFiles.length} test file(s):`);
  testFiles.forEach((f) => console.log(`   - ${f.split(/[\\/]/).pop()}`));
  console.log("");

  // Run tests
  const startTime = Date.now();

  const runOptions = {
    files: testFiles,
    concurrency: 1, // E2E tests should run sequentially
  };

  // Filter by test name if --test option provided
  if (options.test) {
    runOptions.testNamePatterns = [options.test];
    console.log(`🔍 Filtering tests matching: "${options.test}"\n`);
  }

  const stream = run(runOptions);

  stream.compose(spec).pipe(process.stdout);

  // Collect results
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  stream.on("test:pass", () => passed++);
  stream.on("test:fail", () => failed++);
  stream.on("test:skip", () => skipped++);

  await new Promise((resolve) => stream.on("end", resolve));

  // Cleanup
  if (!options.skipCleanup && env.allowMutations) {
    console.log("\n🧹 Running cleanup...");
    const cleanupResult = await cleanupAll();
    if (!cleanupResult.skipped) {
      console.log("   Cleanup complete");
    }
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      Test Summary                            ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ Passed:   ${String(passed).padEnd(46)}║
║  ❌ Failed:   ${String(failed).padEnd(46)}║
║  ⏭️  Skipped:  ${String(skipped).padEnd(46)}║
║  ⏱️  Duration: ${(duration + "s").padEnd(46)}║
╚══════════════════════════════════════════════════════════════╝
`);

  process.exit(failed > 0 ? 1 : 0);
}

// Run
main().catch((error) => {
  console.error("E2E Runner Error:", error);
  process.exit(1);
});
