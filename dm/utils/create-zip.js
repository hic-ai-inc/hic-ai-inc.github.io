/**
 * Create zip file utility for Lambda function packaging
 * Supports both single files and directories
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Escape for single-quoted PowerShell literals: 'foo' -> 'foo'' */
function psSingleQuoted(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Build the exact PowerShell command (pure; easy to unit-test) */
export function buildPsCommand(
  sourceDir,
  outputFile,
  { shell = "powershell" } = {}
) {
  const absSrc = path.resolve(sourceDir);
  const parent = path.dirname(absSrc);
  const base = path.basename(absSrc);
  const srcPath = parent + path.sep + base; // ensures "...\parent\base"
  const absOut = path.resolve(outputFile);

  return (
    `${shell} -NoLogo -NoProfile -NonInteractive -Command ` +
    `"Compress-Archive -Path ${psSingleQuoted(srcPath)} ` +
    `-DestinationPath ${psSingleQuoted(absOut)} -Force -ErrorAction Stop"`
  );
}

/**
 * Create zip file utility for Lambda function packaging.
 * Supports both single files and directories.
 * Accepts a DI seam for testability: { runner, shell }.
 */
export function createZip(
  sourceDir,
  outputFile,
  { runner = execSync, shell, dryRun = false, quiet = false } = {}
) {
  try {
    // Validate source exists
    const stat = fs.statSync(sourceDir);
    if (!stat.isDirectory() && !stat.isFile()) {
      throw new Error("Source must be a file or directory");
    }

    const command = buildPsCommand(sourceDir, outputFile, { shell });

    if (dryRun) {
      if (!quiet) console.log(`🔍 DRY RUN: Would execute: ${command}`);
      return outputFile;
    }

    runner(command, { stdio: "inherit" });
    if (!quiet) console.log(`✅ Created ${outputFile}`);

    return outputFile;
  } catch (error) {
    // Re-throw with a stable prefix for assertions
    const err = error instanceof Error ? error : new Error(String(error));
    err.message = `create-zip: ${err.message}`;
    throw err;
  }
}

/** Small CLI wrapper so the library stays testable. */
export function runCli(argv = process.argv.slice(2), options = {}) {
  const {
    runner = execSync,
    log = console.log,
    error = console.error,
    exit = process.exit,
  } = options;

  const [sourceDir, outputFile, ...rest] = argv;
  if (!sourceDir || !outputFile) {
    error(
      "Usage: node create-zip.js <source-directory> <output-file.zip> [--dry-run]"
    );
    return exit(1);
  }
  const dryRun = rest.includes("--dry-run");

  try {
    createZip(sourceDir, outputFile, { runner, dryRun });
    if (dryRun) log("✅ DRY RUN OK");
    return exit(0);
  } catch (e) {
    error(e.message);
    return exit(1);
  }
}

// Robust ESM "main module" check (Windows-safe)
const isMain = (() => {
  try {
    if (!process.argv[1]) return false;
    const scriptPath = path.resolve(process.argv[1]);
    const modulePath = path.resolve(fileURLToPath(import.meta.url));
    return scriptPath === modulePath;
  } catch {
    return false;
  }
})();

if (isMain) runCli();

export default createZip;
