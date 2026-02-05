/**
 * Test Loader - ESM Module Resolution for HIC Testing
 *
 * Intercepts Lambda layer imports during testing and redirects them to facade helpers.
 * Uses stable node:module.register() API (Node.js 20.6+) instead of experimental loaders.
 *
 * Usage:
 *   `node --loader ./dm/facade/utils/test-loader.js your-test-file.js`
 *
 * Supported redirections:
 *   `hic-base-layer` -> `../helpers/base.js`
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pathResolve, extname } from "node:path";
import fs from "node:fs";

// Constants
const HELPERS_DIR = "../helpers";
const HIC_BASE_LAYER_HELPER = "base.js";
const HIC_BASE_LAYER = "hic-base-layer";

const HERE = dirname(fileURLToPath(import.meta.url));

// Layer to facade helper mappings
const LAYER_MAPPINGS = {
  [HIC_BASE_LAYER]: pathResolve(HERE, HELPERS_DIR, HIC_BASE_LAYER_HELPER),
};

// Dynamic mapping: 'hic-{service}-layer' -> '../helpers/{service}.js'
function resolveDynamicLayer(specifier) {
  const m = /^hic-([a-z0-9-]+)-layer$/i.exec(specifier);
  if (!m) return null;

  const service = m[1]; // e.g. 'bedrock', 'dynamodb'
  const fileName = `${service}.js`; // matches your helpers naming convention
  const target = pathResolve(HERE, HELPERS_DIR, fileName);

  return fs.existsSync(target) ? target : null;
}

/**
 * ESM resolve hook - intercepts module resolution
 * @param {string} specifier - The module specifier being imported
 * @param {object} context - Resolution context
 * @param {function} nextResolve - Next resolver in chain
 * @returns {object} Resolution result with URL
 */
export async function resolve(specifier, context, nextResolve) {
  // Input validation
  if (typeof specifier !== "string") {
    throw new Error(
      `Invalid specifier type: expected string, got ${typeof specifier}`
    );
  }

  if (typeof nextResolve !== "function") {
    throw new Error("nextResolve must be a function");
  }

  try {
    // NEVER intercept real AWS SDK imports - facade helpers need these
    // Only intercept our custom layer aliases (hic-*-layer)
    if (specifier.startsWith("@aws-sdk/")) {
      return await nextResolve(specifier, context);
    }

    // Next.js ESM subpath compatibility for our test runner.
    // Node's ESM resolver may not resolve extensionless subpaths like `next/server`.
    if (specifier === "next/server") {
      return await nextResolve("next/server.js", context);
    }

    // Next.js-style alias support for PLG website imports (e.g. `@/lib/keygen`).
    // Next.js resolves this via jsconfig/tsconfig; the Node test runner needs help.
    if (specifier.startsWith("@/")) {
      const repoRoot = pathResolve(HERE, "../../..");
      const plgSrc = pathResolve(repoRoot, "plg-website", "src");
      const relative = specifier.slice(2); // drop "@/"

      let targetPath = pathResolve(plgSrc, relative);

      // ESM requires explicit extensions; match Next.js behavior by trying `.js`.
      if (!extname(targetPath) && fs.existsSync(`${targetPath}.js`)) {
        targetPath = `${targetPath}.js`;
      }

      return { url: pathToFileURL(targetPath).href, shortCircuit: true };
    }

    // Check if this is a layer import we need to redirect
    if (LAYER_MAPPINGS[specifier]) {
      const targetPath = LAYER_MAPPINGS[specifier];
      return {
        url: pathToFileURL(targetPath).href,
        shortCircuit: true,
      };
    }

    // Dynamic mapping for any 'hic-*-layer' that has a corresponding helper file
    const dynamicTarget = resolveDynamicLayer(specifier);
    if (dynamicTarget) {
      return { url: pathToFileURL(dynamicTarget).href, shortCircuit: true };
    }

    // Pass through to default resolver
    return await nextResolve(specifier, context);
  } catch (error) {
    throw new Error(
      `Module resolution failed for '${specifier}': ${error.message}`
    );
  }
}
