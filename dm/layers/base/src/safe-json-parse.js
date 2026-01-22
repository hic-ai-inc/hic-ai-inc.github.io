/**
 * Safe JSON parsing with size, key-count, and depth protections.
 * ESM-compatible; exports named functions.
 */

const DEFAULT_MAX_BYTES = 1_000_000; // ~1MB text limit (tune as needed)
const DEFAULT_MAX_KEYS = 1000; // total keys visited during reviver
const DEFAULT_MAX_DEPTH = 10; // maximum nesting depth

/**
 * Throws on invalid/unsafe input.
 *
 * @param {string} jsonString - JSON text
 * @param {Object} [options]
 * @param {string} [options.source='unknown source'] - label for error messages
 * @param {number} [options.maxBytes=1_000_000]      - max input length (chars ~ bytes)
 * @param {number} [options.maxKeys=1000]            - max keys visited by reviver
 * @param {number} [options.maxDepth=10]             - max nesting depth after parse
 * @returns {any} parsed value
 */
export function safeJsonParse(
  jsonString,
  {
    source = "unknown source",
    maxBytes = DEFAULT_MAX_BYTES,
    maxKeys = DEFAULT_MAX_KEYS,
    maxDepth = DEFAULT_MAX_DEPTH,
  } = {}
) {
  // Validate input
  if (typeof jsonString !== "string" || jsonString.trim() === "") {
    throw new Error(`Invalid JSON input: ${source}`);
  }

  // Strip optional UTF-8 BOM
  let text =
    jsonString.charCodeAt(0) === 0xfeff ? jsonString.slice(1) : jsonString;

  // Enforce byte-size limit (UTF-8)
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error(`JSON input too large (> ${maxBytes} bytes): ${source}`);
  }

  // Enforce key-count limit
  let keyCount = 0;
  const reviver = (key, value) => {
    keyCount++;
    if (keyCount > maxKeys) {
      throw new Error(`JSON too complex: exceeded ${maxKeys} keys (${source})`);
    }
    return value;
  };

  let parsed;

  try {
    parsed = JSON.parse(text, reviver);
  } catch (err) {
    throw new Error(`JSON parse failed for ${source}: ${err.message}`);
  }

  // Post-parse depth check (fast for normal inputs)
  if (maxDepth != null) {
    const d = depthOf(parsed);
    if (d > maxDepth) {
      throw new Error(
        `JSON too deeply nested (depth ${d} > ${maxDepth}): ${source}`
      );
    }
  }

  return parsed;
}

/**
 * Non-throwing helper. Returns { ok: true, value } or { ok: false, error, code }.
 */
export function tryJsonParse(jsonString, options) {
  try {
    const value = safeJsonParse(jsonString, options);
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
    };
  }
}

// --- Internal function to calculate depth of JSON ---

function depthOf(value) {
  // Scalars & null => current depth 0
  if (value === null || typeof value !== "object") return 0;

  // Object/Array => 1 + max child depth
  if (Array.isArray(value)) {
    let max = 0;
    for (const v of value) max = Math.max(max, depthOf(v));
    return 1 + max;
  }

  let max = 0;
  for (const v of Object.values(value)) max = Math.max(max, depthOf(v));
  return 1 + max;
}
