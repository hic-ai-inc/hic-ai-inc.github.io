#!/usr/bin/env node
/**
 * PLG Unit Test Runner
 *
 * Programmatic test runner for PLG website tests.
 * Uses HIC custom testing framework with ESM loader.
 *
 * Usage:
 *   node --loader ../dm/facade/utils/test-loader.js test-runner.js
 *   node --loader ../dm/facade/utils/test-loader.js test-runner.js --file path/to/test.js
 *   node --loader ../dm/facade/utils/test-loader.js test-runner.js --pattern "stripe"
 *
 * For interactive debugging, use: ./scripts/debug-tests.sh
 */

import { glob } from "glob";
import { pathToFileURL } from "url";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_ROOT = join(__dirname, "__tests__");

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    pattern: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
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
  node --loader ../dm/facade/utils/test-loader.js test-runner.js [options]

Options:
  -f, --file <path>     Run a specific test file
  -p, --pattern <str>   Run tests matching pattern in filename
  -v, --verbose         Show verbose output
  -h, --help            Show this help message

Examples:
  # Run all tests
  node --loader ../dm/facade/utils/test-loader.js test-runner.js

  # Run specific test file
  node --loader ../dm/facade/utils/test-loader.js test-runner.js -f __tests__/unit/lib/stripe.test.js

  # Run tests matching pattern
  node --loader ../dm/facade/utils/test-loader.js test-runner.js -p auth

For interactive debugging, use: ./scripts/debug-tests.sh
`);
}

// Find test files based on options
async function findTestFiles(options) {
  if (options.file) {
    return [options.file];
  }

  let pattern = `${TESTS_ROOT}/**/*.test.js`;
  const files = await glob(pattern);

  if (options.pattern) {
    return files.filter((f) =>
      f.toLowerCase().includes(options.pattern.toLowerCase()),
    );
  }

  return files;
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

  let passed = 0;
  let failed = 0;
  const failures = [];
  const startTime = Date.now();

  for (const file of testFiles) {
    const relativePath = file.replace(process.cwd() + "/", "");

    if (options.verbose) {
      console.log(`📄 Running: ${relativePath}`);
    }

    try {
      await import(pathToFileURL(file).href);
      passed++;
      if (options.verbose) {
        console.log(`   ✅ Passed\n`);
      }
    } catch (error) {
      failed++;
      failures.push({ file: relativePath, error });
      console.log(`   ❌ ${relativePath}: ${error.message}\n`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed (${duration}s)`);

  if (failures.length > 0) {
    console.log("\n❌ Failures:");
    failures.forEach(({ file, error }) => {
      console.log(`\n  📄 ${file}`);
      console.log(`     ${error.message}`);
      if (options.verbose && error.stack) {
        console.log(
          `     ${error.stack.split("\n").slice(1, 4).join("\n     ")}`,
        );
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
