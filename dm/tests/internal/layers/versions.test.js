import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "../../../facade/test-helpers/index.js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

// Test utilities
function createTempDir(prefix = "versions-test-") {
  const tempPath = join(
    tmpdir(),
    `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

function createMockVersionsEnv(tempDir, customVersions = {}) {
  const defaultVersions = {
    AWS_SDK_VERSION: "3.876.0",
    HIC_BASE_LAYER_NAME: "hic-base-layer",
    ...customVersions,
  };

  const content = Object.entries(defaultVersions)
    .map(([key, value]) => {
      // Handle shell variable substitution patterns
      if (typeof value === "string" && value.startsWith("${")) {
        return `${key}="${value}"`;
      }
      return `${key}="${value}"`;
    })
    .join("\n");

  const versionsPath = join(tempDir, "versions.env");
  writeFileSync(versionsPath, content);
  return versionsPath;
}

describe("versions.env - Lambda Layer Version Management", () => {
  let testDir;
  let originalCwd;
  let actualVersionsPath;

  beforeEach(() => {
    testDir = createTempDir();
    originalCwd = process.cwd();
    actualVersionsPath = join(process.cwd(), "layers", "versions.env");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("File Structure and Format", () => {
    test("versions.env file exists in layers directory", () => {
      expect(existsSync(actualVersionsPath)).toBe(true);
    });

    test("contains required base AWS SDK version", () => {
      const content = readFileSync(actualVersionsPath, "utf8");
      expect(content).toContain("AWS_SDK_VERSION=");

      // Extract the version and validate it's a semver
      const versionMatch = content.match(/AWS_SDK_VERSION="?([^"\n]+)"?/);
      expect(versionMatch).toBeTruthy();

      const version = versionMatch[1];
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("contains HIC layer name configuration", () => {
      const content = readFileSync(actualVersionsPath, "utf8");
      expect(content).toContain("HIC_BASE_LAYER_NAME=");
    });

    test("uses shell variable substitution for AWS SDK packages", () => {
      const content = readFileSync(actualVersionsPath, "utf8");

      // Should have variables that default to AWS_SDK_VERSION
      expect(content).toContain("$AWS_SDK_VERSION");
      expect(content).toContain("AWS_SDK_CLIENT_LAMBDA_VERSION=");
      expect(content).toContain("AWS_SDK_CLIENT_DYNAMODB_VERSION=");
    });
  });

  describe("Version Validation", () => {
    test("validates semantic versioning format", () => {
      const versionsPath = createMockVersionsEnv(testDir, {
        AWS_SDK_VERSION: "3.876.0",
        CUSTOM_VERSION: "1.2.3",
      });

      const content = readFileSync(versionsPath, "utf8");

      // Extract all version values
      const versionMatches = content.match(/="([0-9]+\.[0-9]+\.[0-9]+)"/g);
      expect(versionMatches).toBeTruthy();
      expect(versionMatches.length).toBeGreaterThan(0);

      versionMatches.forEach((match) => {
        const version = match.replace(/[="]/g, "");
        expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    test("rejects invalid version formats", () => {
      const versionsPath = createMockVersionsEnv(testDir, {
        AWS_SDK_VERSION: "invalid.version.format",
      });

      // Create a simple version validator script
      const validatorScript = join(testDir, "validate-versions.sh");
      writeFileSync(
        validatorScript,
        `#!/bin/bash
source "${versionsPath}"

validate_semver() {
  if [[ ! "$1" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then
    echo "Invalid semver: $1"
    exit 1
  fi
}

validate_semver "$AWS_SDK_VERSION"
echo "All versions valid"
`
      );

      expect(() => {
        execSync(`bash "${validatorScript}"`, { stdio: "pipe" });
      }).toThrow();
    });
  });

  describe("Dependency Version Consistency", () => {
    test("AWS SDK client packages inherit from base version", () => {
      const versionsPath = createMockVersionsEnv(testDir, {
        AWS_SDK_VERSION: "3.876.0",
        AWS_SDK_CLIENT_LAMBDA_VERSION:
          "${AWS_SDK_CLIENT_LAMBDA_VERSION:-$AWS_SDK_VERSION}",
        AWS_SDK_CLIENT_DYNAMODB_VERSION:
          "${AWS_SDK_CLIENT_DYNAMODB_VERSION:-$AWS_SDK_VERSION}",
      });

      // Test shell variable expansion
      const testScript = join(testDir, "test-expansion.sh");
      writeFileSync(
        testScript,
        `#!/bin/bash
source "${versionsPath}"

echo "BASE: $AWS_SDK_VERSION"
echo "LAMBDA: $AWS_SDK_CLIENT_LAMBDA_VERSION"  
echo "DYNAMODB: $AWS_SDK_CLIENT_DYNAMODB_VERSION"

if [[ "$AWS_SDK_CLIENT_LAMBDA_VERSION" == "$AWS_SDK_VERSION" ]]; then
  echo "LAMBDA_VERSION_MATCH=true"
fi

if [[ "$AWS_SDK_CLIENT_DYNAMODB_VERSION" == "$AWS_SDK_VERSION" ]]; then
  echo "DYNAMODB_VERSION_MATCH=true"
fi
`
      );

      const output = execSync(`bash "${testScript}"`, { encoding: "utf8" });

      expect(output).toContain("BASE: 3.876.0");
      expect(output).toContain("LAMBDA_VERSION_MATCH=true");
      expect(output).toContain("DYNAMODB_VERSION_MATCH=true");
    });

    test("allows override of individual AWS SDK package versions", () => {
      const versionsPath = createMockVersionsEnv(testDir);

      // Test with explicit override
      const testScript = join(testDir, "test-override.sh");
      writeFileSync(
        testScript,
        `#!/bin/bash
export AWS_SDK_CLIENT_LAMBDA_VERSION="3.999.0"  # Override
source "${versionsPath}"

echo "BASE: $AWS_SDK_VERSION"
echo "LAMBDA: $AWS_SDK_CLIENT_LAMBDA_VERSION"

if [[ "$AWS_SDK_CLIENT_LAMBDA_VERSION" == "3.999.0" ]]; then
  echo "OVERRIDE_SUCCESS=true"
fi
`
      );

      const output = execSync(`bash "${testScript}"`, { encoding: "utf8" });

      expect(output).toContain("BASE: 3.876.0");
      expect(output).toContain("LAMBDA: 3.999.0");
      expect(output).toContain("OVERRIDE_SUCCESS=true");
    });
  });

  describe("Layer Name Configuration", () => {
    test("provides default layer names with override capability", () => {
      const versionsPath = createMockVersionsEnv(testDir, {
        HIC_BASE_LAYER_NAME: "${HIC_BASE_LAYER_NAME:-hic-base-layer}",
      });

      // Test default value
      const testScript1 = join(testDir, "test-default.sh");
      writeFileSync(
        testScript1,
        `#!/bin/bash
source "${versionsPath}"
echo "DEFAULT: $HIC_BASE_LAYER_NAME"
`
      );

      const output1 = execSync(`bash "${testScript1}"`, { encoding: "utf8" });
      expect(output1).toContain("DEFAULT: hic-base-layer");

      // Test override
      const testScript2 = join(testDir, "test-override.sh");
      writeFileSync(
        testScript2,
        `#!/bin/bash
export HIC_BASE_LAYER_NAME="custom-base-layer"
source "${versionsPath}"
echo "OVERRIDE: $HIC_BASE_LAYER_NAME"
`
      );

      const output2 = execSync(`bash "${testScript2}"`, { encoding: "utf8" });
      expect(output2).toContain("OVERRIDE: custom-base-layer");
    });

    test("layer names follow naming conventions", () => {
      const content = readFileSync(actualVersionsPath, "utf8");

      // Extract layer name values
      const layerNameMatches = content.match(/LAYER_NAME[^=]*="?([^"\n]+)"?/g);

      if (layerNameMatches) {
        layerNameMatches.forEach((match) => {
          const nameValue = match.split("=")[1].replace(/["{$:-]/g, "");

          // Skip variable substitution patterns
          if (nameValue.includes("{") || nameValue.includes("}")) return;

          // Layer names should follow hic-*-layer pattern
          if (nameValue && !nameValue.includes("${")) {
            expect(nameValue).toMatch(/^hic-[\w-]+-layer$/);
          }
        });
      }
    });
  });

  describe("Cross-Layer Version Compatibility", () => {
    test("ensures AWS SDK version consistency across layers", () => {
      const content = readFileSync(actualVersionsPath, "utf8");

      // All AWS SDK client versions should reference the same base version
      const awsSdkReferences = content.match(
        /AWS_SDK_CLIENT_[A-Z_]+_VERSION="[^"]*\$AWS_SDK_VERSION[^"]*"/g
      );

      expect(awsSdkReferences).toBeTruthy();
      expect(awsSdkReferences.length).toBeGreaterThan(5); // Should have multiple AWS SDK clients

      awsSdkReferences.forEach((ref) => {
        // Each should reference $AWS_SDK_VERSION as default
        expect(ref).toContain("$AWS_SDK_VERSION");
      });
    });

    test("validates version environment can be sourced multiple times", () => {
      const versionsPath = createMockVersionsEnv(testDir);

      const testScript = join(testDir, "test-multiple-source.sh");
      writeFileSync(
        testScript,
        `#!/bin/bash
set -e

source "${versionsPath}"
FIRST_VERSION="$AWS_SDK_VERSION"

source "${versionsPath}"
SECOND_VERSION="$AWS_SDK_VERSION"

if [[ "$FIRST_VERSION" == "$SECOND_VERSION" ]]; then
  echo "CONSISTENT=true"
fi

echo "VERSION: $AWS_SDK_VERSION"
`
      );

      const output = execSync(`bash "${testScript}"`, { encoding: "utf8" });

      expect(output).toContain("CONSISTENT=true");
      expect(output).toContain("VERSION: 3.876.0");
    });
  });

  describe("Integration with Build System", () => {
    test("versions can be consumed by layer build scripts", () => {
      const versionsPath = createMockVersionsEnv(testDir, {
        AWS_SDK_VERSION: "3.876.0",
        AWS_SDK_CLIENT_LAMBDA_VERSION:
          "${AWS_SDK_CLIENT_LAMBDA_VERSION:-$AWS_SDK_VERSION}",
      });

      // Simulate how build scripts would use versions.env
      const buildScript = join(testDir, "mock-build.sh");
      writeFileSync(
        buildScript,
        `#!/bin/bash
set -e

# Source versions like build-lambda-layer.sh does
source "${versionsPath}"

# Create dependency JSON like build script does
LAYER_DEPENDENCIES="{\\"@aws-sdk/client-lambda\\": \\"$AWS_SDK_CLIENT_LAMBDA_VERSION\\"}"

echo "DEPENDENCIES: $LAYER_DEPENDENCIES"

# Validate JSON structure using Node.js
echo "$LAYER_DEPENDENCIES" | node -e "JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log('JSON_VALID=true')"
`
      );

      const output = execSync(`bash "${buildScript}"`, { encoding: "utf8" });

      expect(output).toContain(
        'DEPENDENCIES: {"@aws-sdk/client-lambda": "3.876.0"}'
      );
      expect(output).toContain("JSON_VALID=true");
    });

    test("supports dynamic version resolution at build time", () => {
      // Create a versions.env that doesn't set AWS_SDK_VERSION itself
      const versionsPath = join(testDir, "versions.env");
      writeFileSync(
        versionsPath,
        `# Dynamic version resolution test
# AWS_SDK_VERSION should come from environment
AWS_SDK_CLIENT_LAMBDA_VERSION="\${AWS_SDK_CLIENT_LAMBDA_VERSION:-$AWS_SDK_VERSION}"
`
      );

      // Simple test: check that AWS_SDK_CLIENT_LAMBDA_VERSION inherits from AWS_SDK_VERSION
      const simpleTest = join(testDir, "simple-test.sh");
      writeFileSync(
        simpleTest,
        `#!/bin/bash
export AWS_SDK_VERSION="3.999.0"
unset AWS_SDK_CLIENT_LAMBDA_VERSION

source "${versionsPath}"

echo "SUCCESS: Version resolved to $AWS_SDK_CLIENT_LAMBDA_VERSION"

if [[ "$AWS_SDK_CLIENT_LAMBDA_VERSION" == "3.999.0" ]]; then
    echo "MATCH_OK=true"
fi
`
      );

      const output = execSync(`bash "${simpleTest}"`, {
        encoding: "utf8",
      });

      expect(output).toContain("SUCCESS: Version resolved to 3.999.0");
      expect(output).toContain("MATCH_OK=true");
    });
  });
});
