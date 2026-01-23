#!/usr/bin/env node
/**
 * PLG Unit Test Runner
 *
 * Programmatic test runner for PLG website tests.
 * Uses node:test with HIC custom ESM loader.
 * Counts individual test cases, not just files.
 *
 * Usage:
 *   node --loader ../dm/facade/utils/test-loader.js test-runner.js
 *   node --loader ../dm/facade/utils/test-loader.js test-runner.js __tests__/unit/lib
 *   node --loader ../dm/facade/utils/test-loader.js test-runner.js --pattern "stripe"
 *
 * For interactive debugging, use: ./scripts/debug-tests.sh
 */

import { run } from "node:test";
import { spec } from "node:test/reporters";
import { glob } from "glob";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_ROOT = join(__dirname, "__tests__");

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    pattern: null,
    directory: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Check if it's a path argument (not a flag)
    if (!arg.startsWith("-") && !options.directory) {
      options.directory = arg;
      continue;
    }

    switch (arg) {
      case "--file":
      case "-f":
        options.file = args[++i];
        break;
      case "--pattern":
      case "-p":
        options.pattern = args[++i];
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

// Show help message
function showHelp() {
  console.log(`
PLG Test Runner

Usage:
  node --loader ../dm/facade/utils/test-loader.js test-runner.js [options] [directory]

Options:
  -f, --file <path>     Run a specific test file
  -p, --pattern <str>   Run tests matching pattern in filename
  -v, --verbose         Show verbose output
  -h, --help            Show this help message

Examples:
  # Run all tests
  npm test

  # Run tests in a specific directory
  npm test -- __tests__/unit/lib

  # Run specific test file
  npm test -- -f __tests__/unit/lib/stripe.test.js

  # Run tests matching pattern
  npm test -- -p auth

For interactive debugging, use: ./scripts/debug-tests.sh
`);
}

// Find test files based on options
async function findTestFiles(options) {
  if (options.file) {
    return [resolve(options.file)];
  }

  // Determine the search root
  let searchRoot = TESTS_ROOT;
  if (options.directory) {
    searchRoot = resolve(options.directory);
  }

  const pattern = `${searchRoot}/**/*.test.js`;
  let files = await glob(pattern);

  if (options.pattern) {
    files = files.filter((f) =>
      f.toLowerCase().includes(options.pattern.toLowerCase()),
    );
  }

  return files.sort();
}

// Main test runner
async function runTests() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const testFiles = await findTestFiles(options);

  if (testFiles.length === 0) {
    console.log("❌ No test files found");
    process.exit(1);
  }

  console.log(`\n🧪 Running ${testFiles.length} test file(s)...\n`);

  // Track test results
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failures = [];
  const startTime = Date.now();

  // Use node:test's run() API for proper test execution and counting
  const stream = run({
    files: testFiles,
    concurrency: 1, // Run sequentially to avoid output interleaving
  });

  // Pipe to spec reporter for nice output
  stream.compose(spec).pipe(process.stdout);

  // Also collect results for our summary
  for await (const event of stream) {
    if (event.type === "test:pass" && event.data.details?.type !== "suite") {
      // Only count leaf tests (not describe blocks)
      if (!event.data.name.includes("▶")) {
        totalTests++;
        passedTests++;
      }
    } else if (
      event.type === "test:fail" &&
      event.data.details?.type !== "suite"
    ) {
      if (!event.data.name.includes("▶")) {
        totalTests++;
        failedTests++;
        failures.push({
          name: event.data.name,
          error: event.data.details?.error,
        });
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(
    `📊 Results: ${passedTests} passed, ${failedTests} failed of ${totalTests} tests (${duration}s)`,
  );
  console.log(`📁 Files: ${testFiles.length}`);

  if (failures.length > 0) {
    console.log("\n❌ Failed tests:");
    failures.forEach(({ name, error }) => {
      console.log(`\n  ✖ ${name}`);
      if (error?.message) {
        console.log(`    ${error.message}`);
      }
    });
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

runTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
