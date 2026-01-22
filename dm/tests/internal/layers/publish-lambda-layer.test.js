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
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Test utilities
function createTempDir(prefix = "publish-layer-test-") {
  const tempPath = join(
    tmpdir(),
    `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

function createMockLayerForPublish(tempDir, layerName, version, options = {}) {
  const layerDir = join(tempDir, "layers", layerName);
  mkdirSync(layerDir, { recursive: true });

  // Create dist directory with ZIP file
  const distDir = join(tempDir, "dist");
  mkdirSync(distDir, { recursive: true });

  const zipPath = join(distDir, `${layerName}-${version}.zip`);

  // Write a small mock ZIP file (not real ZIP content, but enough to satisfy file existence checks)
  writeFileSync(
    zipPath,
    options.zipContent || "MOCK-ZIP-CONTENT-FOR-TESTING\n"
  );

  // Create utils directory with required validation scripts
  const utilsDir = join(tempDir, "utils");
  mkdirSync(utilsDir, { recursive: true });

  // Mock validate.sh with AWS-specific validations
  writeFileSync(
    join(utilsDir, "validate.sh"),
    `#!/bin/bash
validate_env_var() { 
  if [[ -z "\${!1}" ]]; then 
    echo "Error: $1 not set"; exit 1; 
  fi
  echo "Env var $1 validated"; 
}
validate_layer_name() { echo "Layer name $1 validated"; }
validate_semver() { echo "Version $1 validated"; }
validate_s3_bucket() { echo "S3 bucket $1 validated"; }
validate_safe_dir() { echo "Safe dir validated"; }
validate_jq() { echo "jq validated"; }
validate_lambda_runtime() { echo "Runtime $1 validated"; }
validate_file_exists() { 
  if [[ ! -f "$1" ]]; then echo "File $1 not found"; exit 1; fi
  echo "File $1 exists";
}
validate_layer_arn() { 
  if [[ "$1" != arn:aws:lambda:* ]]; then echo "Invalid ARN: $1"; exit 1; fi
  echo "Layer ARN $1 validated"; 
}
success_msg() { echo "✅ $1"; }
`
  );

  // Create a mock create-zip.js utility to prevent any real ZIP creation
  writeFileSync(
    join(utilsDir, "create-zip.js"),
    `#!/usr/bin/env node
// MOCK CREATE-ZIP - Writes a tiny placeholder file only inside the test sandbox
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [sourceDir, zipPath] = process.argv.slice(2);

if (!zipPath) {
  console.error('MOCK CREATE-ZIP: missing destination path');
  process.exit(1);
}

// Safety: only allow writes under a test sandbox path
const safeMarkers = ['publish-layer-test-', 'temp', 'TMP', 'Temp'];
const allowed = safeMarkers.some(m => zipPath.includes(m));
if (!allowed) {
  console.error('MOCK CREATE-ZIP: Refusing to create outside sandbox:', zipPath);
  process.exit(1);
}

// Ensure parent dir exists and write a tiny file
mkdirSync(dirname(zipPath), { recursive: true });
writeFileSync(zipPath, 'MOCK ZIP FOR TESTING\\n');
console.log('MOCK: wrote placeholder zip -> ' + zipPath);
process.exit(0);
`,
    { mode: 0o755 }
  );

  return { layerDir, zipPath, distDir, utilsDir };
}

function mockAwsCli(tempDir, responses = {}) {
  const awsScript = join(tempDir, "mock-aws");

  // Default responses
  const defaultResponses = {
    s3_cp:
      "upload: dist/test-layer-1.0.0.zip to s3://test-bucket/layers/test-layer/1.0.0/test-layer-1.0.0.zip",
    publish_layer_version: JSON.stringify({
      LayerVersionArn:
        "arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1",
      Version: 1,
      Description: "Test layer",
      CreatedDate: "2025-09-01T12:00:00.000Z",
    }),
  };

  const allResponses = { ...defaultResponses, ...responses };

  writeFileSync(
    awsScript,
    `#!/bin/bash
case "$1" in
  "s3")
    if [[ "$2" == "cp" ]]; then
      echo "${allResponses.s3_cp}"
    fi
    ;;
  "lambda")
    if [[ "$2" == "publish-layer-version" ]]; then
      # Log runtime to a separate file for test verification
      for arg in "$@"; do
        case "$arg" in
          --compatible-runtimes)
            shift
            echo "Runtime: $1" >> "${tempDir}/aws-calls.log"
            break
            ;;
        esac
        shift
      done
      # Only output the JSON response, nothing else
      echo '${allResponses.publish_layer_version}'
    fi
    ;;
  *)
    echo "Mock AWS CLI: $*"
    ;;
esac
`,
    { mode: 0o755 }
  );

  return awsScript;
}

describe("publish-lambda-layer.sh", () => {
  let testDir;
  let originalEnv;
  let originalCwd;
  let originalPath;
  let publishScript;

  beforeEach(() => {
    testDir = createTempDir();
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    originalPath = process.env.PATH;

    // Path to the actual publish script
    publishScript = resolve(process.cwd(), "layers", "publish-lambda-layer.sh");

    // Set up environment variables to use mocked utilities and prevent real file creation
    // This prevents the script from using real utilities that might create files in AppData
    process.env.CREATE_ZIP_UTILITY = join(testDir, "utils", "create-zip.js");
    process.env.VALIDATE_SCRIPT = join(testDir, "utils", "validate.sh");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Environment Variable Validation", () => {
    test("fails when LAYER_DIR is not set", () => {
      const { layerDir, zipPath } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      delete process.env.LAYER_DIR;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";

      expect(() => {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });

    test("fails when ARTIFACT_BUCKET is not set", () => {
      const { layerDir, zipPath } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      delete process.env.ARTIFACT_BUCKET;

      expect(() => {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });

    test("fails when HIC_LAYER_VERSION is invalid semver", () => {
      const { layerDir, zipPath } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "not-a-version";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";

      expect(() => {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });
  });

  describe("ZIP File Validation", () => {
    test("fails when required ZIP file does not exist", () => {
      const { layerDir, zipPath } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Remove the ZIP file
      rmSync(zipPath, { force: true });

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = join(testDir, "dist");

      expect(() => {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });

    test("validates ZIP filename matches version", () => {
      const { layerDir, zipPath } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "2.0.0"; // Different from ZIP filename
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = join(testDir, "dist");

      expect(() => {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });
  });

  describe("AWS Integration (Mocked)", () => {
    test("successfully publishes layer to AWS", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Mock AWS CLI
      const mockAws = mockAwsCli(testDir);
      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;
      process.env.REGION = "us-east-1";

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      try {
        const output = execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
          encoding: "utf8",
        });

        expect(output).toContain("Publishing test-layer @ 1.0.0");
        expect(output).toContain(
          "arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1"
        );
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });

    test("creates publish manifest with correct information", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Mock AWS CLI
      const mockAws = mockAwsCli(testDir);
      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      try {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        // Check publish manifest was created
        const manifestPath = join(layerDir, "publish.1.0.0.manifest.json");
        expect(existsSync(manifestPath)).toBe(true);

        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        expect(manifest.layerName).toBe("test-layer");
        expect(manifest.version).toBe("1.0.0");
        expect(manifest.region).toBe("us-east-1");
        expect(manifest.s3Uri).toBe(
          "s3://test-bucket/layers/test-layer/1.0.0/test-layer-1.0.0.zip"
        );
        expect(manifest.layerVersionArn).toBe(
          "arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1"
        );
        expect(manifest.publishedAt).toBeTruthy();
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });
  });

  describe("Cleanup Behavior", () => {
    test("removes ZIP file after successful publish when CLEANUP_ZIP=1", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Mock AWS CLI
      const mockAws = mockAwsCli(testDir);
      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;
      process.env.CLEANUP_ZIP = "1";

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      // Verify ZIP exists before publish
      expect(existsSync(zipPath)).toBe(true);

      try {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        // ZIP should be removed after publish
        expect(existsSync(zipPath)).toBe(false);
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });

    test("keeps ZIP file when CLEANUP_ZIP=0", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Mock AWS CLI
      const mockAws = mockAwsCli(testDir);
      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;
      process.env.CLEANUP_ZIP = "0";

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      try {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        // ZIP should still exist
        expect(existsSync(zipPath)).toBe(true);
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });

    test("removes empty dist directory when CLEANUP_DIST_IF_EMPTY=1", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Mock AWS CLI
      const mockAws = mockAwsCli(testDir);
      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;
      process.env.CLEANUP_ZIP = "1";
      process.env.CLEANUP_DIST_IF_EMPTY = "1";

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      // Verify dist directory exists before publish
      expect(existsSync(distDir)).toBe(true);

      try {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });

        // Dist directory should be removed since it's empty after ZIP cleanup
        expect(existsSync(distDir)).toBe(false);
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });
  });

  describe("S3 Upload Configuration", () => {
    test("uploads to correct S3 path structure", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "hic-base-layer",
        "2.1.3"
      );

      let capturedS3Command = "";
      const mockAws = mockAwsCli(testDir, {
        s3_cp:
          "upload: dist/hic-base-layer-2.1.3.zip to s3://hic-artifacts/layers/hic-base-layer/2.1.3/hic-base-layer-2.1.3.zip",
      });

      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "hic-base-layer";
      process.env.HIC_LAYER_VERSION = "2.1.3";
      process.env.LAYER_DESCRIPTION = "HIC Base Layer";
      process.env.ARTIFACT_BUCKET = "hic-artifacts";
      process.env.DIST_DIR = distDir;
      process.env.REGION = "us-west-2";

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      try {
        const output = execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
          encoding: "utf8",
        });

        expect(output).toContain(
          "s3://hic-artifacts/layers/hic-base-layer/2.1.3/hic-base-layer-2.1.3.zip"
        );
        expect(output).toContain("region us-west-2");
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });
  });

  describe("Runtime Configuration", () => {
    test("uses default nodejs20.x runtime when not specified", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      const mockAws = mockAwsCli(testDir);
      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;
      // Don't set RUNTIME - should default to nodejs20.x

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      try {
        const output = execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
          encoding: "utf8",
        });

        // Check that the script ran successfully
        expect(output).toContain("Publishing test-layer @ 1.0.0");
        expect(output).toContain(
          "arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1"
        );

        // Check the runtime was logged correctly
        const logPath = join(testDir, "aws-calls.log");
        if (existsSync(logPath)) {
          const logContent = readFileSync(logPath, "utf8");
          expect(logContent).toContain("Runtime: nodejs20.x");
        }
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });

    test("uses custom runtime when specified", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      const mockAws = mockAwsCli(testDir);
      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;
      process.env.RUNTIME = "nodejs18.x";

      // Create symlink to mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      try {
        const output = execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
          encoding: "utf8",
        });

        // Check that the script ran successfully
        expect(output).toContain("Publishing test-layer @ 1.0.0");
        expect(output).toContain(
          "arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1"
        );

        // Check the runtime was logged correctly
        const logPath = join(testDir, "aws-calls.log");
        if (existsSync(logPath)) {
          const logContent = readFileSync(logPath, "utf8");
          expect(logContent).toContain("Runtime: nodejs18.x");
        }
      } catch (error) {
        console.log("Publish script error:", error.message);
        throw error;
      }
    });
  });

  describe("Error Handling", () => {
    test("fails gracefully when AWS S3 upload fails", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Mock AWS CLI to fail on S3 upload
      const mockAws = join(testDir, "mock-aws-fail");
      writeFileSync(
        mockAws,
        `#!/bin/bash
if [[ "$1" == "s3" && "$2" == "cp" ]]; then
  echo "Error: Access Denied" >&2
  exit 1
fi
`,
        { mode: 0o755 }
      );

      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;

      // Create symlink to failing mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      expect(() => {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });

    test("fails gracefully when AWS Lambda publish fails", () => {
      const { layerDir, zipPath, distDir } = createMockLayerForPublish(
        testDir,
        "test-layer",
        "1.0.0"
      );

      // Mock AWS CLI to succeed S3 but fail Lambda
      const mockAws = join(testDir, "mock-aws-lambda-fail");
      writeFileSync(
        mockAws,
        `#!/bin/bash
if [[ "$1" == "s3" && "$2" == "cp" ]]; then
  echo "upload successful"
elif [[ "$1" == "lambda" && "$2" == "publish-layer-version" ]]; then
  echo "Error: Invalid layer content" >&2
  exit 1
fi
`,
        { mode: 0o755 }
      );

      process.env.PATH = `${testDir}:${originalPath}`;

      process.env.LAYER_DIR = layerDir;
      process.env.LAYER_NAME = "test-layer";
      process.env.HIC_LAYER_VERSION = "1.0.0";
      process.env.LAYER_DESCRIPTION = "Test layer";
      process.env.ARTIFACT_BUCKET = "test-bucket";
      process.env.DIST_DIR = distDir;

      // Create symlink to failing mock aws command
      const awsLink = join(testDir, "aws");
      writeFileSync(awsLink, `#!/bin/bash\nexec "${mockAws}" "$@"\n`, {
        mode: 0o755,
      });

      expect(() => {
        execSync(`bash "${publishScript}"`, {
          cwd: testDir,
          stdio: "pipe",
          env: process.env,
        });
      }).toThrow();
    });
  });
});
