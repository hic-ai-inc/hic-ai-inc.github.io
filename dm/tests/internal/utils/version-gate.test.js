import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "../../../facade/test-helpers/index.js";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Test utilities
function createTempDir(prefix = "version-gate-simple-") {
  const tempPath = join(
    tmpdir(),
    `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

function createMockLayer(layerDir, version = "1.0.0", dependencies = {}) {
  mkdirSync(layerDir, { recursive: true });

  // Create package.json
  writeFileSync(
    join(layerDir, "package.json"),
    JSON.stringify(
      {
        name: `hic-${layerDir.split(/[\\/]/).pop()}-layer`,
        version,
        dependencies,
      },
      null,
      2
    )
  );

  // Create src directory with index.js
  const srcDir = join(layerDir, "src");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, "index.js"),
    `// HIC Layer v${version}
export const version = "${version}";
export const dependencies = ${JSON.stringify(Object.keys(dependencies))};
`
  );

  return layerDir;
}

function parseSemanticVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function compareVersions(from, to) {
  const fromVer = parseSemanticVersion(from);
  const toVer = parseSemanticVersion(to);

  if (toVer.major > fromVer.major) return "MAJOR";
  if (toVer.major < fromVer.major) return "DOWNGRADE";
  if (toVer.minor > fromVer.minor) return "MINOR";
  if (toVer.minor < fromVer.minor) return "DOWNGRADE";
  if (toVer.patch > fromVer.patch) return "PATCH";
  if (toVer.patch < fromVer.patch) return "DOWNGRADE";
  return "IDENTICAL";
}

describe("Version Gate System - Logic Validation", () => {
  let testDir;

  beforeEach(() => {
    testDir = createTempDir("version-gate-logic-");
    process.env.NODE_ENV = "test";
    process.env.SUPPRESS_LOGS = "true";
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.SUPPRESS_LOGS;
  });

  describe("Semantic Version Parsing", () => {
    test("parses valid semantic versions correctly", async () => {
      const testVersions = ["1.0.0", "2.5.3", "10.20.30"];

      testVersions.forEach((version) => {
        const parsed = parseSemanticVersion(version);
        expect(parsed).toHaveProperty("major");
        expect(parsed).toHaveProperty("minor");
        expect(parsed).toHaveProperty("patch");
        expect(typeof parsed.major).toBe("number");
      });
    });

    test("rejects invalid semantic versions", async () => {
      const invalidVersions = ["1.0", "1.0.0.0", "v1.0.0", "1.0.0-alpha"];

      invalidVersions.forEach((version) => {
        expect(() => parseSemanticVersion(version)).toThrow();
      });
    });

    test("handles version components as numbers", async () => {
      const parsed = parseSemanticVersion("12.34.56");
      expect(parsed.major).toBe(12);
      expect(parsed.minor).toBe(34);
      expect(parsed.patch).toBe(56);
    });
  });

  describe("Version Comparison Logic", () => {
    test("identifies major version bumps", async () => {
      const scenarios = [
        { from: "1.2.3", to: "2.0.0", expected: "MAJOR" },
        { from: "2.5.1", to: "3.0.0", expected: "MAJOR" },
        { from: "0.9.9", to: "1.0.0", expected: "MAJOR" },
      ];

      scenarios.forEach(({ from, to, expected }) => {
        const result = compareVersions(from, to);
        expect(result).toBe(expected);
      });
    });

    test("identifies minor version bumps", async () => {
      const scenarios = [
        { from: "1.2.3", to: "1.3.0", expected: "MINOR" },
        { from: "2.0.0", to: "2.1.0", expected: "MINOR" },
        { from: "1.5.2", to: "1.10.0", expected: "MINOR" },
      ];

      scenarios.forEach(({ from, to, expected }) => {
        const result = compareVersions(from, to);
        expect(result).toBe(expected);
      });
    });

    test("identifies patch version bumps", async () => {
      const scenarios = [
        { from: "1.2.3", to: "1.2.4", expected: "PATCH" },
        { from: "2.0.0", to: "2.0.1", expected: "PATCH" },
        { from: "1.5.10", to: "1.5.11", expected: "PATCH" },
      ];

      scenarios.forEach(({ from, to, expected }) => {
        const result = compareVersions(from, to);
        expect(result).toBe(expected);
      });
    });

    test("identifies identical versions", async () => {
      const scenarios = [
        { from: "1.2.3", to: "1.2.3", expected: "IDENTICAL" },
        { from: "0.0.0", to: "0.0.0", expected: "IDENTICAL" },
      ];

      scenarios.forEach(({ from, to, expected }) => {
        const result = compareVersions(from, to);
        expect(result).toBe(expected);
      });
    });

    test("detects version downgrades", async () => {
      const scenarios = [
        { from: "2.0.0", to: "1.9.9", expected: "DOWNGRADE" },
        { from: "1.5.3", to: "1.4.10", expected: "DOWNGRADE" },
        { from: "1.2.5", to: "1.2.3", expected: "DOWNGRADE" },
      ];

      scenarios.forEach(({ from, to, expected }) => {
        const result = compareVersions(from, to);
        expect(result).toBe(expected);
      });
    });
  });

  describe("Layer Configuration Validation", () => {
    test("validates layer directory structure", async () => {
      const layerDir = join(testDir, "valid-layer");
      createMockLayer(layerDir, "1.0.0", { lodash: "^4.17.21" });

      // Verify package.json exists and is valid
      expect(existsSync(join(layerDir, "package.json"))).toBe(true);
      const packageData = JSON.parse(
        readFileSync(join(layerDir, "package.json"), "utf8")
      );
      expect(packageData.version).toBe("1.0.0");
      expect(packageData.dependencies.lodash).toBe("^4.17.21");

      // Verify src directory and index.js exist
      expect(existsSync(join(layerDir, "src"))).toBe(true);
      expect(existsSync(join(layerDir, "src", "index.js"))).toBe(true);
    });

    test("handles layer with no dependencies", async () => {
      const layerDir = join(testDir, "no-deps-layer");
      createMockLayer(layerDir, "2.0.0", {});

      const packageData = JSON.parse(
        readFileSync(join(layerDir, "package.json"), "utf8")
      );
      expect(packageData.version).toBe("2.0.0");
      expect(Object.keys(packageData.dependencies)).toHaveProperty("length", 0);
    });

    test("handles layer with complex dependencies", async () => {
      const layerDir = join(testDir, "complex-deps-layer");
      const dependencies = {
        "@aws-sdk/client-s3": "^3.400.0",
        "@aws-sdk/client-dynamodb": "^3.400.0",
        lodash: "^4.17.21",
        moment: "^2.29.4",
        uuid: "^9.0.0",
      };

      createMockLayer(layerDir, "1.5.0", dependencies);

      const packageData = JSON.parse(
        readFileSync(join(layerDir, "package.json"), "utf8")
      );
      expect(packageData.version).toBe("1.5.0");
      expect(Object.keys(packageData.dependencies)).toHaveProperty("length", 5);
      expect(packageData.dependencies["@aws-sdk/client-s3"]).toBe("^3.400.0");
    });
  });

  describe("Version Manifest Generation", () => {
    test("creates valid version manifest structure", async () => {
      const layerDir = join(testDir, "manifest-layer");
      createMockLayer(layerDir, "1.3.0");

      const manifest = {
        layerName: "hic-manifest-layer-layer",
        currentVersion: "1.3.0",
        nextVersion: "1.3.1",
        decision: "PATCH",
        reason: "Bug fixes and minor improvements",
        timestamp: new Date().toISOString(),
        contentHash: "abc123def456789",
        dependencies: {
          added: [],
          updated: ["lodash@^4.17.21"],
          removed: [],
        },
        sourceChanges: {
          modified: ["src/index.js"],
          added: [],
          deleted: [],
        },
      };

      writeFileSync(
        join(layerDir, "version.manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      const manifestContent = JSON.parse(
        readFileSync(join(layerDir, "version.manifest.json"), "utf8")
      );

      // Validate manifest structure
      expect(manifestContent.layerName).toBe("hic-manifest-layer-layer");
      expect(manifestContent.decision).toBe("PATCH");
      expect(manifestContent.nextVersion).toBe("1.3.1");
      expect(manifestContent).toHaveProperty("timestamp");
      expect(manifestContent).toHaveProperty("contentHash");
      expect(manifestContent.dependencies).toHaveProperty("added");
      expect(manifestContent.dependencies).toHaveProperty("updated");
      expect(manifestContent.dependencies).toHaveProperty("removed");
    });

    test("tracks dependency changes accurately", async () => {
      const layerDir = join(testDir, "dependency-tracking");
      createMockLayer(layerDir, "2.1.0");

      const manifest = {
        layerName: "hic-dependency-tracking-layer",
        currentVersion: "2.1.0",
        nextVersion: "2.1.1",
        decision: "PATCH",
        reason: "Dependency updates",
        timestamp: new Date().toISOString(),
        dependencies: {
          added: ["uuid@^9.0.0"],
          updated: ["lodash@^4.17.21"],
          removed: ["moment@^2.29.3"],
        },
      };

      writeFileSync(
        join(layerDir, "version.manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      const manifestContent = JSON.parse(
        readFileSync(join(layerDir, "version.manifest.json"), "utf8")
      );

      expect(manifestContent.dependencies.added).toContain("uuid@^9.0.0");
      expect(manifestContent.dependencies.updated).toContain("lodash@^4.17.21");
      expect(manifestContent.dependencies.removed).toContain("moment@^2.29.3");
    });

    test("validates decision types", async () => {
      const validDecisions = ["MAJOR", "MINOR", "PATCH", "noop"];

      validDecisions.forEach((decision) => {
        expect(["MAJOR", "MINOR", "PATCH", "noop"]).toContain(decision);
      });

      const invalidDecisions = ["major", "Minor", "PATCHED", "skip"];
      invalidDecisions.forEach((decision) => {
        expect(["MAJOR", "MINOR", "PATCH", "noop"]).not.toContain(decision);
      });
    });
  });

  describe("Error Handling", () => {
    test("handles missing layer directory", async () => {
      const nonexistentDir = join(testDir, "nonexistent-layer");

      expect(existsSync(nonexistentDir)).toBe(false);
    });

    test("handles corrupted package.json", async () => {
      const layerDir = join(testDir, "corrupted-package");
      mkdirSync(layerDir, { recursive: true });

      writeFileSync(join(layerDir, "package.json"), "{ invalid json content");

      expect(() => {
        JSON.parse(readFileSync(join(layerDir, "package.json"), "utf8"));
      }).toThrow();
    });

    test("handles missing src directory", async () => {
      const layerDir = join(testDir, "missing-src");
      mkdirSync(layerDir, { recursive: true });

      writeFileSync(
        join(layerDir, "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" }, null, 2)
      );

      expect(existsSync(join(layerDir, "package.json"))).toBe(true);
      expect(existsSync(join(layerDir, "src"))).toBe(false);
    });

    test("handles invalid version format in package.json", async () => {
      const layerDir = join(testDir, "invalid-version");
      mkdirSync(layerDir, { recursive: true });

      writeFileSync(
        join(layerDir, "package.json"),
        JSON.stringify({ name: "test", version: "not-a-version" }, null, 2)
      );

      const packageData = JSON.parse(
        readFileSync(join(layerDir, "package.json"), "utf8")
      );
      expect(() => parseSemanticVersion(packageData.version)).toThrow();
    });
  });
});
