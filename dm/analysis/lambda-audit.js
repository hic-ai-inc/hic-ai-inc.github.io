#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { safeLog, safeJsonParse, safePath } from "../layers/base/src/index.js";

class LambdaAuditor {
  constructor() {
    // Configuration from environment variables with defaults and path validation
    const rawWorkspaceRoot = process.env.HIC_WORKSPACE_ROOT || process.cwd();
    try {
      this.workspaceRoot = safePath(rawWorkspaceRoot, process.cwd());
    } catch (error) {
      safeLog("Error: Invalid workspace root path, using current directory", {
        error: error.message,
      });
      this.workspaceRoot = process.cwd();
    }

    this.config = this.loadConfig();

    // Pre-compile layer type regex for performance (after config is loaded)
    this.layerTypePattern = new RegExp(
      `Type: (${this.config.layerResourceTypes.join("|")})`
    );
    this.lambdaTypePattern = new RegExp(
      `Type: (${this.config.lambdaResourceTypes.join("|")})`
    );
    this.templateContentPattern = new RegExp(
      this.config.lambdaResourceTypes.join("|")
    );

    // Initialize results object
    this.results = {
      systems: {},
      summary: {
        totalLambdas: 0,
        systemsWithLayers: [],
        systemsWithoutLayers: [],
        commonDependencies: {},
      },
    };

    // Pre-compile pattern map for performance
    this.codeUriPatternMap = {
      "CodeUri:": (line) => line.split("CodeUri:")[1].trim(),
      "Code:": (line) => line.split("Code:")[1].trim(),
    };
  }

  loadConfig() {
    return {
      workspaceRoot: this.workspaceRoot,
      excludedDirectories: this.parseEnvArray(
        "HIC_EXCLUDED_DIRECTORIES",
        "shared,node_modules,.git,dist,build"
      ),
      infrastructureDir: process.env.HIC_INFRASTRUCTURE_DIR || "infrastructure",
      templateExtensions: this.parseEnvArray(
        "HIC_TEMPLATE_EXTENSIONS",
        ".yaml,.yml"
      ),
      rootTemplateName: process.env.HIC_ROOT_TEMPLATE_NAME || "template.yaml",
      packageFileName: process.env.HIC_PACKAGE_FILE_NAME || "package.json",
      lambdaResourceTypes: this.parseEnvArray(
        "HIC_LAMBDA_RESOURCE_TYPES",
        "AWS::Serverless::Function,AWS::Lambda::Function"
      ),
      layerResourceTypes: this.parseEnvArray(
        "HIC_LAYER_RESOURCE_TYPES",
        "AWS::Serverless::LayerVersion,AWS::Lambda::LayerVersion"
      ),
      codeUriPatterns: this.parseEnvArray(
        "HIC_CODE_URI_PATTERNS",
        "CodeUri:,Code:"
      ),
    };
  }

  parseEnvArray(envVar, defaultValue) {
    return (process.env[envVar] || defaultValue)
      .split(",")
      .map((item) => item.trim());
  }

  async auditWorkspace() {
    const systems = await this.findSystems(this.workspaceRoot);

    safeLog("🔍 Lambda Dependency Audit Starting...");

    // Process systems in batches to prevent IO overload
    await this.processBatched(systems, (system) => this.auditSystem(system));

    this.generateReport();
  }

  async findSystems(root) {
    const systems = [];

    try {
      // Validate root path to prevent traversal attacks
      const safeRoot = path.resolve(root);
      if (!safeRoot.startsWith(path.resolve(this.workspaceRoot))) {
        throw new Error("Root path outside workspace");
      }

      const entries = await fs.promises.readdir(safeRoot, {
        withFileTypes: true,
      });

      const validEntries = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !this.config.excludedDirectories.includes(entry.name)
      );

      const systemChecks = await this.processBatched(
        validEntries,
        async (entry) => {
          try {
            const systemPath = safePath(entry.name, safeRoot);
            const hasLambdas = await this.hasLambdas(systemPath);
            return hasLambdas ? { name: entry.name, path: systemPath } : null;
          } catch (pathError) {
            safeLog("Warning: Skipping invalid system path", {
              systemName: entry.name,
              error: pathError.message,
            });
            return null;
          }
        }
      );

      systems.push(...systemChecks.filter((system) => system !== null));
    } catch (error) {
      safeLog("Error reading workspace directory", {
        root,
        error: error.message,
      });
    }

    return systems;
  }

  // Helper method to check if file is a template
  isTemplateFile(filename) {
    return this.config.templateExtensions.some((ext) => filename.endsWith(ext));
  }

  // Helper method to check if content contains Lambda resources
  containsLambdaResources(content) {
    return this.templateContentPattern.test(content);
  }

  async hasLambdas(systemPath) {
    try {
      const templates = await this.findAllTemplates(systemPath);
      return templates.some((template) =>
        this.containsLambdaResources(template.content)
      );
    } catch (error) {
      return false;
    }
  }

  async auditSystem(system) {
    safeLog("📦 Auditing system", system.name);

    const systemData = {
      name: system.name,
      path: system.path,
      lambdas: [],
      layers: [],
      packageJson: null,
      templates: [],
    };

    // Find all templates
    systemData.templates = await this.findAllTemplates(system.path);

    // Read package.json
    systemData.packageJson = await this.loadSystemPackageJson(system);

    // Find Lambda functions from all templates
    const templateResults = await Promise.all(
      systemData.templates.map(async (template) => ({
        lambdas: await this.findLambdaFunctions(system.path, template),
        layers: this.findLayers(template),
      }))
    );

    templateResults.forEach((result) => {
      systemData.lambdas.push(...result.lambdas);
      systemData.layers.push(...result.layers);
    });

    this.results.systems[system.name] = systemData;
    this.results.summary.totalLambdas += systemData.lambdas.length;

    if (systemData.layers.length > 0) {
      this.results.summary.systemsWithLayers.push(system.name);
    } else {
      this.results.summary.systemsWithoutLayers.push(system.name);
    }

    this.analyzeDependencies(systemData);
  }

  async loadSystemPackageJson(system) {
    try {
      const packagePath = safePath(this.config.packageFileName, system.path);
      const packageContent = await fs.promises.readFile(packagePath, "utf8");
      return safeJsonParse(packageContent, {
        source: `${system.name}/package.json`,
      });
    } catch (error) {
      // Package.json doesn't exist or invalid path - this is normal
      return null;
    }
  }

  async findAllTemplates(systemPath) {
    const templates = [];

    await Promise.all([
      this.processRootTemplate(systemPath, templates),
      this.processInfrastructureDirectory(systemPath, templates),
    ]);

    return templates;
  }

  async processRootTemplate(systemPath, templates) {
    try {
      const rootTemplate = safePath(this.config.rootTemplateName, systemPath);
      const template = await this.parseTemplate(rootTemplate);
      if (template) templates.push(template);
    } catch (error) {
      // Root template doesn't exist or invalid path - this is normal
      safeLog("Debug: Root template not found", {
        systemPath,
        error: error.message,
      });
    }
  }

  async processInfrastructureDirectory(systemPath, templates) {
    try {
      const infraPath = safePath(this.config.infrastructureDir, systemPath);
      const files = await fs.promises.readdir(infraPath);

      const templateFiles = files.filter((file) => this.isTemplateFile(file));
      const templateResults = await Promise.allSettled(
        templateFiles.map(async (file) => {
          try {
            const templatePath = safePath(file, infraPath);
            return await this.parseTemplate(templatePath);
          } catch (pathError) {
            safeLog("Warning: Skipping invalid template path", {
              file,
              error: pathError.message,
            });
            return null;
          }
        })
      );

      templateResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          templates.push(result.value);
        }
      });
    } catch (error) {
      // Infrastructure directory doesn't exist or invalid path - this is normal
      safeLog("Debug: Infrastructure directory not found", {
        systemPath,
        error: error.message,
      });
    }
  }

  async parseTemplate(templatePath) {
    try {
      // Validate path to prevent traversal attacks
      const safePath = path.resolve(templatePath);
      if (!safePath.startsWith(path.resolve(this.workspaceRoot))) {
        throw new Error("Path outside workspace root");
      }

      const content = await fs.promises.readFile(safePath, "utf8");
      return { content, path: safePath, name: path.basename(safePath) };
    } catch (error) {
      safeLog("Error: Could not parse template", {
        templatePath,
        error: error.message,
        stack: error.stack,
      });
      return null;
    }
  }

  // Helper method to find resource name from previous lines
  findResourceName(lines, startIndex) {
    if (
      !Array.isArray(lines) ||
      typeof startIndex !== "number" ||
      startIndex < 0
    ) {
      return null;
    }

    for (let i = startIndex - 1; i >= 0; i--) {
      if (!lines[i]) continue;

      const prevLine = lines[i].trim();
      if (!prevLine || prevLine.startsWith("#")) continue;
      if (prevLine.endsWith(":")) {
        return prevLine.replace(":", "");
      }
      // Stop at blank lines or YAML structure markers
      if (
        prevLine === "" ||
        prevLine.startsWith("Resources:") ||
        prevLine.startsWith("Parameters:")
      ) {
        break;
      }
    }
    return null;
  }

  // Helper method to extract CodeUri from line
  extractCodeUri(line) {
    const matchedPattern = this.config.codeUriPatterns.find((pattern) =>
      line.includes(pattern)
    );
    return matchedPattern && this.codeUriPatternMap[matchedPattern]
      ? this.codeUriPatternMap[matchedPattern](line)
      : "inline/s3";
  }

  // Helper method to load Lambda package.json
  async loadLambdaPackageJson(systemPath, codeUri) {
    if (!codeUri || codeUri === "inline/s3") return null;

    try {
      const lambdaPath = safePath(codeUri, systemPath);
      const lambdaPackagePath = safePath(
        this.config.packageFileName,
        lambdaPath
      );

      const packageContent = await fs.promises.readFile(
        lambdaPackagePath,
        "utf8"
      );
      return safeJsonParse(packageContent, {
        source: path.join(systemPath, codeUri, "package.json"),
      });
    } catch (error) {
      // Package.json doesn't exist or path invalid - this is normal
      return null;
    }
  }

  async findLambdaFunctions(systemPath, template) {
    const lambdas = [];
    if (!template) return lambdas;

    const lines = template.content.split("\n");
    const lambdaDefinitions = this.collectLambdaDefinitions(lines, template);

    // Process CodeUri patterns in batches to prevent IO overload
    const processedLambdas = await this.processBatched(
      lambdaDefinitions,
      async (lambda) => {
        if (lambda.codeUri) {
          lambda.packageJson = await this.loadLambdaPackageJson(
            systemPath,
            lambda.codeUri
          );
        }
        return lambda;
      }
    );

    return processedLambdas;
  }

  collectLambdaDefinitions(lines, template) {
    const lambdas = [];
    let currentFunction = null;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // Check for Lambda resource type
      const matchedType = this.config.lambdaResourceTypes.find((type) =>
        line.includes(`Type: ${type}`)
      );
      if (matchedType) {
        const resourceName = this.findResourceName(lines, index);
        if (resourceName) {
          currentFunction = {
            name: resourceName,
            type: matchedType,
            codeUri: null,
            layers: [],
            packageJson: null,
            template: template.name || "unknown",
          };
        }
      }

      // Check for CodeUri pattern
      if (
        currentFunction &&
        this.config.codeUriPatterns.some((pattern) => line.includes(pattern))
      ) {
        currentFunction.codeUri = this.extractCodeUri(line);
        lambdas.push(currentFunction);
        currentFunction = null;
      }
    }

    // Handle function without explicit CodeUri
    if (currentFunction) {
      currentFunction.codeUri = "not-specified";
      lambdas.push(currentFunction);
    }

    return lambdas;
  }

  findLayers(template) {
    const layers = [];
    if (!template) return layers;

    const lines = template.content.split("\n");

    for (let index = 0; index < lines.length; index++) {
      const match = lines[index].match(this.layerTypePattern);
      if (match) {
        const resourceName = this.findResourceName(lines, index);
        if (resourceName) {
          layers.push({
            name: resourceName,
            type: match[1],
            template: template.name,
          });
        }
      }
    }

    return layers;
  }

  // Helper method to add dependency usage
  addDependencyUsage(dep, usageInfo) {
    if (!this.results.summary.commonDependencies[dep]) {
      this.results.summary.commonDependencies[dep] = [];
    }
    this.results.summary.commonDependencies[dep].push(usageInfo);
  }

  analyzeDependencies(systemData) {
    // Analyze system-level dependencies
    if (systemData.packageJson && systemData.packageJson.dependencies) {
      Object.entries(systemData.packageJson.dependencies).forEach(
        ([dep, version]) => {
          this.addDependencyUsage(dep, {
            system: systemData.name,
            level: "system",
            version,
          });
        }
      );
    }

    // Analyze Lambda-level dependencies
    systemData.lambdas.forEach((lambda) => {
      try {
        if (lambda.packageJson && lambda.packageJson.dependencies) {
          Object.entries(lambda.packageJson.dependencies).forEach(
            ([dep, version]) => {
              this.addDependencyUsage(dep, {
                system: systemData.name,
                lambda: lambda.name,
                level: "lambda",
                version,
              });
            }
          );
        }
      } catch (error) {
        safeLog("Warning: Error processing Lambda dependencies", {
          lambda: lambda.name,
          error: error.message,
        });
      }
    });
  }

  generateReport() {
    safeLog("\n" + "=".repeat(80));
    safeLog("📊 LAMBDA DEPENDENCY AUDIT REPORT");
    safeLog("=".repeat(80));

    this.generateSummary();
    this.generateSystemBreakdown();
    this.generateDependencyAnalysis();
    this.generateRecommendations();

    safeLog("\n" + "=".repeat(80));
  }

  generateSummary() {
    safeLog("\n🎯 SUMMARY:");
    safeLog("   Total Systems", Object.keys(this.results.systems).length);
    safeLog("   Total Lambda Functions", this.results.summary.totalLambdas);
    safeLog(
      "   Systems WITH Layers",
      this.results.summary.systemsWithLayers.length
    );
    safeLog(
      "   Systems WITHOUT Layers",
      this.results.summary.systemsWithoutLayers.length
    );

    safeLog("\n✅ SYSTEMS WITH LAYERS:");
    this.results.summary.systemsWithLayers.forEach((system) => {
      const systemData = this.results.systems[system];
      safeLog("   System with layers", {
        system,
        lambdas: systemData.lambdas.length,
        layers: systemData.layers.length,
      });
    });

    safeLog("\n❌ SYSTEMS WITHOUT LAYERS:");
    this.results.summary.systemsWithoutLayers.forEach((system) => {
      const systemData = this.results.systems[system];
      safeLog("   System without layers", {
        system,
        lambdas: systemData.lambdas.length,
        layers: 0,
      });
    });
  }

  generateSystemBreakdown() {
    safeLog("\n📦 DETAILED SYSTEM BREAKDOWN:");
    Object.values(this.results.systems).forEach((system) => {
      safeLog("\n   System details", {
        name: system.name.toUpperCase(),
        path: system.path,
        templates: system.templates.length,
        lambdas: system.lambdas.length,
        layers: system.layers.length,
      });

      if (system.templates.length > 0) {
        safeLog("     Templates:");
        system.templates.forEach((template) => {
          safeLog("       📄 Template", template.name);
        });
      }

      if (system.lambdas.length > 0) {
        safeLog("     Lambda Functions:");
        system.lambdas.forEach((lambda) => {
          const hasOwnPackage = lambda.packageJson ? "📦" : "❌";
          safeLog("       Lambda function", {
            icon: hasOwnPackage,
            name: lambda.name,
            codeUri: lambda.codeUri || "no CodeUri",
            template: lambda.template,
          });
        });
      }

      if (system.layers.length > 0) {
        safeLog("     Layers:");
        system.layers.forEach((layer) => {
          safeLog("       🔧 Layer", {
            name: layer.name,
            template: layer.template,
          });
        });
      }
    });
  }

  getDuplicatedDependencies(limit = null) {
    const filtered = Object.entries(
      this.results.summary.commonDependencies
    ).filter(([dep, usages]) => usages.length > 1);

    if (limit) {
      // Partial sort for better performance when only top N needed
      return filtered.sort((a, b) => b[1].length - a[1].length).slice(0, limit);
    }

    return filtered.sort((a, b) => b[1].length - a[1].length);
  }

  generateDependencyAnalysis() {
    safeLog("\n🔍 DEPENDENCY DUPLICATION ANALYSIS:");
    const duplicatedDeps = this.getDuplicatedDependencies();

    if (duplicatedDeps.length > 0) {
      safeLog("   Found duplicated dependencies", duplicatedDeps.length);
      this.getDuplicatedDependencies(10).forEach(([dep, usages]) => {
        safeLog("     Dependency usage", {
          dependency: dep,
          usageCount: usages.length,
        });
        usages.forEach((usage) => {
          const location = usage.lambda
            ? `${usage.system}/${usage.lambda}`
            : usage.system;
          safeLog("       Usage location", {
            location,
            version: usage.version,
          });
        });
      });
    } else {
      safeLog("   No duplicated dependencies found.");
    }
  }

  generateRecommendations() {
    safeLog("\n💡 RECOMMENDATIONS:");

    // Initialize recommendations array
    this.results.recommendations = [];

    if (this.results.summary.systemsWithoutLayers.length > 0) {
      const rec1 = `Implement Lambda layers for systems: ${this.results.summary.systemsWithoutLayers.join(
        ", "
      )}`;
      this.results.recommendations.push(rec1);
      safeLog("   1.", rec1);
    }

    const duplicatedDeps = this.getDuplicatedDependencies();
    if (duplicatedDeps.length > 0) {
      const rec2 = `Create shared layers for common dependencies: ${duplicatedDeps
        .slice(0, 5)
        .map(([dep]) => dep)
        .join(", ")}`;
      this.results.recommendations.push(rec2);
      safeLog("   2.", rec2);
    }

    this.results.recommendations.push(
      "Standardize dependency versions across systems"
    );
    this.results.recommendations.push(
      "Consider workspace-level dependency management"
    );
    safeLog("   3. Standardize dependency versions across systems");
    safeLog("   4. Consider workspace-level dependency management");
  }

  // Helper method for batched processing to prevent IO overload
  async processBatched(items, processor, batchSize = 10) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
    }
    return results;
  }
}

// Run the audit
const auditor = new LambdaAuditor();
auditor
  .auditWorkspace()
  .then(() => {
    // Output summary for tests to capture
    const summary = {
      totalSystems: Object.keys(auditor.results.systems).length,
      totalFunctions: auditor.results.totalFunctions,
      recommendations: auditor.results.recommendations || [],
    };
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    safeLog("Audit failed", { error: error.message });
    process.exit(1);
  });
