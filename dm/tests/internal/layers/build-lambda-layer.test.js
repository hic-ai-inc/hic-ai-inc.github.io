import { describe, test, beforeEach, afterEach } from "node:test";
import { expect, createSpy } from "../../../facade/test-helpers/index.js";
import { execSync, spawn } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  chmodSync,
  statSync,
} from "node:fs";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import cp from "node:child_process";

// Mock execSync to prevent real script execution
let originalExecSync;
let mockExecSync;

// Sandboxed test temp directory (GPT-5 recommendation)
const TEST_TMP_ROOT =
  process.env.HIC_TEST_TMP_ROOT ||
  join(process.cwd(), ".tmp-tests", "build-lambda-layer");

mkdirSync(TEST_TMP_ROOT, { recursive: true });

// Track temp directories for cleanup
let tempDirs = [];

// Windows-proof cleanup (GPT-5 recommendation)
function toWinLong(p) {
  return process.platform === "win32" && !p.startsWith("\\\\?\\")
    ? "\\\\?\\" + p
    : p;
}

function rmrf(p) {
  const target = toWinLong(p);

  try {
    rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 25,
    });
    return true;
  } catch (err) {
    if (process.platform === "win32") {
      try {
        const lit = target.replace(/'/g, "''");
        cp.execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `if (Test-Path -LiteralPath '${lit}') {
             try { attrib -r -s -h -a '${lit}' /s /d } catch {}
             Remove-Item -LiteralPath '${lit}' -Recurse -Force -ErrorAction SilentlyContinue
           }`,
          ],
          { stdio: "ignore" }
        );
        return true;
      } catch (_) {
        // fall-through
      }
    }
    return false;
  }
}

// Test utilities
function createTempDir(prefix = "build-layer-test-") {
  const tempPath = mkdtempSync(join(TEST_TMP_ROOT, prefix));
  tempDirs.push(tempPath);
  return tempPath;
}

function cleanup() {
  const STRICT_CLEANUP = process.env.CI === "true";
  let ok = true;

  for (const tempDir of tempDirs) {
    try {
      if (existsSync(tempDir) && !rmrf(tempDir)) {
        ok = false;
        console.warn(`Warning: Could not clean up ${tempDir}`);
      }
    } catch (e) {
      ok = false;
      console.warn(`Warning: Could not clean up ${tempDir}:`, e.message);
    }
  }
  tempDirs = [];

  if (STRICT_CLEANUP && !ok) {
    throw new Error("Cleanup failed under CI");
  }
}

// Sweep stale directories from previous runs
function sweepStaleUnderRoot() {
  if (!existsSync(TEST_TMP_ROOT)) return;

  for (const name of readdirSync(TEST_TMP_ROOT)) {
    const full = join(TEST_TMP_ROOT, name);
    try {
      const st = statSync(full);
      if (st) {
        const ageMs = Date.now() - st.mtimeMs;
        if (ageMs > 5 * 60 * 1000) {
          // older than 5 minutes
          rmrf(full);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

// Process exit safety net
process.on("exit", () => {
  try {
    if (existsSync(TEST_TMP_ROOT)) rmrf(TEST_TMP_ROOT);
  } catch {}
});

function createMockLayer(tempDir, layerName, options = {}) {
  const layerDir = join(tempDir, "layers", layerName);
  mkdirSync(layerDir, { recursive: true });

  // Create src directory with utilities if specified
  if (options.withSrc) {
    const srcDir = join(layerDir, "src");
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(
      join(srcDir, "index.js"),
      options.srcContent || 'export const testUtil = () => "test";'
    );
  }

  // Create versions.env at layers level
  const versionsFile = join(tempDir, "layers", "versions.env");
  writeFileSync(
    versionsFile,
    options.versionsContent || "# Test versions\nNODE_VERSION=20.x\n"
  );

  // Create utils directory with required scripts
  const utilsDir = join(tempDir, "utils");
  mkdirSync(utilsDir, { recursive: true });

  // Mock validate.sh
  writeFileSync(
    join(utilsDir, "validate.sh"),
    `#!/bin/bash
validate_node() { echo "Node validated"; }
validate_npm() { echo "NPM validated"; }
validate_jq() { echo "jq validated"; }
validate_env_var() { echo "Env var $1 validated"; }
validate_safe_dir() { echo "Safe dir validated"; }
validate_json_string() { echo "JSON validated"; }
validate_file_exists() { 
  if [[ ! -f "$1" ]]; then echo "File $1 not found"; exit 1; fi
}
validate_semver() { echo "Version $1 validated"; }
validate_zip_size() { echo "ZIP size validated"; }
run_or_exit() { "$@"; }
`
  );

  // Mock version-gate.sh
  writeFileSync(
    join(utilsDir, "version-gate.sh"),
    `#!/bin/bash
DECISION="build"
NEXT_VERSION="1.0.0"
export DECISION NEXT_VERSION
echo "Version gate: \\$DECISION @ \\$NEXT_VERSION"
`
  );

  // Mock create-zip.js - ABSOLUTELY NO real ZIP files (GPT-5 safeguards)
  writeFileSync(
    join(utilsDir, "create-zip.js"),
    `#!/usr/bin/env node
// MOCK CREATE-ZIP - NEVER creates real files (GPT-5 recommendation)
const [sourceDir, zipPath] = process.argv.slice(2);

if (!sourceDir || !zipPath) {
  console.error('MOCK CREATE-ZIP: Missing arguments');
  console.error('Usage: create-zip.js <sourceDir> <zipPath>');
  process.exit(1);
}

// ABSOLUTE SAFETY: Never create files outside our test sandbox
const testSandbox = process.env.HIC_TEST_TMP_ROOT || '';
if (!testSandbox || !zipPath.includes(testSandbox)) {
  console.error('MOCK CREATE-ZIP: REFUSING to create file outside test sandbox');
  console.error('Expected within:', testSandbox);
  console.error('Requested path:', zipPath);
  process.exit(1);
}

// Simulate successful ZIP creation - log only, no file creation
console.log('MOCK CREATE-ZIP: Simulating ZIP creation');
console.log('  Source:', sourceDir);
console.log('  Target:', zipPath);
console.log('MOCK CREATE-ZIP: ZIP creation simulation completed successfully');

// Create empty placeholder file in test sandbox only (for validation)
import fs from 'fs';
import path from 'path';

try {
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  
  // Create placeholder file that meets size validation (at least 2048 bytes)
  const placeholderContent = 'MOCK-ZIP-FILE-DO-NOT-USE-' + 'X'.repeat(2048);
  fs.writeFileSync(zipPath, placeholderContent);
  
  console.log('MOCK CREATE-ZIP: Placeholder file created for test validation');
} catch (error) {
  console.error('MOCK CREATE-ZIP: Error creating placeholder:', error.message);
  process.exit(1);
}

process.exit(0);
`
  );

  return layerDir;
}

describe("build-lambda-layer.sh", () => {
  let testDir;
  let originalEnv;
  let originalCwd;
  let buildScript;
  let relativeToScript; // GPT-5 approach variable

  beforeEach(() => {
    testDir = createTempDir();
    originalCwd = process.cwd();
    originalEnv = { ...process.env };

    // Use a sandbox copy of the build script so ../utils resolves to our mocks
    const realBuildScript = resolve(
      process.cwd(),
      "layers",
      "build-lambda-layer.sh"
    );
    const sandboxLayersDir = join(testDir, "layers");
    mkdirSync(sandboxLayersDir, { recursive: true });
    const sandboxBuildScript = join(sandboxLayersDir, "build-lambda-layer.sh");
    writeFileSync(sandboxBuildScript, readFileSync(realBuildScript, "utf8"));
    try {
      chmodSync(sandboxBuildScript, 0o755);
    } catch {}
    buildScript = sandboxBuildScript;

    // GPT-5 APPROACH: Set CREATE_ZIP_UTILITY environment variable to point to our mock
    const mockCreateZipPath = join(testDir, "utils", "create-zip.js");

    // CRITICAL: The build script resolves CREATE_ZIP_UTILITY relative to SCRIPT_DIR
    // We need to provide a path that when resolved will point to our mock
    const buildScriptDir = sandboxLayersDir;
    // IMPORTANT: assign to the OUTER variable; do NOT re-declare a new const
    relativeToScript = relative(buildScriptDir, mockCreateZipPath);
    process.env.CREATE_ZIP_UTILITY = relativeToScript;

    // Also redirect NODE_MODULES_CACHE to test sandbox
    process.env.NODE_MODULES_CACHE = join(testDir, "cache");

    // CRITICAL: Set HIC_TEST_TMP_ROOT so the mock create-zip.js knows the sandbox boundary
    process.env.HIC_TEST_TMP_ROOT = TEST_TMP_ROOT;

    // Mock execSync to simulate build script behavior
    originalExecSync = execSync;
    mockExecSync = createSpy("execSync");

    // Configure mock - let real bash scripts run but with our redirected utilities
    mockExecSync.mockImplementation((command, options) => {
      // For build-lambda-layer.sh, let it run but with our mock utilities via env vars
      if (command.includes("build-lambda-layer.sh")) {
        const mockOptions = {
          ...options,
          env: {
            ...(options.env || process.env),
            ...(relativeToScript
              ? { CREATE_ZIP_UTILITY: relativeToScript }
              : {}),
            NODE_MODULES_CACHE: join(testDir, "cache"),
            HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
          },
          timeout: 30000, // 30s timeout for safety
        };

        try {
          return originalExecSync(command, mockOptions);
        } catch (error) {
          // Clean up error message - throw a simple error without Buffer clutter
          const cleanMessage = error.stdout
            ? error.stdout.toString()
            : error.message;
          const stderr = error.stderr ? error.stderr.toString() : "";
          const fullMessage = `Build script failed: ${cleanMessage}${
            stderr ? "\nStderr: " + stderr : ""
          }`;
          throw new Error(fullMessage);
        }
      }

      // For other commands, also use environment redirection
      if (command.includes("npm install") || command.includes("node ")) {
        const mockOptions = {
          ...options,
          env: {
            ...(options.env || process.env),
            ...(relativeToScript
              ? { CREATE_ZIP_UTILITY: relativeToScript }
              : {}),
            HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
          },
          timeout: 10000,
        };
        try {
          return originalExecSync(command, mockOptions);
        } catch (error) {
          const cleanMessage = error.stdout
            ? error.stdout.toString()
            : error.message;
          const stderr = error.stderr ? error.stderr.toString() : "";
          const fullMessage = `Command failed: ${cleanMessage}${
            stderr ? "\nStderr: " + stderr : ""
          }`;
          throw new Error(fullMessage);
        }
      }

      // Default: call original with timeout and our environment
      const timeoutOptions = {
        ...options,
        timeout: 5000,
        env: {
          ...(options.env || process.env),
          ...(relativeToScript ? { CREATE_ZIP_UTILITY: relativeToScript } : {}),
          HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
        },
      };
      return originalExecSync(command, timeoutOptions);
    });

    // Replace the global execSync
    global.execSync = mockExecSync;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;

    // Restore original execSync
    if (originalExecSync) {
      global.execSync = originalExecSync;
    }

    // Use robust cleanup instead of simple rmSync
    cleanup();
  });

  describe("Environment Variable Validation", () => {
    test("fails when LAYER_DIR is not set", () => {
      const layerDir = createMockLayer(testDir, "test-layer");

      // Clear required env vars
      delete process.env.LAYER_DIR;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";

      expect(() => {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });

    test("fails when LAYER_NAME is not set", () => {
      const layerDir = createMockLayer(testDir, "test-layer");

      process.env.LAYER_DIR = layerDir;
      delete process.env.LAYER_NAME;
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";

      expect(() => {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });

    test("fails when LAYER_DEPENDENCIES is invalid JSON", () => {
      const layerDir = createMockLayer(testDir, "test-layer");

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "invalid-json";

      expect(() => {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });
  });

  describe("Directory Structure Creation", () => {
    test("creates correct nodejs directory structure", () => {
      // Create a mock layer directory
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true,
      });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = '{"lodash":"^4.17.21"}';
      process.env.DIST_DIR = join(testDir, "dist");
      process.env.BUILD_DIR = join(testDir, "build", "test-layer");

      // Run the build script
      execSync(`bash "${buildScript}"`, {
        cwd: testDir,
        stdio: "pipe",
        env: { ...process.env, PRESERVE_BUILD: "1" },
        encoding: "utf8",
      });

      const nodejsDir = join(testDir, "build", "test-layer", "nodejs");
      expect(existsSync(nodejsDir)).toBe(true);

      // Structure checks
      expect(existsSync(join(nodejsDir, "node_modules"))).toBe(true);

      // Top-level package.json contains dependencies
      const topLevelPackageJson = join(nodejsDir, "package.json");
      expect(existsSync(topLevelPackageJson)).toBe(true);
      const topLevelPkg = JSON.parse(readFileSync(topLevelPackageJson, "utf8"));
      expect(topLevelPkg.dependencies.lodash).toBe("^4.17.21");

      // Namespaced package location contains layer code
      const pkgDir = join(nodejsDir, "node_modules", "test-layer");
      const packageJsonPath = join(pkgDir, "package.json");
      expect(existsSync(pkgDir)).toBe(true);
      expect(existsSync(packageJsonPath)).toBe(true);

      // Layer package.json has metadata but no dependencies (they're at top level)
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      expect(packageJson.name).toBe("test-layer");
      expect(packageJson.type).toBe("module");
    });

    test("copies src files to nodejs when present", () => {
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true,
        srcContent: 'export const myUtil = () => "hello";',
      });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";
      process.env.DIST_DIR = join(testDir, "dist");
      process.env.BUILD_DIR = join(testDir, "build", "test-layer");

      try {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: { ...process.env, PRESERVE_BUILD: "1" },
        });

        // Check that src files were copied directly to nodejs/
        const indexFile = join(
          testDir,
          "build",
          "test-layer",
          "nodejs",
          "node_modules",
          "test-layer",
          "index.js"
        );
        expect(existsSync(indexFile)).toBe(true);

        const content = readFileSync(indexFile, "utf8");
        expect(content).toContain("myUtil");
      } catch (error) {
        console.log("Build script error:", error.message);
        throw error;
      }
    });
  });

  describe("Package.json Generation", () => {
    test("generates valid package.json with correct structure", () => {
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true, // Add this to create required index.js
      });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "hic-test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer for HIC";
      process.env.LAYER_DEPENDENCIES = '{}';
      process.env.DIST_DIR = join(testDir, "dist");
      process.env.BUILD_DIR = join(testDir, "build", "hic-test-layer");

      try {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: { ...process.env, PRESERVE_BUILD: "1" },
        });

        const nodejsDir = join(testDir, "build", "hic-test-layer", "nodejs");

        // Top-level package.json contains dependencies
        const topLevelPackageJson = join(nodejsDir, "package.json");
        expect(existsSync(topLevelPackageJson)).toBe(true);
        const topLevelPkg = JSON.parse(readFileSync(topLevelPackageJson, "utf8"));
        expect(topLevelPkg.dependencies).toEqual({});

        // Namespaced package.json contains layer metadata
        const packageJsonPath = join(
          nodejsDir,
          "node_modules",
          "hic-test-layer",
          "package.json"
        );
        expect(existsSync(packageJsonPath)).toBe(true);

        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

        // Verify layer package.json structure (no dependencies - they're at top level)
        expect(packageJson.name).toBe("hic-test-layer");
        expect(packageJson.version).toBe("1.0.0"); // from mocked version-gate
        expect(packageJson.description).toBe("Test layer for HIC");
        expect(packageJson.type).toBe("module");
        expect(packageJson.private).toBe(true);
        expect(packageJson.main).toBe("./index.js");
        expect(packageJson.exports).toEqual({ ".": "./index.js" });
      } catch (error) {
        console.log("Build script error:", error.message);
        throw error;
      }
    });
  });

  describe("ZIP Creation", () => {
    test("creates ZIP file in dist directory", () => {
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true, // Add this - src/index.js is now required
      });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";
      process.env.DIST_DIR = join(testDir, "dist");

      try {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        const zipPath = join(testDir, "dist", "test-layer-1.0.0.zip");
        expect(existsSync(zipPath)).toBe(true);
      } catch (error) {
        console.log("Build script error:", error.message);
        throw error;
      }
    });

    test("cleans up build directory after ZIP creation", () => {
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true, // Add this
      });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";
      process.env.DIST_DIR = join(testDir, "dist");
      process.env.BUILD_DIR = join(testDir, "build", "test-layer");

      try {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        // Build directory should be cleaned up
        const buildDir = join(testDir, "build", "test-layer");
        expect(existsSync(buildDir)).toBe(false);

        // But ZIP should exist
        const zipPath = join(testDir, "dist", "test-layer-1.0.0.zip");
        expect(existsSync(zipPath)).toBe(true);
      } catch (error) {
        console.log("Build script error:", error.message);
        throw error;
      }
    });
  });

  describe("Version Gate Integration", () => {
    test("skips build when version gate returns noop", () => {
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true, // Add this
      });

      // Mock version-gate to return noop
      const utilsDir = join(testDir, "utils");
      writeFileSync(
        join(utilsDir, "version-gate.sh"),
        `#!/bin/bash
DECISION="noop"
export DECISION
echo "No changes detected"
`
      );

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";
      process.env.DIST_DIR = join(testDir, "dist");

      const output = execSync(`bash "${buildScript}"`, {
        cwd: testDir,
        stdio: "pipe",
        env: process.env,
        encoding: "utf8",
      });

      expect(output).toContain("No changes detected");
      expect(output).toContain("Skipping build");

      // No ZIP should be created
      const zipPath = join(testDir, "dist", "test-layer-1.0.0.zip");
      expect(existsSync(zipPath)).toBe(false);
    });
  });

  describe("Error Handling", () => {
    test("fails gracefully when versions.env is missing", () => {
      const layerDir = createMockLayer(testDir, "test-layer");

      // Remove versions.env
      const versionsFile = join(testDir, "layers", "versions.env");
      rmSync(versionsFile, { force: true });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";

      expect(() => {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });

    test("fails when ZIP utility is missing", () => {
      const layerDir = createMockLayer(testDir, "test-layer");

      // Remove create-zip.js
      const zipUtility = join(testDir, "utils", "create-zip.js");
      rmSync(zipUtility, { force: true });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";

      expect(() => {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });
  });

  describe("Custom Configuration", () => {
    test("respects custom DIST_DIR and BUILD_DIR", () => {
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true, // Add this
      });
      const customDistDir = join(testDir, "custom-dist");
      const customBuildDir = join(testDir, "custom-build", "test-layer");

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";
      process.env.DIST_DIR = customDistDir;
      process.env.BUILD_DIR = customBuildDir;

      try {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        // ZIP should be in custom dist directory
        const zipPath = join(customDistDir, "test-layer-1.0.0.zip");
        expect(existsSync(zipPath)).toBe(true);

        // Custom build directory should be cleaned up
        expect(existsSync(customBuildDir)).toBe(false);
      } catch (error) {
        console.log("Build script error:", error.message);
        throw error;
      }
    });

    test("handles empty LAYER_DEPENDENCIES", () => {
      const layerDir = createMockLayer(testDir, "test-layer", {
        withSrc: true, // Add this
      });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.LAYER_DEPENDENCIES = "{}";
      process.env.DIST_DIR = join(testDir, "dist");

      try {
        execSync(`bash "${buildScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        const packageJsonPath = join(
          testDir,
          "build",
          "test-layer",
          "nodejs",
          "package.json"
        );

        // Should still create package.json with empty dependencies
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
          expect(packageJson.dependencies).toEqual({});
        }

        const zipPath = join(testDir, "dist", "test-layer-1.0.0.zip");
        expect(existsSync(zipPath)).toBe(true);
      } catch (error) {
        console.log("Build script error:", error.message);
        throw error;
      }
    });
  });
});
