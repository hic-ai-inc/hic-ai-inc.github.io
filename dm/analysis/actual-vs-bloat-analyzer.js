#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { safeLog, safeJsonParse, safePath } from "../layers/base/src/index.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ActualVsBloatAnalyzer {
  // Load configuration from external file
  loadConfiguration() {
    const configPath = path.join(__dirname, "analyzer-config.json");
    try {
      const configContent = fs.readFileSync(configPath, "utf8");
      return safeJsonParse(configContent, { source: "analyzer-config.json" });
    } catch (error) {
      safeLog("Warning: Could not load config, using defaults", {
        configPath,
        error: error.message,
      });
      return this.getDefaultConfiguration();
    }
  }

  constructor() {
    // Load configuration first
    this.config = this.loadConfiguration();

    // Pre-compile regex for performance
    this.requireRegex = new RegExp(this.config.importPatterns.require, "g");

    // Configuration with environment variable overrides and path validation
    const rawWorkspaceRoot = process.env.HIC_WORKSPACE_ROOT || process.cwd();
    try {
      this.workspaceRoot = safePath(rawWorkspaceRoot, process.cwd());
    } catch (error) {
      safeLog("Error: Invalid workspace root path, using current directory", {
        error: error.message,
      });
      this.workspaceRoot = process.cwd();
    }

    this.lambdaSubPath = process.env.HIC_LAMBDA_PATH || "src/lambda";

    // Initialize after config is loaded (will be set async)
    this.targetSystems = [];
    this.initializeAsync();
    this.sharedBloat = this.loadSharedBloatList();
    this.results = {};
  }

  async initializeAsync() {
    this.targetSystems = await this.discoverSystems();
  }

  // Fallback configuration if file not found
  getDefaultConfiguration() {
    return {
      excludedDirectories: [
        "node_modules",
        "shared",
        "docs",
        "scripts",
        "dependency-manager",
      ],
      nodeBuiltins: [
        "crypto",
        "fs",
        "path",
        "util",
        "events",
        "stream",
        "buffer",
        "os",
        "url",
      ],
      utilityDependencies: ["uuid", "joi", "lodash", "moment", "axios"],
      commonBloatDependencies: [
        "aws-sdk",
        "aws-sdk-client-mock",
        "jest",
        "joi",
        "uuid",
      ],
      sharedUtilPatterns: ["shared/utils", "hic-logger", "safe-"],
      importPatterns: {
        require: "require\\(['\"`]([^'\"`]+)['\"`]\\)",
        import: "import .+ from ['\"`]([^'\"`]+)['\"`]",
      },
      exampleUnnecessaryBloat: [
        "jest",
        "aws-sdk-client-mock",
        "unused AWS SDKs",
      ],
    };
  }

  // Auto-discover systems with Lambda functions
  async discoverSystems() {
    const systems = [];

    if (!this.workspaceRoot || typeof this.workspaceRoot !== "string") {
      safeLog("Error: Invalid workspace root path", this.workspaceRoot);
      return systems;
    }

    try {
      await fs.promises.access(this.workspaceRoot);
      const entries = await fs.promises.readdir(this.workspaceRoot, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !this.config.excludedDirectories.includes(entry.name)
        ) {
          try {
            const systemPath = safePath(entry.name, this.workspaceRoot);
            const lambdaPath = safePath(this.lambdaSubPath, systemPath);

            try {
              await fs.promises.access(lambdaPath);
              systems.push(entry.name);
            } catch {
              // Lambda path doesn't exist, skip this system
            }
          } catch (pathError) {
            safeLog("Warning: Skipping invalid system path", {
              systemName: entry.name,
              error: pathError.message,
            });
          }
        }
      }
    } catch (error) {
      safeLog("Error reading workspace directory", {
        workspaceRoot: this.workspaceRoot,
        error: error.message,
      });
    }

    return systems;
  }

  // Load shared bloat from versions.env or use defaults
  loadSharedBloatList() {
    let versionsPath;
    try {
      versionsPath = safePath(
        "dependency-manager/layers/versions.env",
        this.workspaceRoot
      );
    } catch (pathError) {
      safeLog("Warning: Invalid versions.env path, using defaults", {
        error: pathError.message,
      });
      return Array.isArray(this.config.commonBloatDependencies)
        ? this.config.commonBloatDependencies
        : [];
    }

    const bloatList = [];

    if (fs.existsSync(versionsPath)) {
      try {
        const content = fs.readFileSync(versionsPath, "utf8");
        const lines = content.split("\n");

        const combinedRegex =
          /AWS_SDK_(?:CLIENT_(?<client>\w+)|LIB_(?<lib>\w+)|UTIL_(?<util>\w+))_VERSION/;

        for (const line of lines) {
          if (line.includes("_VERSION=") && line.includes("aws-sdk")) {
            const match = line.match(combinedRegex);

            if (match && match.groups) {
              const { client, lib, util } = match.groups;
              const typeMap = { client, lib, util };

              for (const [type, value] of Object.entries(typeMap)) {
                if (value) {
                  const service = value.toLowerCase().replace(/_/g, "-");
                  bloatList.push(`@aws-sdk/${type}-${service}`);
                  break;
                }
              }
            }
          }
        }
      } catch (error) {
        safeLog("Warning: Could not read versions.env file", {
          versionsPath,
          error: error.message,
        });
      }
    }

    // Add common bloat dependencies with validation
    const commonBloat = Array.isArray(this.config.commonBloatDependencies)
      ? this.config.commonBloatDependencies
      : [];

    return [...new Set([...bloatList, ...commonBloat])];
  }

  async analyze() {
    // Ensure async initialization is complete
    if (this.targetSystems.length === 0) {
      await this.initializeAsync();
    }

    safeLog("🔍 ACTUAL vs BLOAT Analysis");
    safeLog("📁 Workspace", this.workspaceRoot);
    safeLog("🎯 Systems found", this.targetSystems.length);
    safeLog("📦 Shared bloat dependencies", this.sharedBloat.length);

    for (const systemName of this.targetSystems) {
      try {
        const systemPath = safePath(systemName, this.workspaceRoot);
        await this.analyzeSystem(systemName, systemPath);
      } catch (pathError) {
        safeLog("Warning: Skipping system with invalid path", {
          systemName,
          error: pathError.message,
        });
      }
    }

    this.generateMinimalReport();
  }

  async analyzeSystem(systemName, systemPath) {
    const systemData = {
      name: systemName,
      lambdas: new Map(),
      actualNeeds: new Set(),
      sharedUtilsUsed: new Set(),
      totalBloat: 0,
      actualSize: 0,
    };

    // Analyze each Lambda function with path validation
    let lambdaPath;
    try {
      lambdaPath = safePath(this.lambdaSubPath, systemPath);
    } catch (pathError) {
      safeLog("Warning: Invalid lambda path for system", {
        systemName,
        error: pathError.message,
      });
      return;
    }

    if (fs.existsSync(lambdaPath)) {
      try {
        const files = fs.readdirSync(lambdaPath, { withFileTypes: true });

        files.forEach((file) => {
          if (file.isFile() && file.name.endsWith(".js")) {
            try {
              const filePath = safePath(file.name, lambdaPath);
              const content = fs.readFileSync(filePath, "utf8");
              const analysis = this.analyzeLambdaActualNeeds(
                content,
                file.name
              );
              systemData.lambdas.set(file.name, analysis);

              analysis.actualImports.forEach((imp) =>
                systemData.actualNeeds.add(imp)
              );
              analysis.sharedUtils.forEach((util) =>
                systemData.sharedUtilsUsed.add(util)
              );
            } catch (fileError) {
              safeLog("Warning: Could not read Lambda file", {
                fileName: file.name,
                error: fileError.message,
              });
            }
          }
        });
      } catch (dirError) {
        safeLog("Warning: Could not read Lambda directory", {
          lambdaPath,
          error: dirError.message,
        });
      }
    }

    // Calculate bloat
    systemData.totalBloat = this.sharedBloat.length;
    systemData.actualSize = systemData.actualNeeds.size;

    this.results[systemName] = systemData;
  }

  analyzeLambdaActualNeeds(content, fileName) {
    const actualImports = new Set();
    const sharedUtils = new Set();
    const nodeBuiltins = new Set();

    // Extract all imports
    const lines = content.split("\n");

    lines.forEach((line) => {
      const trimmed = line.trim();

      // require() statements
      const requireMatch = trimmed.match(this.requireRegex);
      if (requireMatch) {
        requireMatch.forEach((match) => {
          const depMatch = match.match(/require\(['"`]([^'"`]+)['"`]\)/);
          if (depMatch && depMatch[1]) {
            const dep = depMatch[1];
            this.categorizeDependency(
              dep,
              actualImports,
              sharedUtils,
              nodeBuiltins
            );
          }
        });
      }
    });

    return {
      fileName,
      actualImports: Array.from(actualImports),
      sharedUtils: Array.from(sharedUtils),
      nodeBuiltins: Array.from(nodeBuiltins),
      bloatRatio: this.sharedBloat.length / Math.max(actualImports.size, 1),
    };
  }

  categorizeDependency(dep, actualImports, sharedUtils, nodeBuiltins) {
    if (dep.startsWith("@aws-sdk/") || dep === "aws-sdk") {
      actualImports.add(dep);
    } else if (
      this.config.sharedUtilPatterns.some((pattern) => dep.includes(pattern))
    ) {
      const utilName = dep.split("/").pop();
      if (utilName) sharedUtils.add(utilName);
    } else if (this.isNodeBuiltin(dep)) {
      nodeBuiltins.add(dep);
    } else if (this.config.utilityDependencies.includes(dep)) {
      actualImports.add(dep);
    }
  }

  isNodeBuiltin(moduleName) {
    if (!moduleName || typeof moduleName !== "string") return false;
    const nodeBuiltins = Array.isArray(this.config.nodeBuiltins)
      ? this.config.nodeBuiltins
      : [];
    return nodeBuiltins.includes(moduleName) || moduleName.startsWith("node:");
  }

  generateMinimalReport() {
    safeLog("📊 ACTUAL vs BLOAT ANALYSIS");
    safeLog("=".repeat(50));

    let totalLambdas = 0;
    let totalActualDeps = 0;
    let totalBloatDeps = 0;

    Object.values(this.results).forEach((system) => {
      safeLog(`\n${system.name.toUpperCase()}:`);
      safeLog(`  Lambdas: ${system.lambdas.size}`);
      safeLog(`  Actually Needs: ${system.actualSize} deps`);
      safeLog(`  Gets from Shared: ${system.totalBloat} deps`);
      safeLog(
        `  Bloat Ratio: ${Math.round(
          system.totalBloat / Math.max(system.actualSize, 1)
        )}x`
      );

      totalLambdas += system.lambdas.size;
      totalActualDeps += system.actualSize;
      totalBloatDeps += system.totalBloat;

      if (system.lambdas.size > 0) {
        safeLog(`  Lambda Details:`);
        system.lambdas.forEach((analysis, fileName) => {
          safeLog(`    Lambda analysis`, {
            fileName,
            needs: analysis.actualImports.length,
            gets: this.sharedBloat.length,
            bloatRatio: Math.round(analysis.bloatRatio),
          });
        });
      }
    });

    // Find truly shared utilities
    const utilUsage = new Map();
    Object.values(this.results).forEach((system) => {
      system.sharedUtilsUsed.forEach((util) => {
        utilUsage.set(util, (utilUsage.get(util) || 0) + 1);
      });
    });

    const trulyShared = Array.from(utilUsage.entries())
      .filter(([util, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    safeLog("\n🎯 OPTIMIZATION SUMMARY:");
    safeLog("  Total Lambdas", totalLambdas);
    const resultCount = Object.keys(this.results).length;
    safeLog(
      "  Average Actual Needs",
      resultCount > 0 ? Math.round(totalActualDeps / resultCount) : 0
    );
    safeLog("  Current Bloat Per Lambda", this.sharedBloat.length);
    safeLog(
      "  Average Bloat Ratio",
      Math.round(totalBloatDeps / Math.max(totalActualDeps, 1))
    );

    safeLog("\n✅ TRULY SHARED UTILITIES:");
    if (trulyShared.length > 0) {
      trulyShared.forEach(([util, count]) => {
        safeLog("    Shared utility", { util, systemCount: count });
      });
    } else {
      safeLog("    None found - each system uses different utilities");
    }

    safeLog("\n🗑️  UNNECESSARY BLOAT (per Lambda):");
    const utilSet = new Set(utilUsage.keys());
    const unnecessaryBloat = this.sharedBloat.filter((dep) => {
      for (const util of utilSet) {
        if (dep.includes(util)) return false;
      }
      return true;
    });
    safeLog("    Unused dependencies count", unnecessaryBloat.length);
    safeLog("    Including examples", this.config.exampleUnnecessaryBloat);

    safeLog("\n💡 MINIMAL SHARED PACKAGE SHOULD CONTAIN:");
    if (trulyShared.length > 0) {
      safeLog(
        "    Recommended utilities",
        trulyShared.map(([util]) => util)
      );
    } else {
      safeLog("    Possibly nothing - each system has different needs");
    }

    safeLog("\n" + "=".repeat(50));
  }
}

const analyzer = new ActualVsBloatAnalyzer();
analyzer.analyze();
