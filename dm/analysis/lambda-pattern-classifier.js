#!/usr/bin/env node

/**
 * Lambda Pattern Classifier
 * Analyzes all 81 Lambda functions across HIC platform to identify common patterns
 * and create tailored layer specifications for each pattern type
 */

import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { safeLog, safePath } from "../layers/base/src/index.js";

// Safe integer parsing with validation
const safeParseInt = (value, defaultValue, min = 1, max = 1000) => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    return defaultValue;
  }
  return parsed;
};

// Helper function to parse environment arrays
const parseEnvArray = (envVar, defaultValue) => {
  const value = typeof envVar === "string" ? envVar : defaultValue;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

// Helper function to parse environment arrays as Sets
const parseEnvSet = (envVar, defaultValue) => {
  return new Set(parseEnvArray(envVar, defaultValue));
};

// Configuration from environment variables with validation
const CONFIG = {
  excludedDirs: parseEnvArray(
    process.env.HIC_EXCLUDED_DIRS,
    "node_modules,tests,.git,dist,build"
  ),
  additionalExcludedDirs: parseEnvArray(
    process.env.HIC_ADDITIONAL_EXCLUDED_DIRS,
    ".git,.aws,shared,docs,dependency-manager"
  ),
  awsServices: parseEnvArray(
    process.env.HIC_AWS_SERVICES,
    "DynamoDB,SNS,SQS,Lambda,StepFunctions,SecretsManager,SSM,Bedrock"
  ),
  fallbackSystems: parseEnvArray(
    process.env.HIC_FALLBACK_SYSTEMS,
    "api-auth-unified,rfa-unified,research,ets"
  ),
  fileExtensions: parseEnvArray(process.env.HIC_FILE_EXTENSIONS, ".js"),
  handlerPatterns: parseEnvArray(
    process.env.HIC_HANDLER_PATTERNS,
    "exports.handler,module.exports.handler,handler =,async (event"
  ),
  contextPatterns: parseEnvArray(
    process.env.HIC_CONTEXT_PATTERNS,
    "context,event"
  ),
  eventPatterns: parseEnvArray(
    process.env.HIC_EVENT_PATTERNS,
    "APIGatewayProxyEvent,DynamoDBStreamEvent,SNSEvent,SQSEvent"
  ),
  lambdaDirPatterns: parseEnvArray(
    process.env.HIC_LAMBDA_DIR_PATTERNS,
    "lambda,function,src/"
  ),
  lambdaFilePatterns: parseEnvArray(
    process.env.HIC_LAMBDA_FILE_PATTERNS,
    "handler,worker,processor"
  ),
  testPatterns: parseEnvArray(process.env.HIC_TEST_PATTERNS, "test,spec"),
  maxConcurrentFiles: safeParseInt(
    process.env.HIC_MAX_CONCURRENT_FILES,
    10,
    1,
    100
  ),
  maxFileSize: safeParseInt(
    process.env.HIC_MAX_FILE_SIZE,
    1024 * 1024,
    1024,
    10 * 1024 * 1024
  ), // 1KB to 10MB
};

// Performance optimized Sets for O(1) lookups
const EXCLUDED_DIRS_SET = parseEnvSet(
  process.env.HIC_EXCLUDED_DIRS,
  "node_modules,tests,.git,dist,build"
);
const FILE_EXTENSIONS_SET = parseEnvSet(process.env.HIC_FILE_EXTENSIONS, ".js");

// Safe regex construction with fallback
const createServiceUsageRegex = () => {
  try {
    if (!CONFIG.awsServices || CONFIG.awsServices.length === 0) {
      return /\b(DynamoDB|SNS|SQS)\b/g; // fallback pattern
    }
    // Escape special regex characters in service names
    const escapedServices = CONFIG.awsServices.map((service) =>
      service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    return new RegExp(`\\b(${escapedServices.join("|")})\\b`, "g");
  } catch (error) {
    safeLog(
      "Warning: Failed to create service usage regex, using fallback",
      error.message
    );
    return /\b(DynamoDB|SNS|SQS)\b/g;
  }
};

// Pre-compiled regex patterns for performance (using configurable AWS services)
const DEPENDENCY_PATTERNS = {
  awsImports: /from ['"]@aws-sdk\/([^'"]+)['"]/g,
  awsRequires: /require\(['"]@aws-sdk\/([^'"]+)['"]\)/g,
  packageDeps: /['"]@aws-sdk\/([^'"]+)['"]\s*:\s*['"][^'"]+['"]/g,
  eventTypes: /(\w+Event)\b/g,
  serviceUsage: createServiceUsageRegex(),
};

// Reset regex patterns for reuse
const resetRegexPatterns = () => {
  Object.values(DEPENDENCY_PATTERNS).forEach((regex) => {
    if (regex.global) regex.lastIndex = 0;
  });
};

// Use safe path validation utility
const validatePath = safePath;

// Common input validation helpers
const validateStringParam = (param, paramName) => {
  if (!param || typeof param !== "string") {
    safeLog(`Warning: Invalid ${paramName} parameter`, typeof param);
    return false;
  }
  return true;
};

const validateArrayParam = (param, paramName) => {
  if (!Array.isArray(param)) {
    safeLog(`Warning: Invalid ${paramName} parameter`, typeof param);
    return false;
  }
  return true;
};

// Common array processing helper
const processStringArray = (arr, maxLength = 50) => {
  return arr
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim().substring(0, maxLength))
    .filter((item) => item.length > 0);
};

// Dynamic system discovery (like lambda-audit.js)
const getSystemDirectories = () => {
  if (process.env.HIC_SYSTEM_DIRS) {
    return process.env.HIC_SYSTEM_DIRS.split(",").map((dir) => dir.trim());
  }

  // Auto-discover systems by scanning workspace root
  const workspaceRoot = safePath(
    process.env.HIC_WORKSPACE_ROOT || process.cwd()
  );
  const excludedDirs = CONFIG.excludedDirs.concat(
    CONFIG.additionalExcludedDirs
  );

  try {
    if (!fs.existsSync(workspaceRoot)) {
      throw new Error(`Workspace root does not exist: ${workspaceRoot}`);
    }

    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !excludedDirs.includes(entry.name)
      )
      .map((entry) => entry.name);
  } catch (error) {
    safeLog(
      "Warning: Could not auto-discover systems, using fallback",
      error.message
    );
    return CONFIG.fallbackSystems;
  }
};

class LambdaPatternClassifier {
  constructor() {
    this.lambdaFunctions = [];
    this.patternCounts = {};
    this.systemAnalysis = {};
    this.discoveredPatterns = new Map(); // Pattern -> {functions: [], dependencies: Set()}
    this.systemDirs = getSystemDirectories();
  }

  // Analyze a single Lambda function file with security and size validation
  async analyzeLambdaFunction(filePath, systemName) {
    // Input validation
    if (!filePath || typeof filePath !== "string") {
      safeLog("Warning: Invalid filePath parameter", typeof filePath);
      return null;
    }
    if (!systemName || typeof systemName !== "string") {
      safeLog("Warning: Invalid systemName parameter", typeof systemName);
      return null;
    }

    try {
      const validatedPath = safePath(filePath);

      // Check file size before reading
      const stats = await fsPromises.stat(validatedPath);
      if (stats.size > CONFIG.maxFileSize) {
        safeLog(
          "Warning: File too large, skipping",
          `${validatedPath} (${stats.size} bytes)`
        );
        return null;
      }

      const content = await fsPromises.readFile(validatedPath, "utf8");
      const fileName = path.basename(validatedPath, ".js");

      const analysis = {
        system: systemName,
        function: fileName,
        path: validatedPath,
        patterns: [],
        dependencies: [],
        triggers: [],
        outputs: [],
        fileSize: stats.size,
      };

      // Pattern detection based on code content
      this.detectPatterns(content, analysis);

      return analysis;
    } catch (error) {
      safeLog(
        "Warning: Could not analyze file",
        `${filePath}: ${error.message}`
      );
      return null;
    }
  }

  // Extract actual dependencies and usage patterns from code with performance optimization
  detectPatterns(content, analysis) {
    // Input validation
    if (!content || typeof content !== "string") {
      safeLog("Warning: Invalid content parameter", typeof content);
      analysis.patterns.push("unknown-pattern");
      analysis.rawData = { dependencies: [], eventTypes: [], services: [] };
      return;
    }
    if (!analysis || typeof analysis !== "object") {
      safeLog("Warning: Invalid analysis parameter", typeof analysis);
      return;
    }

    try {
      // Reset regex patterns for this analysis
      resetRegexPatterns();

      // Extract AWS SDK dependencies
      const awsImports = this._extractMatches(
        content,
        DEPENDENCY_PATTERNS.awsImports,
        (m) => `@aws-sdk/${m[1]}`
      );
      const awsRequires = this._extractMatches(
        content,
        DEPENDENCY_PATTERNS.awsRequires,
        (m) => `@aws-sdk/${m[1]}`
      );

      // Combine all AWS dependencies
      const allDeps = [...new Set([...awsImports, ...awsRequires])];
      analysis.dependencies = allDeps;

      // Extract event types and service usage
      const eventTypes = this._extractMatches(
        content,
        DEPENDENCY_PATTERNS.eventTypes,
        (m) => m[1]
      );
      const services = this._extractMatches(
        content,
        DEPENDENCY_PATTERNS.serviceUsage,
        (m) => m[1]
      );

      // Generate pattern signature based on actual usage
      const patternSignature = this.generatePatternSignature(
        allDeps,
        eventTypes,
        services
      );
      analysis.patterns.push(patternSignature);

      // Store raw data for clustering
      analysis.rawData = {
        dependencies: allDeps,
        eventTypes,
        services,
      };
    } catch (error) {
      safeLog(
        "Warning: Pattern detection failed",
        `${analysis.path}: ${error.message}`
      );
      // Provide fallback pattern
      analysis.patterns.push("unknown-pattern");
      analysis.rawData = { dependencies: [], eventTypes: [], services: [] };
    }
  }

  // Helper: Extract matches from content
  _extractMatches(content, pattern, transform) {
    try {
      return [...content.matchAll(pattern)].map(transform);
    } catch (error) {
      safeLog("Warning: Pattern matching failed", error.message);
      return [];
    }
  }

  // Helper: Extract clean service signature
  _extractServiceSignature(services) {
    if (!validateArrayParam(services, "services")) return "";

    try {
      const validServices = processStringArray(services);
      return validServices.length > 0
        ? validServices.join("-").toLowerCase()
        : "";
    } catch (error) {
      safeLog("Warning: Service signature extraction failed", error.message);
      return "";
    }
  }

  // Helper: Extract clean event signature
  _extractEventSignature(eventTypes) {
    if (!validateArrayParam(eventTypes, "eventTypes")) return "";

    try {
      const validEvents = processStringArray(eventTypes);
      if (validEvents.length === 0) return "";

      // Bounds checking before array access
      const firstEvent = validEvents[0];
      if (!firstEvent || typeof firstEvent !== "string") return "";

      return firstEvent.replace(/Event$/i, "").toLowerCase();
    } catch (error) {
      safeLog("Warning: Event signature extraction failed", error.message);
      return "";
    }
  }

  // Helper: Determine pattern type based on available signatures
  _determinePatternType(serviceSignature, eventSignature) {
    // Input validation
    if (
      typeof serviceSignature !== "string" ||
      typeof eventSignature !== "string"
    ) {
      return "unknown-pattern";
    }
    // Pure compute - no services or events
    if (!serviceSignature && !eventSignature) {
      return "pure-compute";
    }

    // Event-to-service pattern (most specific)
    if (serviceSignature && eventSignature) {
      return `${eventSignature}-to-${serviceSignature}`;
    }

    // Service-only pattern
    if (serviceSignature) {
      return `${serviceSignature}-pattern`;
    }

    // Event-only pattern
    if (eventSignature) {
      return `${eventSignature}-handler`;
    }

    // Has dependencies but no clear service/event pattern
    return "other-pattern";
  }

  // Generate pattern signature from actual code analysis
  generatePatternSignature(dependencies, eventTypes, services) {
    // Input validation
    if (!Array.isArray(dependencies)) dependencies = [];
    if (!Array.isArray(eventTypes)) eventTypes = [];
    if (!Array.isArray(services)) services = [];

    try {
      const serviceSignature = this._extractServiceSignature(services);
      const eventSignature = this._extractEventSignature(eventTypes);

      const pattern = this._determinePatternType(
        serviceSignature,
        eventSignature
      );

      // Progressive disclosure for other-pattern cases
      if (pattern === "other-pattern" && dependencies.length > 0) {
        const depSummary = dependencies.slice(0, 3).join(", ");
        const suffix =
          dependencies.length > 3 ? ` (+${dependencies.length - 3} more)` : "";
        safeLog(
          "Other-pattern details",
          `Dependencies: ${depSummary}${suffix}`
        );
      }

      return pattern;
    } catch (error) {
      safeLog("Warning: Pattern signature generation failed", error.message);
      return "unknown-pattern";
    }
  }

  // Scan all systems for Lambda functions
  async scanAllSystems() {
    safeLog("🔍 Scanning all HIC systems for Lambda functions...\n");

    if (!Array.isArray(this.systemDirs) || this.systemDirs.length === 0) {
      safeLog("Warning: No system directories found");
      return;
    }

    await Promise.all(
      this.systemDirs.map(async (systemDir) => {
        if (!systemDir || typeof systemDir !== "string") {
          safeLog("Warning: Invalid system directory", typeof systemDir);
          return;
        }
        const systemPath = safePath(path.join(process.cwd(), systemDir));

        try {
          await fsPromises.access(systemPath);
        } catch {
          safeLog("⚠️  System directory not found", systemDir);
          return;
        }

        safeLog("📁 Analyzing system", systemDir);
        const systemFunctions = await this.scanSystemDirectory(
          systemPath,
          systemDir
        );

        this.systemAnalysis[systemDir] = {
          functionCount: systemFunctions.length,
          functions: systemFunctions,
        };

        safeLog("   Found Lambda functions", `${systemFunctions.length}\n`);
      })
    );
  }

  // Scan a single system directory with validation
  async scanSystemDirectory(systemPath, systemName) {
    // Input validation
    if (!systemPath || typeof systemPath !== "string") {
      safeLog("Warning: Invalid systemPath parameter", typeof systemPath);
      return [];
    }
    if (!systemName || typeof systemName !== "string") {
      safeLog("Warning: Invalid systemName parameter", typeof systemName);
      return [];
    }

    const functions = [];

    try {
      const validatedPath = safePath(systemPath);
      try {
        await fsPromises.access(validatedPath);
      } catch {
        safeLog("Warning: System directory does not exist", validatedPath);
        return functions;
      }

      await this.scanDirectoryRecursive(validatedPath, systemName, functions);
    } catch (error) {
      safeLog(
        "Warning: Error scanning system",
        `${systemName}: ${error.message}`
      );
    }

    return functions;
  }

  // Helper: Check if directory should be excluded
  _shouldExcludeDirectory(entryName) {
    // Input validation
    if (!entryName || typeof entryName !== "string") {
      return true; // Exclude invalid entries
    }

    try {
      return EXCLUDED_DIRS_SET.has(entryName) || entryName.startsWith(".");
    } catch (error) {
      safeLog("Warning: Directory exclusion check failed", error.message);
      return true; // Exclude on error for safety
    }
  }

  // Helper: Check if file should be processed
  _shouldProcessFile(fileName) {
    // Input validation
    if (!fileName || typeof fileName !== "string") {
      return false; // Don't process invalid entries
    }

    try {
      return Array.from(FILE_EXTENSIONS_SET).some((ext) =>
        fileName.endsWith(ext)
      );
    } catch (error) {
      safeLog("Warning: File processing check failed", error.message);
      return false; // Don't process on error for safety
    }
  }

  // Helper: Collect files and subdirectories from directory entries
  _collectDirectoryContents(dirPath, entries) {
    const filesToProcess = [];
    const subdirectories = [];
    const validatedBasePath = safePath(dirPath);

    for (const entry of entries) {
      try {
        // Validate entry name before path construction to prevent traversal
        if (
          !entry.name ||
          typeof entry.name !== "string" ||
          entry.name.includes("..")
        ) {
          safeLog("Warning: Suspicious entry name detected", entry.name);
          continue;
        }

        const fullPath = path.join(validatedBasePath, entry.name);

        if (entry.isDirectory() && !this._shouldExcludeDirectory(entry.name)) {
          subdirectories.push(fullPath);
        } else if (entry.isFile() && this._shouldProcessFile(entry.name)) {
          filesToProcess.push(fullPath);
        }
      } catch (error) {
        safeLog(
          "Warning: Error processing directory entry",
          `${entry.name}: ${error.message}`
        );
      }
    }

    return { filesToProcess, subdirectories };
  }

  // Helper: Process a single file and add to results
  async _processLambdaFile(filePath, systemName, functions) {
    // Input validation - basic type checks first
    if (!filePath || typeof filePath !== "string") {
      safeLog(
        "Warning: Invalid filePath in _processLambdaFile",
        typeof filePath
      );
      return;
    }
    if (!systemName || typeof systemName !== "string") {
      safeLog(
        "Warning: Invalid systemName in _processLambdaFile",
        typeof systemName
      );
      return;
    }
    if (!Array.isArray(functions)) {
      safeLog(
        "Warning: Invalid functions array in _processLambdaFile",
        typeof functions
      );
      return;
    }

    // Path validation - must be done before any file operations
    let validatedPath;
    try {
      validatedPath = safePath(filePath);
    } catch (error) {
      safeLog(
        "Warning: Invalid file path detected",
        `Path validation failed for: ${filePath}`
      );
      return;
    }

    // Process the validated path
    await this._addLambdaAnalysisIfValid(validatedPath, systemName, functions);
  }

  // Helper: Add Lambda analysis to results if file is valid Lambda function
  async _addLambdaAnalysisIfValid(validatedPath, systemName, functions) {
    try {
      if (!(await this.isLambdaFunction(validatedPath))) {
        return; // Not a Lambda function, skip
      }

      const analysis = await this.analyzeLambdaFunction(
        validatedPath,
        systemName
      );
      if (!analysis || typeof analysis !== "object") {
        safeLog(
          "Warning: Invalid analysis result",
          "Analysis failed or returned invalid data"
        );
        return;
      }

      // Validate internal state before modifying
      if (!Array.isArray(this.lambdaFunctions)) {
        safeLog(
          "Warning: Internal lambdaFunctions array corrupted",
          "Reinitializing"
        );
        this.lambdaFunctions = [];
      }

      functions.push(analysis);
      this.lambdaFunctions.push(analysis);
    } catch (error) {
      safeLog("Warning: Error processing Lambda file", error.message);
    }
  }

  // Helper: Process files in batches
  async _processBatchedFiles(filesToProcess, systemName, functions) {
    // Input validation
    if (!Array.isArray(filesToProcess)) {
      safeLog(
        "Warning: Invalid filesToProcess in _processBatchedFiles",
        typeof filesToProcess
      );
      return;
    }
    if (!systemName || typeof systemName !== "string") {
      safeLog(
        "Warning: Invalid systemName in _processBatchedFiles",
        typeof systemName
      );
      return;
    }
    if (!Array.isArray(functions)) {
      safeLog(
        "Warning: Invalid functions array in _processBatchedFiles",
        typeof functions
      );
      return;
    }

    try {
      for (
        let i = 0;
        i < filesToProcess.length;
        i += CONFIG.maxConcurrentFiles
      ) {
        const batch = filesToProcess.slice(i, i + CONFIG.maxConcurrentFiles);

        await Promise.all(
          batch.map(async (filePath) => {
            if (typeof filePath === "string") {
              await this._processLambdaFile(filePath, systemName, functions);
            } else {
              safeLog("Warning: Invalid filePath in batch", typeof filePath);
            }
          })
        );
      }
    } catch (error) {
      safeLog("Warning: Error in batch processing", error.message);
    }
  }

  // Recursively scan directory for Lambda functions with batched processing
  async scanDirectoryRecursive(dirPath, systemName, functions) {
    // Input validation
    if (!dirPath || typeof dirPath !== "string") {
      safeLog("Warning: Invalid dirPath parameter", typeof dirPath);
      return;
    }
    if (!systemName || typeof systemName !== "string") {
      safeLog("Warning: Invalid systemName parameter", typeof systemName);
      return;
    }
    if (!Array.isArray(functions)) {
      safeLog("Warning: Invalid functions parameter", typeof functions);
      return;
    }

    try {
      const validatedDirPath = safePath(dirPath);
      const entries = await fsPromises.readdir(validatedDirPath, {
        withFileTypes: true,
      });
      const { filesToProcess, subdirectories } = this._collectDirectoryContents(
        validatedDirPath,
        entries
      );

      // Process files in current directory
      await this._processBatchedFiles(filesToProcess, systemName, functions);

      // Recursively process subdirectories
      for (const subdir of subdirectories) {
        await this.scanDirectoryRecursive(subdir, systemName, functions);
      }
    } catch (error) {
      safeLog(
        "Warning: Error reading directory",
        `${dirPath}: ${error.message}`
      );
    }
  }

  // Determine if a JS file is a Lambda function with enhanced validation
  async isLambdaFunction(filePath) {
    if (!validateStringParam(filePath, "filePath")) return false;

    try {
      const validatedPath = safePath(filePath);

      // Check file size before reading
      const stats = await fsPromises.stat(validatedPath);
      if (stats.size > CONFIG.maxFileSize) {
        return false; // Skip oversized files
      }

      const content = await fsPromises.readFile(validatedPath, "utf8");

      // Skip test files first (performance optimization) - fix path traversal
      const normalizedPath = path.normalize(validatedPath);
      const workspaceRoot = path.normalize(process.cwd());
      if (!normalizedPath.startsWith(workspaceRoot)) {
        safeLog("Warning: Path traversal attempt detected", validatedPath);
        return false;
      }

      const baseName = path.basename(normalizedPath);
      const safeFileName = baseName.toLowerCase();
      const safeDirName = path.dirname(normalizedPath).toLowerCase();
      const isTestFile = CONFIG.testPatterns.some(
        (pattern) =>
          safeFileName.includes(pattern.toLowerCase()) ||
          safeDirName.includes(pattern.toLowerCase())
      );

      if (isTestFile) {
        return false;
      }

      // Lambda function indicators
      const hasHandler = CONFIG.handlerPatterns.some((pattern) =>
        content.includes(pattern)
      );
      const hasLambdaContext = CONFIG.contextPatterns.some((pattern) =>
        content.includes(pattern)
      );
      const hasAWSEvent = CONFIG.eventPatterns.some((pattern) =>
        content.includes(pattern)
      );
      const isInLambdaDir =
        CONFIG.lambdaDirPatterns.some((pattern) =>
          safeDirName.includes(pattern)
        ) ||
        CONFIG.lambdaFilePatterns.some((pattern) =>
          safeFileName.includes(pattern)
        );

      return hasHandler || hasLambdaContext || hasAWSEvent || isInLambdaDir;
    } catch (error) {
      safeLog(
        "Warning: Error checking Lambda function",
        `${filePath}: ${error.message}`
      );
      return false;
    }
  }

  // Generate pattern statistics
  generatePatternStats() {
    safeLog("📊 Generating pattern statistics...\n");

    if (
      !Array.isArray(this.lambdaFunctions) ||
      this.lambdaFunctions.length === 0
    ) {
      safeLog("Warning: No Lambda functions found for analysis");
      return;
    }

    // Count patterns and build pattern metadata
    for (const func of this.lambdaFunctions) {
      if (!func || !Array.isArray(func.patterns)) {
        safeLog("Warning: Invalid function data", func?.function || "unknown");
        continue;
      }
      for (const pattern of func.patterns) {
        this.patternCounts[pattern] = (this.patternCounts[pattern] || 0) + 1;

        // Build pattern metadata
        if (!this.discoveredPatterns.has(pattern)) {
          this.discoveredPatterns.set(pattern, {
            functions: [],
            dependencies: new Set(),
          });
        }

        const patternData = this.discoveredPatterns.get(pattern);
        patternData.functions.push(func);
        // Add dependencies (arrays)
        if (Array.isArray(func.dependencies)) {
          func.dependencies.forEach((dep) => patternData.dependencies.add(dep));
        }
      }
    }

    // Display results
    safeLog("🎯 Lambda Pattern Distribution:");
    safeLog("=".repeat(50));

    // Cache sorted entries for performance
    const sortedPatterns = Object.entries(this.patternCounts).sort(
      (a, b) => b[1] - a[1]
    );

    for (const [pattern, count] of sortedPatterns) {
      this._formatPatternDisplay(pattern, count);
    }
  }

  // Helper: Format pattern display for better maintainability
  _formatPatternDisplay(pattern, count) {
    const patternInfo = this.discoveredPatterns.get(pattern) || {
      dependencies: new Set(),
    };
    const deps = Array.from(patternInfo.dependencies);
    safeLog(
      `${pattern.padEnd(25)} | ${count.toString().padStart(3)} functions`
    );
    safeLog(`${"".padEnd(25)} | Dependencies: ${deps.join(", ") || "None"}`);
    safeLog("-".repeat(60));
  }

  // Generate layer specifications
  generateLayerSpecs() {
    safeLog("\n🏗️  Recommended Layer Architecture:");
    safeLog("=".repeat(60));

    if (!this.patternCounts || typeof this.patternCounts !== "object") {
      safeLog("Warning: No pattern counts available");
      return;
    }

    for (const [pattern, count] of Object.entries(this.patternCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      if (count === 0) continue;

      const patternInfo = this.discoveredPatterns.get(pattern) || {
        dependencies: new Set(),
      };
      const deps = Array.from(patternInfo.dependencies);
      const layerName = `hic-${pattern
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")}-layer`;

      safeLog(`\n📦 ${layerName}`);
      safeLog(`   Functions: ${count}`);
      safeLog(`   Pattern: ${pattern}`);
      safeLog(`   Dependencies: ${deps.join(", ") || "None"}`);
      safeLog(
        `   Recommended: ${
          count >= 2
            ? "YES - Multiple functions share this pattern"
            : "NO - Single function, inline dependencies"
        }`
      );
    }
  }

  // Generate detailed system breakdown
  generateSystemBreakdown() {
    safeLog("\n🏢 System-by-System Analysis:");
    safeLog("=".repeat(60));

    if (!this.systemAnalysis || typeof this.systemAnalysis !== "object") {
      safeLog("Warning: No system analysis data available");
      return;
    }

    for (const [systemName, systemData] of Object.entries(
      this.systemAnalysis
    )) {
      if (!systemData || !Array.isArray(systemData.functions)) {
        safeLog("Warning: Invalid system data", systemName);
        continue;
      }

      safeLog(`\n📁 ${systemName} (${systemData.functionCount} functions)`);

      const systemPatterns = {};
      for (const func of systemData.functions) {
        if (!func || !Array.isArray(func.patterns)) continue;

        for (const pattern of func.patterns) {
          systemPatterns[pattern] = (systemPatterns[pattern] || 0) + 1;
        }
      }

      // Cache sorted entries for performance
      const sortedSystemPatterns = Object.entries(systemPatterns).sort(
        (a, b) => b[1] - a[1]
      );
      for (const [pattern, count] of sortedSystemPatterns) {
        safeLog(`   ${pattern.padEnd(20)}: ${count} functions`);
      }
    }
  }

  // Run complete analysis
  async run() {
    safeLog("🚀 HIC Lambda Pattern Classification Analysis\n");

    try {
      await this.scanAllSystems();
      this.generatePatternStats();
      this.generateLayerSpecs();
      this.generateSystemBreakdown();

      safeLog(
        "\n✅ Analysis complete",
        `${this.lambdaFunctions.length} Lambda functions analyzed`
      );
      safeLog("📋 Recommended layers", Object.keys(this.patternCounts).length);
    } catch (error) {
      const analysisState = `${
        this.lambdaFunctions.length
      } functions analyzed, ${
        Object.keys(this.systemAnalysis).length
      } systems processed`;
      safeLog(
        "Error: Analysis failed in run()",
        `${error.message} - State: ${analysisState}`
      );

      // Attempt partial results if we have some data
      if (this.lambdaFunctions.length > 0) {
        safeLog("⚠️  Providing partial analysis results");
        this.generatePatternStats();
        this.generateLayerSpecs();
        this.generateSystemBreakdown();
      }
      throw error;
    }
  }
}

// Run analysis if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const classifier = new LambdaPatternClassifier();
  classifier.run().catch((error) => {
    safeLog("Error: Analysis failed", error.message);
    process.exit(1);
  });
}

export default LambdaPatternClassifier;
