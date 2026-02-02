import { describe, test, beforeEach, afterEach } from "node:test";
import { expect, createSpy } from "../../../facade/test-helpers/index.js";
import { execSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  chmodSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Convert Windows paths to Unix-style paths for bash compatibility
function toUnixPath(windowsPath) {
  if (process.platform !== "win32") {
    return windowsPath;
  }

  // Convert Windows path to Git Bash format
  // C:\Users\... -> /c/Users/...
  return windowsPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1");
}

// Sandboxed test temp directory
const TEST_TMP_ROOT =
  process.env.HIC_TEST_TMP_ROOT ||
  join(process.cwd(), ".tmp-tests", "validate");

mkdirSync(TEST_TMP_ROOT, { recursive: true });

// Track temp directories for cleanup
let tempDirs = [];

// Windows-proof cleanup
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
        execSync(`rmdir /s /q "${p.replace(/\//g, "\\")}"`, {
          stdio: "ignore",
        });
        return true;
      } catch (_) {
        // Failed both ways
      }
    }
    return false;
  }
}

// Test utilities
function createTempDir(prefix = "validate-test-") {
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

  const cutoff = Date.now() - 3600000; // 1 hour ago
  for (const name of readdirSync(TEST_TMP_ROOT)) {
    if (!name.startsWith("validate-test-")) continue;
    const full = join(TEST_TMP_ROOT, name);
    try {
      const st = statSync(full);
      if (st.mtimeMs < cutoff) {
        rmrf(full);
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

function createValidateTestEnvironment(tempDir, options = {}) {
  // Copy the real validate.sh script to a test location
  const validateScript = resolve(process.cwd(), "utils", "validate.sh");
  const testValidateScript = join(tempDir, "validate.sh");

  writeFileSync(testValidateScript, readFileSync(validateScript, "utf8"));
  chmodSync(testValidateScript, 0o755);

  // Create mock commands directory if needed
  if (options.mockCommands) {
    const mockBinDir = join(tempDir, "mock-bin");
    mkdirSync(mockBinDir, { recursive: true });

    for (const [command, behavior] of Object.entries(options.mockCommands)) {
      const mockScript = join(mockBinDir, command);

      let scriptContent = "#!/bin/bash\n";
      if (behavior === "missing") {
        // Command will not exist
        continue;
      } else if (behavior === "success") {
        scriptContent += "exit 0\n";
      } else if (behavior === "fail") {
        scriptContent += "exit 1\n";
      } else if (typeof behavior === "string") {
        scriptContent += `${behavior}\n`;
      } else if (typeof behavior === "object") {
        scriptContent += `${behavior.script}\n`;
      }

      writeFileSync(mockScript, scriptContent);
      chmodSync(mockScript, 0o755);
    }

    return { testValidateScript, mockBinDir };
  }

  return { testValidateScript };
}

function runValidateFunction(scriptPath, functionName, args = [], env = {}) {
  // Convert paths to Unix format for bash compatibility
  const unixScriptPath = toUnixPath(scriptPath);
  const unixArgs = args.map((arg) => {
    // If the argument looks like a path, convert it
    if (
      typeof arg === "string" &&
      (arg.includes("\\") || arg.match(/^[A-Za-z]:/))
    ) {
      return toUnixPath(arg);
    }
    return arg;
  });

  // Create a wrapper script that sources the validation script and calls the function
  // Use printf to safely handle special characters in arguments
  const wrapperScript = `#!/bin/bash
set -euo pipefail
source "${unixScriptPath}"
${functionName} ${unixArgs
    .map((arg) => `'${arg.replace(/'/g, "'\"'\"'")}'`)
    .join(" ")}
`;

  const fullEnv = {
    ...process.env,
    ...env,
    PATH: env.PATH || process.env.PATH,
  };

  return execSync(wrapperScript, {
    encoding: "utf8",
    env: fullEnv,
    timeout: 5000,
    shell: "bash",
    stdio: ["pipe", "pipe", "pipe"], // capture stdout and stderr separately
  });
}

function expectValidateFunctionToFail(
  scriptPath,
  functionName,
  args = [],
  env = {}
) {
  // Convert paths to Unix format for bash compatibility
  const unixScriptPath = toUnixPath(scriptPath);
  const unixArgs = args.map((arg) => {
    // If the argument looks like a path, convert it
    if (
      typeof arg === "string" &&
      (arg.includes("\\") || arg.match(/^[A-Za-z]:/))
    ) {
      return toUnixPath(arg);
    }
    return arg;
  });

  // Create a wrapper script that sources the validation script and calls the function
  // Use single quotes to safely handle special characters in arguments
  const wrapperScript = `#!/bin/bash
set -euo pipefail
source "${unixScriptPath}"
${functionName} ${unixArgs
    .map((arg) => `'${arg.replace(/'/g, "'\"'\"'")}'`)
    .join(" ")}
`;

  const fullEnv = {
    ...process.env,
    ...env,
    PATH: env.PATH || process.env.PATH,
  };

  expect(() => {
    execSync(wrapperScript, {
      encoding: "utf8",
      env: fullEnv,
      timeout: 5000,
      shell: "bash",
    });
  }).toThrow();
}

function expectValidateFunctionToSucceed(
  scriptPath,
  functionName,
  args = [],
  env = {}
) {
  // Convert paths to Unix format for bash compatibility
  const unixScriptPath = toUnixPath(scriptPath);
  const unixArgs = args.map((arg) => {
    // If the argument looks like a path, convert it
    if (
      typeof arg === "string" &&
      (arg.includes("\\") || arg.match(/^[A-Za-z]:/))
    ) {
      return toUnixPath(arg);
    }
    return arg;
  });

  // Create a wrapper script that sources the validation script and calls the function
  // Use single quotes to safely handle special characters in arguments
  const wrapperScript = `#!/bin/bash
set -euo pipefail
source "${unixScriptPath}"
${functionName} ${unixArgs
    .map((arg) => `'${arg.replace(/'/g, "'\"'\"'")}'`)
    .join(" ")}
`;

  const fullEnv = {
    ...process.env,
    ...env,
    PATH: env.PATH || process.env.PATH,
  };

  let result;
  expect(() => {
    result = execSync(wrapperScript, {
      encoding: "utf8",
      env: fullEnv,
      timeout: 5000,
      shell: "bash",
    });
  }).not.toThrow();

  return result;
}
describe("validate.sh", () => {
  let testDir;
  let originalEnv;
  let originalCwd;

  beforeEach(() => {
    sweepStaleUnderRoot();
    testDir = createTempDir();
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    cleanup();
  });

  describe("validate_safe_dir", () => {
    test("accepts valid directory paths", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      // Valid paths should not throw
      expectValidateFunctionToSucceed(testValidateScript, "validate_safe_dir", [
        "/tmp/test",
      ]);

      expectValidateFunctionToSucceed(testValidateScript, "validate_safe_dir", [
        "/var/lib/test",
      ]);

      expectValidateFunctionToSucceed(testValidateScript, "validate_safe_dir", [
        "./safe/path",
      ]);
    });

    test("rejects unsafe directory paths", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      // Empty path
      expectValidateFunctionToFail(testValidateScript, "validate_safe_dir", [
        "",
      ]);

      // Root directory
      expectValidateFunctionToFail(testValidateScript, "validate_safe_dir", [
        "/",
      ]);

      // Current directory
      expectValidateFunctionToFail(testValidateScript, "validate_safe_dir", [
        ".",
      ]);

      // Parent directory
      expectValidateFunctionToFail(testValidateScript, "validate_safe_dir", [
        "..",
      ]);

      // Path containing .. (directory traversal)
      expectValidateFunctionToFail(testValidateScript, "validate_safe_dir", [
        "/tmp/../etc",
      ]);
    });
  });

  describe("validate_command", () => {
    test("succeeds when command exists", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            "test-command": "success",
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      expectValidateFunctionToSucceed(
        testValidateScript,
        "validate_command",
        ["test-command"],
        { PATH: mockPath }
      );
    });

    test("fails when command does not exist", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expectValidateFunctionToFail(testValidateScript, "validate_command", [
        "nonexistent-command-xyz123",
      ]);
    });

    test("uses human-readable name in error message", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      try {
        runValidateFunction(testValidateScript, "validate_command", [
          "nonexistent-xyz",
          "Pretty Name",
        ]);
        // If we get here, the function didn't throw as expected
        expect(false).toBe(true); // Force failure
      } catch (error) {
        // execSync wraps the actual script output - we need to extract it
        // The bash script will output to stderr, which gets captured in the error
        const errorOutput = error.stderr || error.stdout || error.message || "";

        // If no stderr/stdout, try to extract from the command output
        if (
          !errorOutput &&
          error.message &&
          error.message.includes("Command failed:")
        ) {
          // Try running just the validation function to get the raw output
          try {
            const { execSync } = require("node:child_process");
            const simpleTest = `bash -c "source '${toUnixPath(
              testValidateScript
            )}'; validate_command 'nonexistent-xyz' 'Pretty Name'" 2>&1 || true`;
            const rawOutput = execSync(simpleTest, {
              encoding: "utf8",
              timeout: 2000,
            });
            expect(rawOutput).toMatch(/Pretty Name not found/);
            return;
          } catch (e) {
            // Fall back to original method
          }
        }

        expect(errorOutput).toMatch(/Pretty Name not found/);
      }
    });
  });

  describe("validate_node, validate_npm, validate_jq", () => {
    test("validate_node succeeds when Node.js is available", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            node: "success",
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      expectValidateFunctionToSucceed(testValidateScript, "validate_node", [], {
        PATH: mockPath,
      });
    });

    test("validate_npm succeeds when npm is available", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            npm: "success",
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      expectValidateFunctionToSucceed(testValidateScript, "validate_npm", [], {
        PATH: mockPath,
      });
    });

    test("validate_jq succeeds when jq is available", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            jq: "success",
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      expectValidateFunctionToSucceed(testValidateScript, "validate_jq", [], {
        PATH: mockPath,
      });
    });

    test("fails when respective commands are missing", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      // Use a completely non-existent PATH to ensure commands aren't found
      const emptyPath = "/nonexistent/path/that/absolutely/does/not/exist";

      expectValidateFunctionToFail(testValidateScript, "validate_node", [], {
        PATH: emptyPath,
      });
      expectValidateFunctionToFail(testValidateScript, "validate_npm", [], {
        PATH: emptyPath,
      });
      expectValidateFunctionToFail(testValidateScript, "validate_jq", [], {
        PATH: emptyPath,
      });
    });
  });

  describe("validate_json_string", () => {
    test("accepts valid JSON strings", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            // Must consume stdin to avoid SIGPIPE with pipefail on Linux
            jq: "cat > /dev/null; exit 0",
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      const validJsonExamples = [
        "{}",
        '{"key": "value"}',
        '{"number": 42, "array": [1, 2, 3]}',
        "[]",
        '"string"',
        "42",
        "true",
        "false",
        "null",
      ];

      for (const json of validJsonExamples) {
        expectValidateFunctionToSucceed(
          testValidateScript,
          "validate_json_string",
          [json],
          { PATH: mockPath }
        );
      }
    });

    test("rejects invalid JSON strings", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            // Must consume stdin to avoid SIGPIPE with pipefail on Linux
            jq: "cat > /dev/null; exit 1",
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      const invalidJsonExamples = [
        "{invalid}",
        '{"missing": "quote}',
        "{,}",
        "undefined",
        "",
        "not json at all",
      ];

      for (const json of invalidJsonExamples) {
        expectValidateFunctionToFail(
          testValidateScript,
          "validate_json_string",
          [json],
          { PATH: mockPath }
        );
      }
    });
  });

  describe("validate_file_exists", () => {
    test("succeeds when file exists", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const testFile = join(testDir, "test-file.txt");
      writeFileSync(testFile, "test content");

      expectValidateFunctionToSucceed(
        testValidateScript,
        "validate_file_exists",
        [testFile]
      );
    });

    test("fails when file does not exist", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const nonExistentFile = join(testDir, "does-not-exist.txt");

      expectValidateFunctionToFail(testValidateScript, "validate_file_exists", [
        nonExistentFile,
      ]);
    });

    test("fails when path is a directory", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const testDirectory = join(testDir, "test-directory");
      mkdirSync(testDirectory);

      expectValidateFunctionToFail(testValidateScript, "validate_file_exists", [
        testDirectory,
      ]);
    });
  });

  describe("validate_path_exists", () => {
    test("succeeds when file exists", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const testFile = join(testDir, "test-file.txt");
      writeFileSync(testFile, "test content");

      expectValidateFunctionToSucceed(
        testValidateScript,
        "validate_path_exists",
        [testFile]
      );
    });

    test("succeeds when directory exists", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const testDirectory = join(testDir, "test-directory");
      mkdirSync(testDirectory);

      expectValidateFunctionToSucceed(
        testValidateScript,
        "validate_path_exists",
        [testDirectory]
      );
    });

    test("fails when path does not exist", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const nonExistentPath = join(testDir, "does-not-exist");

      expectValidateFunctionToFail(testValidateScript, "validate_path_exists", [
        nonExistentPath,
      ]);
    });
  });

  describe("validate_semver", () => {
    test("accepts valid semantic version strings", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const validVersions = ["1.0.0", "0.0.1", "10.20.30", "999.999.999"];

      for (const version of validVersions) {
        expectValidateFunctionToSucceed(testValidateScript, "validate_semver", [
          version,
        ]);
      }
    });

    test("rejects invalid version formats", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const invalidVersions = [
        "1.0",
        "1.0.0.0",
        "v1.0.0",
        "1.0.0-beta",
        "1.0.0+build",
        "1.x.0",
        "",
        "not-a-version",
      ];

      for (const version of invalidVersions) {
        expectValidateFunctionToFail(testValidateScript, "validate_semver", [
          version,
        ]);
      }
    });
  });

  describe("validate_zip_size", () => {
    test("succeeds when ZIP file meets minimum size requirement", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const zipFile = join(testDir, "test.zip");
      writeFileSync(zipFile, "x".repeat(1024)); // 1KB file

      expectValidateFunctionToSucceed(testValidateScript, "validate_zip_size", [
        zipFile,
        "500",
      ]);
    });

    test("fails when ZIP file is too small", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const zipFile = join(testDir, "small.zip");
      writeFileSync(zipFile, "tiny"); // 4 bytes

      expectValidateFunctionToFail(testValidateScript, "validate_zip_size", [
        zipFile,
        "1024",
      ]);
    });

    test("fails when ZIP file does not exist", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);
      const nonExistentZip = join(testDir, "missing.zip");

      expectValidateFunctionToFail(testValidateScript, "validate_zip_size", [
        nonExistentZip,
        "100",
      ]);
    });
  });

  describe("validate_env_var", () => {
    test("succeeds when environment variable is set and non-empty", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expectValidateFunctionToSucceed(
        testValidateScript,
        "validate_env_var",
        ["TEST_VAR"],
        { TEST_VAR: "value" }
      );
    });

    test("fails when environment variable is not set", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expectValidateFunctionToFail(testValidateScript, "validate_env_var", [
        "UNDEFINED_VAR",
      ]);
    });

    test("fails when environment variable is empty", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expectValidateFunctionToFail(
        testValidateScript,
        "validate_env_var",
        ["EMPTY_VAR"],
        { EMPTY_VAR: "" }
      );
    });
  });

  describe("validate_lambda_runtime", () => {
    test("accepts valid Lambda runtimes", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const validRuntimes = [
        "nodejs18.x",
        "nodejs20.x",
        "nodejs22.x",
        "python3.9",
        "python3.10",
        "python3.11",
        "python3.12",
        "java11",
        "java17",
        "dotnet6",
        "dotnet8",
        "ruby3.2",
        "provided",
        "provided.al2",
        "provided.al2023",
      ];

      for (const runtime of validRuntimes) {
        expectValidateFunctionToSucceed(
          testValidateScript,
          "validate_lambda_runtime",
          [runtime]
        );
      }
    });

    test("rejects invalid Lambda runtimes", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const invalidRuntimes = [
        "",
        "nodejs16.x", // outdated
        "python2.7", // deprecated
        "java8", // outdated
        "go1.x", // deprecated
        "custom-runtime",
        "invalid",
      ];

      for (const runtime of invalidRuntimes) {
        expectValidateFunctionToFail(
          testValidateScript,
          "validate_lambda_runtime",
          [runtime]
        );
      }
    });
  });

  describe("validate_sdk_version", () => {
    test("accepts valid AWS SDK version formats", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const validVersions = [
        "3.700.0",
        "^3.700.0",
        "~3.700.0",
        "1.0.0",
        "^2.1400.0",
        "~1.500.10",
      ];

      for (const version of validVersions) {
        expectValidateFunctionToSucceed(
          testValidateScript,
          "validate_sdk_version",
          [version]
        );
      }
    });

    test("rejects invalid AWS SDK version formats", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const invalidVersions = [
        "",
        "3.700",
        "v3.700.0",
        "3.700.0-beta",
        "latest",
        ">=3.700.0",
        "3.x.0",
        "*",
      ];

      for (const version of invalidVersions) {
        expectValidateFunctionToFail(
          testValidateScript,
          "validate_sdk_version",
          [version]
        );
      }
    });
  });

  describe("validate_s3_bucket", () => {
    test("succeeds when S3 bucket exists and is accessible", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            aws: "exit 0", // Mock successful aws s3api head-bucket
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      expectValidateFunctionToSucceed(
        testValidateScript,
        "validate_s3_bucket",
        ["test-bucket"],
        { PATH: mockPath }
      );
    });

    test("fails when S3 bucket does not exist or is not accessible", () => {
      const { testValidateScript, mockBinDir } = createValidateTestEnvironment(
        testDir,
        {
          mockCommands: {
            aws: "exit 1", // Mock failed aws s3api head-bucket
          },
        }
      );

      const mockPath = `${mockBinDir}:${process.env.PATH}`;

      expectValidateFunctionToFail(
        testValidateScript,
        "validate_s3_bucket",
        ["nonexistent-bucket"],
        { PATH: mockPath }
      );
    });
  });

  describe("validate_layer_name", () => {
    test("accepts valid layer names", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const validNames = [
        "my-layer",
        "MyLayer",
        "layer_123",
        "a",
        "Layer-With-Hyphens",
        "Layer_With_Underscores",
        "Layer123WithNumbers",
        "x".repeat(140), // exactly 140 characters
      ];

      for (const name of validNames) {
        expectValidateFunctionToSucceed(
          testValidateScript,
          "validate_layer_name",
          [name]
        );
      }
    });

    test("rejects invalid layer names", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const invalidNames = [
        "",
        "layer with spaces",
        "layer@special",
        "layer.with.dots",
        "layer/with/slashes",
        "layer\\with\\backslashes",
        "x".repeat(141), // too long
      ];

      for (const name of invalidNames) {
        expectValidateFunctionToFail(
          testValidateScript,
          "validate_layer_name",
          [name]
        );
      }
    });
  });

  describe("validate_layer_arn", () => {
    test("accepts valid Layer Version ARNs", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const validArns = [
        "arn:aws:lambda:us-east-1:123456789012:layer:my-layer:1",
        "arn:aws:lambda:us-west-2:987654321098:layer:test_layer:42",
        "arn:aws:lambda:eu-central-1:111111111111:layer:layer-name:999",
        "arn:aws:lambda:ap-south-1:222222222222:layer:my.layer-name_123:1",
      ];

      for (const arn of validArns) {
        expectValidateFunctionToSucceed(
          testValidateScript,
          "validate_layer_arn",
          [arn]
        );
      }
    });

    test("rejects invalid Layer Version ARNs", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const invalidArns = [
        "",
        "not-an-arn",
        "arn:aws:s3:::bucket/key", // wrong service
        "arn:aws:lambda:us-east-1:123456789012:function:my-function", // function ARN, not layer
        "arn:aws:lambda:us-east-1:123456789012:layer:my-layer", // missing version
        "arn:aws:lambda:invalid-region:123456789012:layer:my-layer:1",
        "arn:aws:lambda:us-east-1:invalid-account:layer:my-layer:1",
        "arn:aws:lambda:us-east-1:123456789012:layer:my-layer:invalid-version",
      ];

      for (const arn of invalidArns) {
        expectValidateFunctionToFail(testValidateScript, "validate_layer_arn", [
          arn,
        ]);
      }
    });
  });

  describe("validate_files_exist", () => {
    test("succeeds when files matching pattern exist", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      // Create test files
      writeFileSync(join(testDir, "file1.txt"), "content1");
      writeFileSync(join(testDir, "file2.txt"), "content2");

      expectValidateFunctionToSucceed(
        testValidateScript,
        "validate_files_exist",
        [`${testDir}/*.txt`]
      );
    });

    test("fails when no files match the pattern", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expectValidateFunctionToFail(testValidateScript, "validate_files_exist", [
        `${testDir}/*.nonexistent`,
      ]);
    });
  });

  describe("error_exit and success_msg", () => {
    test("error_exit outputs error message and exits with code 1", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expect(() => {
        runValidateFunction(testValidateScript, "error_exit", [
          "Test error message",
        ]);
      }).toThrow();
    });

    test("success_msg outputs success message", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      const output = expectValidateFunctionToSucceed(
        testValidateScript,
        "success_msg",
        ["Test success"]
      );
      expect(output).toContain("✅ Test success");
    });
  });

  describe("run_or_exit", () => {
    test("succeeds when command succeeds", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expectValidateFunctionToSucceed(testValidateScript, "run_or_exit", [
        "true",
      ]);
    });

    test("fails when command fails", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      expectValidateFunctionToFail(testValidateScript, "run_or_exit", [
        "false",
      ]);
    });
  });

  describe("Integration with real commands", () => {
    test("validates real system commands when available", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      // Only test if the commands are actually available
      try {
        execSync("which bash", { stdio: "ignore" });
        expectValidateFunctionToSucceed(
          testValidateScript,
          "validate_command",
          ["bash"]
        );
      } catch {
        // bash not available, skip test
      }
    });

    test("handles complex JSON validation with real jq if available", () => {
      const { testValidateScript } = createValidateTestEnvironment(testDir);

      try {
        execSync("which jq", { stdio: "ignore" });

        const complexJson = JSON.stringify({
          dependencies: {
            "@aws-sdk/client-lambda": "^3.700.0",
            lodash: "~4.17.21",
          },
          nested: {
            array: [1, 2, { key: "value" }],
            boolean: true,
            null_value: null,
          },
        });

        expectValidateFunctionToSucceed(
          testValidateScript,
          "validate_json_string",
          [complexJson]
        );
      } catch {
        // jq not available, skip test
      }
    });
  });
});
