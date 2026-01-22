/**
 * Safe path validation utility to prevent CWE-22/23 path traversal attacks
 * Ensures paths stay within allowed boundaries.
 */

import { resolve, relative, isAbsolute, sep } from "node:path";
import { realpathSync } from "node:fs";

export function safePath(inputPath, basePath = process.cwd()) {
  if (inputPath == null)
    throw new Error("Path input cannot be null or undefined");

  if (typeof inputPath !== "string")
    throw new Error(`Path input must be a string, got ${typeof inputPath}`);

  if (inputPath.trim() === "") throw new Error("Path input cannot be empty");

  if (typeof basePath !== "string")
    throw new Error(`Base path must be a string, got ${typeof basePath}`);

  if (inputPath.length > 4096)
    throw new Error("Path input exceeds maximum length (4096 characters)");

  // Check for null bytes (potential injection attack)
  if (inputPath.includes("\0"))
    throw new Error("Path input contains null bytes");

  // Decode URL encoding to prevent bypassing security checks
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(inputPath);
  } catch (err) {
    // If decoding fails, use original path
    decodedPath = inputPath;
  }

  // Normalize path separators for cross-platform compatibility
  // Convert Windows backslashes to forward slashes before processing
  decodedPath = decodedPath.replace(/\\/g, "/");

  try {
    // Normalize and collapse symlinks in the base
    const normalizedBase = resolve(basePath);
    const baseReal = realpathSync(normalizedBase);

    // Resolve the target against the real base
    const target = resolve(baseReal, decodedPath);

    // Also resolve symlinks in the target path if they exist
    let targetReal;
    try {
      targetReal = realpathSync(target);
    } catch (err) {
      // If target doesn't exist or can't be resolved, use the logical path
      // This allows checking non-existent files while still catching symlink attacks
      targetReal = target;
    }

    // Compute a relative path; if it starts with '..' or is absolute, it's outside base
    const rel = relative(baseReal, targetReal);
    const outside =
      rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel);

    if (outside) {
      throw new Error(`Path outside allowed directory: ${inputPath}`);
    }

    return target;
  } catch (err) {
    // If we get an ENOENT, it's likely the base path was invalid
    if (err.code === "ENOENT")
      throw new Error(`Invalid base path: ${basePath}`);

    // Preserve our security error messages; wrap everything else
    if (String(err.message).startsWith("Path outside allowed directory"))
      throw err;

    throw new Error(`Path validation failed: ${err.message}`);
  }
}
