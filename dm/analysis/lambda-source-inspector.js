#!/usr/bin/env node

/**
 * Lambda Source Inspector
 * Examines the actual source code of all 81 Lambda functions
 * to discover real patterns without assumptions
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { safeLog, safePath } from "../layers/base/src/index.js";

// Helper function to parse environment arrays
const parseEnvArray = (envVar) => {
  if (envVar !== undefined && typeof envVar !== "string") {
    throw new Error(
      `Environment variable must be string, got ${typeof envVar}`
    );
  }
  const value = envVar || "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

// Safe parameter validation
const validateStringParam = (param, paramName) => {
  if (!param || typeof param !== "string") {
    throw new Error(`Invalid ${paramName}: must be non-empty string`);
  }
  return param.trim();
};

// Validate audit command against whitelist
const validateAuditCommand = (command) => {
  const allowedCommands = [
    "node dependency-manager/analysis/lambda-audit.js",
    "npm run audit-lambda",
  ];
  if (!allowedCommands.includes(command)) {
    throw new Error(`Invalid audit command: ${command}`);
  }
  return command;
};

// Validate file size with bounds checking
const validateFileSize = (sizeEnv) => {
  const size = parseInt(sizeEnv, 10) || 1024 * 1024;
  if (size < 1024 || size > 10 * 1024 * 1024) {
    return 1024 * 1024; // Default 1MB
  }
  return size;
};

// Validate entry name to prevent path traversal
const isValidEntryName = (entryName) => {
  return (
    entryName &&
    typeof entryName === "string" &&
    !entryName.includes("..") &&
    !entryName.includes("\0") &&
    !path.isAbsolute(entryName) &&
    !entryName.startsWith("/") &&
    !entryName.startsWith("\\")
  );
};

// Configuration from environment variables
const CONFIG = {
  excludedSystemDirs: parseEnvArray(
    process.env.HIC_EXCLUDED_SYSTEM_DIRS || "node_modules,shared,docs,scripts"
  ),
  excludedScanDirs: parseEnvArray(
    process.env.HIC_EXCLUDED_SCAN_DIRS || "node_modules,tests,test"
  ),
  auditCommand: validateAuditCommand(
    process.env.HIC_AUDIT_COMMAND ||
      "node dependency-manager/analysis/lambda-audit.js"
  ),
  srcDirName: process.env.HIC_SRC_DIR_NAME || "src",
  lambdaDirName: process.env.HIC_LAMBDA_DIR_NAME || "lambda",
  infraDirName: process.env.HIC_INFRA_DIR_NAME || "infrastructure",
  fileExtension: process.env.HIC_FILE_EXTENSION || ".js",
  handlerPatterns: parseEnvArray(
    process.env.HIC_HANDLER_PATTERNS ||
      "exports.handler,module.exports.handler,async (event"
  ),
  handlerFilePatterns: parseEnvArray(
    process.env.HIC_HANDLER_FILE_PATTERNS || "handler,function"
  ),
  maxFileSize: validateFileSize(process.env.HIC_MAX_FILE_SIZE),
};

class LambdaSourceInspector {
  constructor() {
    this.functions = [];
    this.patterns = new Map();
    this.dependencies = new Map();
  }

  // Get function list dynamically from audit results
  getFunctionList() {
    safeLog("📋 Lambda Functions from Audit:");
    safeLog("=".repeat(60));

    // Run audit to get actual counts
    try {
      const auditOutput = execSync(CONFIG.auditCommand, {
        encoding: "utf8",
        timeout: 30000,
      });
      const totalMatch = auditOutput.match(/Total Lambda Functions: (\d+)/);
      const totalFunctions = totalMatch ? parseInt(totalMatch[1], 10) : 0;

      safeLog(`Total functions found: ${totalFunctions}`);
      safeLog("\n🔍 Now examining actual source code...\n");
      return totalFunctions;
    } catch (error) {
      safeLog("Could not run audit, proceeding with source scan...");
      return 0;
    }
  }

  // Find actual source files for Lambda functions
  async findSourceFiles() {
    try {
      const workspaceRoot = safePath(process.cwd());
      const entries = await fs.promises.readdir(workspaceRoot, {
        withFileTypes: true,
      });

      const systemDirs = entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            !CONFIG.excludedSystemDirs.includes(entry.name)
        )
        .map((entry) => entry.name);

      for (const systemDir of systemDirs) {
        const systemPath = safePath(path.join(workspaceRoot, systemDir));
        if (this.hasLambdaSources(systemPath)) {
          safeLog(`📁 Examining ${systemDir}...`);
          await this.scanSystemForSources(systemPath, systemDir);
        }
      }
    } catch (error) {
      safeLog(`Error: Could not scan workspace: ${error.message}`);
      throw error;
    }
  }

  // Scan system directory for actual Lambda source files
  async scanSystemForSources(systemPath, systemName) {
    const validatedSystemPath = safePath(systemPath);
    validateStringParam(systemName, "systemName");
    const srcPath = safePath(path.join(validatedSystemPath, CONFIG.srcDirName));
    try {
      await fs.promises.access(srcPath);
      await this.scanDirectoryRecursive(srcPath, systemName, 0);
    } catch {}

    // Also check for lambda directories
    const lambdaPath = safePath(
      path.join(validatedSystemPath, CONFIG.lambdaDirName)
    );
    try {
      await fs.promises.access(lambdaPath);
      await this.scanDirectoryRecursive(lambdaPath, systemName, 0);
    } catch {}
  }

  // Recursively scan for JavaScript files
  async scanDirectoryRecursive(dirPath, systemName, depth = 0) {
    // Prevent excessive recursion
    if (depth > 20) {
      safeLog(`Warning: Maximum depth reached, skipping: ${dirPath}`);
      return;
    }
    try {
      const validatedDirPath = safePath(dirPath);
      const entries = await fs.promises.readdir(validatedDirPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        // Validate entry name to prevent path traversal
        if (!isValidEntryName(entry.name)) {
          safeLog(`Warning: Suspicious entry name: ${entry.name}`);
          continue;
        }

        const fullPath = safePath(path.join(validatedDirPath, entry.name));

        if (
          entry.isDirectory() &&
          !CONFIG.excludedScanDirs.includes(entry.name)
        ) {
          await this.scanDirectoryRecursive(fullPath, systemName, depth + 1);
        } else if (
          entry.isFile() &&
          entry.name.endsWith(CONFIG.fileExtension)
        ) {
          await this.examineSourceFile(fullPath, systemName);
        }
      }
    } catch (error) {
      safeLog(`Warning: Could not scan ${dirPath}: ${error.message}`);
    }
  }

  // Examine individual source file
  async examineSourceFile(filePath, systemName) {
    try {
      const validatedPath = safePath(filePath);
      const sanitizedSystemName = validateStringParam(systemName, "systemName")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 50);

      // Check file size before reading
      let stats;
      try {
        stats = await fs.promises.stat(validatedPath);
      } catch (statError) {
        safeLog(
          `Warning: Could not stat file ${validatedPath}: ${statError.message}`
        );
        return;
      }
      if (stats.size > CONFIG.maxFileSize) {
        safeLog(`Warning: File too large, skipping: ${validatedPath}`);
        return;
      }

      const content = await fs.promises.readFile(validatedPath, "utf8");
      const fileName = path.basename(validatedPath, CONFIG.fileExtension);
      const relativePath = path.relative(process.cwd(), validatedPath);

      // Only examine files that look like Lambda handlers
      if (this.isLambdaHandler(content, fileName)) {
        const analysis = {
          system: sanitizedSystemName,
          file: fileName,
          path: relativePath,
          awsServices: this.extractAWSServices(content),
          imports: this.extractImports(content),
          exports: this.extractExports(content),
          eventTypes: this.extractEventTypes(content),
          size: content.length,
        };

        this.functions.push(analysis);
        safeLog(
          `   📄 ${fileName} (${analysis.awsServices.length} AWS services)`
        );
      }
    } catch (error) {
      safeLog(`Warning: Could not examine ${filePath}: ${error.message}`);
    }
  }

  // Check if system has Lambda sources
  hasLambdaSources(systemPath) {
    try {
      const validatedSystemPath = safePath(systemPath);
      const srcPath = safePath(
        path.join(validatedSystemPath, CONFIG.srcDirName)
      );
      const lambdaPath = safePath(
        path.join(validatedSystemPath, CONFIG.lambdaDirName)
      );
      const infraPath = safePath(
        path.join(validatedSystemPath, CONFIG.infraDirName)
      );

      return (
        fs.existsSync(srcPath) ||
        fs.existsSync(lambdaPath) ||
        fs.existsSync(infraPath)
      );
    } catch (error) {
      safeLog(
        `Warning: Could not check Lambda sources in ${systemPath}: ${error.message}`
      );
      return false;
    }
  }

  // Check if file is a Lambda handler
  isLambdaHandler(content, fileName) {
    const hasHandlerPattern = CONFIG.handlerPatterns.some((pattern) =>
      content.includes(pattern)
    );
    const hasHandlerFileName = CONFIG.handlerFilePatterns.some((pattern) =>
      fileName.toLowerCase().includes(pattern.toLowerCase())
    );

    return hasHandlerPattern || hasHandlerFileName;
  }

  // Extract all AWS-related patterns found in code
  extractAWSServices(content) {
    if (!content || typeof content !== "string") {
      return [];
    }

    // Limit content size for regex operations
    const limitedContent =
      content.length > 100000 ? content.substring(0, 100000) : content;
    const services = new Set();

    try {
      // AWS SDK v3 clients
      const v3Matches = limitedContent.match(/@aws-sdk\/[\w-]+/g);
      if (v3Matches) {
        v3Matches.forEach((match) => services.add(match));
      }

      // AWS SDK v2 services
      const v2Matches = limitedContent.match(/new AWS\.[\w]+/g);
      if (v2Matches) {
        v2Matches.forEach((match) => services.add(match));
      }

      // Any AWS service method calls
      const awsMethodMatches = limitedContent.match(
        /\w+\.(send|invoke|put|get|delete|list|create|update)[\w]*\(/g
      );
      if (awsMethodMatches) {
        awsMethodMatches.forEach((match) => services.add(`method:${match}`));
      }

      // Any AWS-related imports or requires
      const awsImportMatches = limitedContent.match(
        /["'][@\w/-]*aws[\w/-]*["']/g
      );
      if (awsImportMatches) {
        awsImportMatches.forEach((match) => services.add(`import:${match}`));
      }
    } catch (regexError) {
      safeLog(`Warning: Regex processing failed: ${regexError.message}`);
    }

    return Array.from(services);
  }

  // Extract import statements
  extractImports(content) {
    if (!content || typeof content !== "string") {
      return [];
    }

    const imports = [];
    const limitedContent =
      content.length > 50000 ? content.substring(0, 50000) : content;

    try {
      // require statements
      const requireMatches = limitedContent.match(
        /require\(['"`]([^'"`]+)['"`]\)/g
      );
      if (requireMatches) {
        requireMatches.forEach((match) => {
          const module = match.match(/require\(['"`]([^'"`]+)['"`]\)/)[1];
          imports.push(module);
        });
      }

      // import statements
      const importMatches = limitedContent.match(
        /import .+ from ['"`]([^'"`]+)['"`]/g
      );
      if (importMatches) {
        importMatches.forEach((match) => {
          const moduleMatch = match.match(/from ['"`]([^'"`]+)['"`]/);
          if (moduleMatch && moduleMatch[1]) {
            imports.push(moduleMatch[1]);
          }
        });
      }
    } catch (regexError) {
      safeLog(`Warning: Import extraction failed: ${regexError.message}`);
    }

    return imports;
  }

  // Extract exports
  extractExports(content) {
    if (!content || typeof content !== "string") {
      return [];
    }

    const exports = [];

    const exportMatches = content.match(/exports\.(\w+)/g);
    if (exportMatches) {
      exportMatches.forEach((match) => {
        const exportName = match.replace("exports.", "");
        if (!exports.includes(exportName)) {
          exports.push(exportName);
        }
      });
    }

    return exports;
  }

  // Extract all event-related patterns found in code
  extractEventTypes(content) {
    if (!content || typeof content !== "string") {
      return [];
    }

    const eventTypes = new Set();
    const limitedContent =
      content.length > 50000 ? content.substring(0, 50000) : content;

    try {
      // Find all "event." references
      const eventDotMatches = limitedContent.match(/event\.[\w\[\]"']+/g);
      if (eventDotMatches) {
        eventDotMatches.forEach((match) => eventTypes.add(match));
      }

      // Find all "Event" type references
      const eventTypeMatches = limitedContent.match(/\w*Event/g);
      if (eventTypeMatches) {
        eventTypeMatches.forEach((match) => eventTypes.add(match));
      }

      // Find all context references
      const contextMatches = limitedContent.match(/context\.[\w]+/g);
      if (contextMatches) {
        contextMatches.forEach((match) => eventTypes.add(match));
      }
    } catch (regexError) {
      safeLog(`Warning: Event type extraction failed: ${regexError.message}`);
    }

    return Array.from(eventTypes);
  }

  // Generate comprehensive report
  generateReport() {
    safeLog("\n" + "=".repeat(80));
    safeLog("📊 LAMBDA SOURCE CODE ANALYSIS REPORT");
    safeLog("=".repeat(80));

    safeLog(`\n🎯 SUMMARY:`);
    safeLog(`   Lambda source files found: ${this.functions.length}`);
    const uniqueSystems = new Set();
    this.functions.forEach((f) => uniqueSystems.add(f.system));
    safeLog(`   Systems analyzed: ${uniqueSystems.size}`);

    // AWS Services usage
    const allServices = new Set();
    this.functions.forEach((func) => {
      func.awsServices.forEach((service) => allServices.add(service));
    });

    safeLog(`\n🔧 AWS SERVICES DETECTED (${allServices.size} unique):`);
    Array.from(allServices)
      .sort()
      .forEach((service) => {
        const count = this.functions.filter((f) =>
          f.awsServices.includes(service)
        ).length;
        safeLog(`   ${service}: ${count} functions`);
      });

    // System breakdown
    safeLog(`\n📁 BY SYSTEM:`);
    const systemGroups = new Map();
    this.functions.forEach((func) => {
      // Sanitize system name to prevent prototype pollution
      const sanitizedSystem = (func.system || "unknown")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 50);

      if (!systemGroups.has(sanitizedSystem)) {
        systemGroups.set(sanitizedSystem, []);
      }
      systemGroups.get(sanitizedSystem).push(func);
    });

    Array.from(systemGroups.entries()).forEach(([system, functions]) => {
      safeLog(`\n   ${system.toUpperCase()} (${functions.length} functions):`);
      functions.forEach((func) => {
        safeLog(`     📄 ${func.file}`);
        safeLog(`        Path: ${func.path}`);
        safeLog(
          `        AWS Services: ${func.awsServices.join(", ") || "None"}`
        );
        safeLog(`        Event Types: ${func.eventTypes.join(", ") || "None"}`);
        safeLog(`        Size: ${func.size} chars`);
      });
    });

    safeLog("\n" + "=".repeat(80));
    safeLog("✅ Analysis complete. Review AWS services and patterns above.");
    safeLog("Next: Use this data to create tailored Lambda layers.");
  }

  // Run complete inspection
  async run() {
    safeLog("🔍 Lambda Source Code Inspector\n");
    this.getFunctionList();
    await this.findSourceFiles();
    this.generateReport();
  }
}

// Run inspection
const inspector = new LambdaSourceInspector();
inspector.run().catch((error) => {
  safeLog(`Fatal error during inspection: ${error.message}`);
  process.exit(1);
});
