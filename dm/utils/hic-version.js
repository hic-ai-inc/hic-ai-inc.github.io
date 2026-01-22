#!/usr/bin/env node
/* eslint-disable no-console */

//
// HIC Lambda Layer Version Manager
//
// - Implements semantic versioning automatically based on file changes.
// - Walks the layer directory (excluding ignored dirs) and hashes all files.
// - Also hashes the shared versions.env (captures SDK pin changes).
// - Compares the hash with the previous version.manifest.json (if any).
// - If identical: prints {"decision":"noop", ...} and exits 0.
// - If different: decides bump kind (patch/minor/major) and writes a new manifest.
//   - Default heuristic: removed exports => major; added exports => minor; else patch.
//   - Manual override: --force-bump major|minor|patch or HIC_FORCE_BUMP env.
// - Always print a small JSON summary for the caller (Bash wrapper) to use in order to set HIC_LAYER_VERSION.

import fs from "fs";
import path from "path";
import crypto from "crypto";

// ---------- CLI ARG PARSING ----------

/**
 * Return the value that follows a flag, e.g., for "--name myName", return "myName".
 * If the flag is not present or has no value after it, return the default.
 */
function arg(flag, def = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def; // flag not present
  if (i + 1 >= process.argv.length) return def; // flag present but no following value
  return process.argv[i + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

// Inputs
const layerDir = path.resolve(arg("--layer-dir") || process.cwd());
const layerName = arg("--name") || path.basename(layerDir);
const manifestPath = path.resolve(
  arg("--manifest", path.join(layerDir, "version.manifest.json"))
);
const exportsFile = arg("--exports-file", null); // e.g., "src/index.ts" (optional)
const versionsEnv = path.resolve(
  arg("--versions-env", path.join(layerDir, "../versions.env"))
);
const forceBump = arg("--force-bump", process.env.HIC_FORCE_BUMP || null);

// ---------- UTILS ----------

// Safely read a JSON file and return the parsed object or null.
function safeReadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Decide if a directory name should be skipped during a walk. */
function isIgnoredDir(dirName) {
  return ["node_modules", "build", "dist", ".git"].includes(dirName);
}

/** Decide if a file should be skipped from hashing. */
function isIgnoredFile(fileName) {
  // skip generated version manifest itself
  if (fileName === "version.manifest.json") return true;
  // skip common cruft
  if (fileName === ".DS_Store" || fileName.toLowerCase() === "thumbs.db")
    return true;
  if (
    fileName.endsWith("~") ||
    fileName.endsWith(".swp") ||
    fileName.endsWith(".tmp")
  )
    return true;
  return false;
}

/**
 * Recursively collect all files under `root`, ignoring known noisy directories and files.
 * Returns absolute, sorted file paths.
 */
function listFiles(root) {
  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (isIgnoredDir(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (isIgnoredFile(entry.name)) continue;
        results.push(fullPath);
      }
    }
  }

  walk(root);
  results.sort(); // deterministic order matters for stable hashes
  return results;
}

/**
 * Produce a SHA-256 hex digest over an ordered list of files.
 * We hash both the file path (to catch renames) and the file contents.
 */
function sha256OfFiles(files) {
  const h = crypto.createHash("sha256");
  for (const filePath of files) {
    h.update(filePath); // include the path string
    h.update(fs.readFileSync(filePath)); // include the file contents
  }
  return h.digest("hex");
}

/** Bump a semver string by kind, defaulting first publish to 0.1.0 */
function bump(version, kind) {
  if (!version) return "0.1.0";
  const [M, m, p] = version.split(".").map((n) => parseInt(n, 10) || 0);
  if (kind === "major") return `${M + 1}.0.0`;
  if (kind === "minor") return `${M}.${m + 1}.0`;
  return `${M}.${m}.${p + 1}`;
}

/**
 * Create a simple "export inventory" by reading a file and keeping lines
 * that start with "export ". This detects added/removed exports without a
 * Javascript parser or external dependencies. Export diffs enable automated
 * determination of major/minor version bumps.
 */
function readExports(fileRelativeToLayerDir) {
  if (!fileRelativeToLayerDir) return null;
  const abs = path.resolve(layerDir, fileRelativeToLayerDir);
  if (!fs.existsSync(abs)) return null;

  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const exportsInventory = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("export "))
    .map((l) => l.replace(/\s+/g, " "));

  exportsInventory.sort(); // stable order for diffs/manifests
  return exportsInventory;
}

/** Compare two export inventories (arrays of strings) */
function diffExports(prev, next) {
  if (!prev || !next) return { added: [], removed: [] };
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const removed = [...prevSet].filter((x) => !nextSet.has(x));
  const added = [...nextSet].filter((x) => !prevSet.has(x));
  return { added, removed };
}

// ---------- MAIN LOGIC ----------

// 1) Collect files to hash.
//    Strategy: hash EVERYTHING under the layer directory except ignored dirs.
//    This naturally captures your authored files. We also explicitly add
//    the shared versions.env (outside layerDir) so SDK pin changes bump versions.
const filesToHash = listFiles(layerDir);
if (fs.existsSync(versionsEnv)) {
  filesToHash.push(versionsEnv);
}
const contentHash = sha256OfFiles(filesToHash);

// 2) Load prior manifest (if any)
const previous = safeReadJSON(manifestPath);

// 3) Fast path: if no force and hash is identical, it's a NOOP.
if (!forceBump && previous && previous.contentHash === contentHash) {
  const out = {
    decision: "noop",
    currentVersion: previous.version || null,
    nextVersion: null,
    contentHash,
    changed: false,
  };
  console.log(JSON.stringify(out));
  process.exit(0);
}

// 4) Otherwise, decide bump kind.
//    Default: patch. If exportsFile provided:
//      - removed exports => major
//      - only added exports => minor
let decision = "patch";
if (forceBump && ["major", "minor", "patch"].includes(forceBump)) {
  decision = forceBump;
} else {
  const prevExports = previous && previous.exports ? previous.exports : null;
  const nextExports = readExports(exportsFile);
  const e = diffExports(prevExports, nextExports);
  if (e.removed.length > 0) decision = "major";
  else if (e.added.length > 0) decision = "minor";
  // else patch
}

// 5) Compute next version and write manifest.
const currentVersion = (previous && previous.version) || null;
const nextVersion = bump(currentVersion, decision);

// For transparency, store the file list as relative paths where possible.
const inputsRelative = filesToHash.map((p) =>
  p.startsWith(layerDir) ? path.relative(layerDir, p) : p
);

const manifest = {
  layer: layerName,
  version: nextVersion,
  contentHash,
  exports: readExports(exportsFile),
  inputs: inputsRelative,
  builtAt: new Date().toISOString(),
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// 6) Print a compact summary for the caller (wrapper or CI)
console.log(
  JSON.stringify({
    decision,
    currentVersion,
    nextVersion,
    contentHash,
    changed: true,
  })
);
