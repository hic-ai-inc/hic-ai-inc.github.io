import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "../../../../../facade/test-helpers/index.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  readlinkSync,
} from "node:fs";

// Import the utility we're testing
import { safePath } from "../../../../../layers/base/src/safe-path.js";

describe("safe-path.js - HIC Base Layer Path Traversal Protection", () => {
  let testDir;
  let safeDir;
  let originalCwd;

  beforeEach(() => {
    originalCwd = process.cwd();

    // Create a temporary directory for testing
    testDir = join(
      tmpdir(),
      `safe-path-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    mkdirSync(testDir, { recursive: true });

    // Create a safe directory within the test directory
    safeDir = join(testDir, "safe");
    mkdirSync(safeDir, { recursive: true });

    // Create some test files and directories
    mkdirSync(join(safeDir, "subdir"), { recursive: true });
    writeFileSync(join(safeDir, "file.txt"), "test content");
    writeFileSync(join(safeDir, "subdir", "nested.txt"), "nested content");

    // Create directory outside safe zone for testing traversal
    const unsafeDir = join(testDir, "unsafe");
    mkdirSync(unsafeDir, { recursive: true });
    writeFileSync(join(unsafeDir, "sensitive.txt"), "sensitive data");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Input Validation", () => {
    test("throws error for null input path", () => {
      expect(() => {
        safePath(null, safeDir);
      }).toThrow("Path input cannot be null or undefined");
    });

    test("throws error for undefined input path", () => {
      expect(() => {
        safePath(undefined, safeDir);
      }).toThrow("Path input cannot be null or undefined");
    });

    test("throws error for non-string input path", () => {
      expect(() => {
        safePath(123, safeDir);
      }).toThrow("Path input must be a string, got number");
    });

    test("throws error for empty string input path", () => {
      expect(() => {
        safePath("", safeDir);
      }).toThrow("Path input cannot be empty");
    });

    test("throws error for whitespace-only input path", () => {
      expect(() => {
        safePath("   ", safeDir);
      }).toThrow("Path input cannot be empty");
    });

    test("throws error for non-string base path", () => {
      expect(() => {
        safePath("test.txt", 123);
      }).toThrow("Base path must be a string, got number");
    });

    test("throws error for excessively long input path", () => {
      const longPath = "a".repeat(4097);
      expect(() => {
        safePath(longPath, safeDir);
      }).toThrow("Path input exceeds maximum length (4096 characters)");
    });

    test("accepts path at maximum length (4096 characters)", () => {
      const maxPath = "a".repeat(4096);
      // This may throw due to invalid path, but not due to length restriction
      expect(() => {
        safePath(maxPath, safeDir);
      }).not.toThrow(/exceeds maximum length/);
    });
  });

  describe("Path Traversal Prevention", () => {
    test("blocks direct parent directory traversal", () => {
      expect(() => {
        safePath("..", safeDir);
      }).toThrow("Path outside allowed directory: ..");
    });

    test("blocks parent directory traversal with additional path", () => {
      expect(() => {
        safePath("../unsafe/sensitive.txt", safeDir);
      }).toThrow("Path outside allowed directory: ../unsafe/sensitive.txt");
    });

    test("blocks multiple parent directory traversals", () => {
      expect(() => {
        safePath("../../etc/passwd", safeDir);
      }).toThrow("Path outside allowed directory: ../../etc/passwd");
    });

    test("blocks parent traversal with mixed separators", () => {
      expect(() => {
        safePath("../unsafe\\sensitive.txt", safeDir);
      }).toThrow("Path outside allowed directory:");
    });

    test("blocks absolute paths that escape base directory", () => {
      const absolutePath = join(testDir, "unsafe", "sensitive.txt");
      expect(() => {
        safePath(absolutePath, safeDir);
      }).toThrow("Path outside allowed directory:");
    });

    test("blocks complex traversal attempts", () => {
      expect(() => {
        safePath("subdir/../../unsafe/sensitive.txt", safeDir);
      }).toThrow("Path outside allowed directory:");
    });

    test("blocks traversal through URL encoding", () => {
      expect(() => {
        safePath("..%2Funsafe%2Fsensitive.txt", safeDir);
      }).toThrow("Path outside allowed directory:");
    });

    test("blocks null byte injection", () => {
      expect(() => {
        safePath("file.txt\0../unsafe/sensitive.txt", safeDir);
      }).toThrow("Path input contains null bytes");
    });
  });

  describe("Safe Path Resolution", () => {
    test("allows simple filename in base directory", () => {
      const result = safePath("file.txt", safeDir);
      expect(result).toBe(join(safeDir, "file.txt"));
    });

    test("allows relative path to subdirectory", () => {
      const result = safePath("subdir/nested.txt", safeDir);
      expect(result).toBe(join(safeDir, "subdir", "nested.txt"));
    });

    test("allows path with current directory reference", () => {
      const result = safePath("./file.txt", safeDir);
      expect(result).toBe(join(safeDir, "file.txt"));
    });

    test("allows complex relative path within bounds", () => {
      const result = safePath("subdir/../file.txt", safeDir);
      expect(result).toBe(join(safeDir, "file.txt"));
    });

    test("normalizes path separators", () => {
      const result = safePath("subdir\\nested.txt", safeDir);
      expect(result).toBe(join(safeDir, "subdir", "nested.txt"));
    });

    test("handles mixed path separators", () => {
      const result = safePath("subdir/./nested.txt", safeDir);
      expect(result).toBe(join(safeDir, "subdir", "nested.txt"));
    });
  });

  describe("Base Path Handling", () => {
    test("uses current working directory as default base", () => {
      process.chdir(safeDir);
      const result = safePath("file.txt");
      expect(result).toBe(join(safeDir, "file.txt"));
    });

    test("resolves relative base paths", () => {
      process.chdir(testDir);
      const result = safePath("file.txt", "./safe");
      expect(result).toBe(join(safeDir, "file.txt"));
    });

    test("handles absolute base paths", () => {
      const result = safePath("file.txt", safeDir);
      expect(result).toBe(join(safeDir, "file.txt"));
    });

    test("throws error for invalid base path", () => {
      const invalidBasePath = join(testDir, "nonexistent");
      expect(() => {
        safePath("file.txt", invalidBasePath);
      }).toThrow("Invalid base path:");
    });
  });

  describe("Symlink Handling", () => {
    beforeEach(() => {
      // Create test files and symlinks
      writeFileSync(join(safeDir, "target.txt"), "target content");
      writeFileSync(join(testDir, "outside-target.txt"), "outside content");

      try {
        // Create safe symlink (points within safe directory)
        symlinkSync(
          join(safeDir, "target.txt"),
          join(safeDir, "safe-link.txt")
        );

        // Create unsafe symlink (points outside safe directory)
        symlinkSync(
          join(testDir, "outside-target.txt"),
          join(safeDir, "unsafe-link.txt")
        );
      } catch (error) {
        // Skip symlink tests on systems that don't support them
        if (error.code === "EPERM" || error.code === "ENOENT") {
          return;
        }
        throw error;
      }
    });

    test("allows access to safe symlinks", () => {
      if (!existsSync(join(safeDir, "safe-link.txt"))) {
        console.log("Skipping symlink test - symlink creation failed");
        return;
      }

      const result = safePath("safe-link.txt", safeDir);
      expect(result).toBe(join(safeDir, "safe-link.txt"));
    });

    test("blocks access through unsafe symlinks", () => {
      if (!existsSync(join(safeDir, "unsafe-link.txt"))) {
        // If the preset symlink failed, try creating one with relative path
        try {
          symlinkSync(
            "../outside-target.txt",
            join(safeDir, "temp-unsafe-link.txt")
          );
          expect(() => {
            safePath("temp-unsafe-link.txt", safeDir);
          }).toThrow("Path outside allowed directory:");
        } catch (error) {
          // If symlink creation fails completely, skip test
          console.log(
            "Skipping symlink test - platform doesn't support symlinks"
          );
        }
        return;
      }

      // Verify the unsafe symlink exists and points outside
      const unsafeLinkPath = join(safeDir, "unsafe-link.txt");
      const linkTarget = readlinkSync(unsafeLinkPath);
      console.log(`Unsafe symlink target: ${linkTarget}`);

      expect(() => {
        safePath("unsafe-link.txt", safeDir);
      }).toThrow("Path outside allowed directory:");
    });
  });

  describe("Edge Cases", () => {
    test("handles paths with unicode characters", () => {
      const unicodePath = "файл.txt"; // Russian filename
      const result = safePath(unicodePath, safeDir);
      expect(result).toBe(join(safeDir, unicodePath));
    });

    test("handles paths with spaces", () => {
      const spacePath = "file with spaces.txt";
      const result = safePath(spacePath, safeDir);
      expect(result).toBe(join(safeDir, spacePath));
    });

    test("handles paths with special characters", () => {
      const specialPath = "file-with_special.chars@2024.txt";
      const result = safePath(specialPath, safeDir);
      expect(result).toBe(join(safeDir, specialPath));
    });

    test("handles very long but valid relative paths", () => {
      // Create nested directory structure
      let deepDir = safeDir;
      const segments = [];
      for (let i = 0; i < 50; i++) {
        const segment = `level${i}`;
        segments.push(segment);
        deepDir = join(deepDir, segment);
        mkdirSync(deepDir, { recursive: true });
      }

      const longPath = segments.join("/") + "/file.txt";
      const result = safePath(longPath, safeDir);
      expect(result).toBe(join(safeDir, ...segments, "file.txt"));
    });

    test("preserves case sensitivity", () => {
      const mixedCasePath = "File.TXT";
      const result = safePath(mixedCasePath, safeDir);
      expect(result).toBe(join(safeDir, mixedCasePath));
    });
  });

  describe("Error Message Quality", () => {
    test("provides clear error for traversal attempts", () => {
      expect(() => {
        safePath("../../../etc/passwd", safeDir);
      }).toThrow("Path outside allowed directory: ../../../etc/passwd");
    });

    test("provides clear error for invalid base path", () => {
      const invalidBase = "/nonexistent/path";
      expect(() => {
        safePath("file.txt", invalidBase);
      }).toThrow("Invalid base path: /nonexistent/path");
    });

    test("wraps unexpected errors with context", () => {
      // Test with a truly invalid base path that should trigger error wrapping
      const invalidBase = "\0invalid\0path";

      expect(() => {
        safePath("file.txt", invalidBase);
      }).toThrow(
        /Path validation failed:|Invalid base path:|Path input contains null bytes/
      );
    });
  });

  describe("Performance and Security", () => {
    test("handles reasonable number of path segments efficiently", () => {
      const manySegments = Array(100).fill("dir").join("/") + "/file.txt";

      const start = Date.now();
      expect(() => {
        safePath(manySegments, safeDir);
      }).not.toThrow();
      const duration = Date.now() - start;

      // Should complete in reasonable time (< 100ms for 100 segments)
      expect(duration).toBeLessThan(100);
    });

    test("prevents ReDoS attacks through malicious patterns", () => {
      const maliciousPath = "../".repeat(1000) + "file.txt";

      const start = Date.now();
      expect(() => {
        safePath(maliciousPath, safeDir);
      }).toThrow("Path outside allowed directory:");
      const duration = Date.now() - start;

      // Should complete quickly even with malicious input
      expect(duration).toBeLessThan(100);
    });

    test("handles concurrent path validations safely", async () => {
      const paths = [
        "file1.txt",
        "subdir/file2.txt",
        "../should-fail.txt",
        "file3.txt",
        "subdir/../file4.txt",
      ];

      const promises = paths.map((path) => {
        return new Promise((resolve) => {
          try {
            const result = safePath(path, safeDir);
            resolve({ path, result, error: null });
          } catch (error) {
            resolve({ path, result: null, error: error.message });
          }
        });
      });

      const results = await Promise.all(promises);

      // Valid paths should succeed
      expect(results[0].error).toBeNull();
      expect(results[1].error).toBeNull();
      expect(results[3].error).toBeNull();
      expect(results[4].error).toBeNull();

      // Invalid path should fail
      expect(results[2].error).toContain("Path outside allowed directory");
    });
  });
});
