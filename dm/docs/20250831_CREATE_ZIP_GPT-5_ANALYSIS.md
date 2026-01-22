Short answer: your instincts are good—the **PowerShell-based `create-zip` utility is fine** for your Windows build flow. The surprise ZIPs you saw during earlier test runs were almost certainly from tests that either (a) invoked the file as a CLI (spawning Node) or (b) imported the module without a robust “main module” guard and then executed it. The Copilot/Claude test you pasted avoids that by not importing the real module, but it also means you’re **not actually testing the real code path**—you’re testing a re-implementation of it.

Below is a minimal, surgical refactor that makes the module **easy to test without creating ZIPs**, fixes a subtle cross-platform CLI-guard issue, and adds a safe quoting helper for paths containing single quotes. I also show a compact `node:test` suite that mocks `child_process.execSync` **in the real module**.

---

# What I recommend (tight + pragmatic)

1. **Tiny DI seam**: allow `execSync` to be injected (`runner` option) so tests can intercept the real call without executing PowerShell.
2. **Robust CLI guard**: compare `pathToFileURL(process.argv[1]).href === import.meta.url` (your current `pathname` equality can misbehave on Windows).
3. **Safer quoting**: escape single quotes for PowerShell single-quoted strings (rare path edge case, but cheap to fix).
4. **Don’t `process.exit()` inside the library function**: throw and let the CLI wrapper decide; this makes unit testing clean.
5. **Optional**: add `--dry-run` for CLI tests and ad-hoc debugging.
6. **Optional**: `-NoLogo -NoProfile -NonInteractive -ErrorAction Stop` to make PowerShell faster and fail-closed.

---

# Drop-in replacement: `create-zip.js` (ESM)

```js
// utils/create-zip.js
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Escape for single-quoted PowerShell literals: 'foo' -> 'foo'' */
function psSingleQuoted(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Build the exact PowerShell command (pure; easy to unit-test) */
export function buildPsCommand(sourceDir, outputFile, { shell = "powershell" } = {}) {
  const absSrc = path.resolve(sourceDir);
  const parent = path.dirname(absSrc);
  const base = path.basename(absSrc);
  const srcPath = parent + path.sep + base; // ensures "...\parent\base"
  const absOut = path.resolve(outputFile);

  return `${shell} -NoLogo -NoProfile -NonInteractive -Command ` +
         `"Compress-Archive -Path ${psSingleQuoted(srcPath)} ` +
         `-DestinationPath ${psSingleQuoted(absOut)} -Force -ErrorAction Stop"`;
}

/**
 * Create zip file utility for Lambda function packaging.
 * Supports both single files and directories.
 * Accepts a DI seam for testability: { runner, shell }.
 */
export function createZip(sourceDir, outputFile, { runner = execSync, shell } = {}) {
  try {
    const stat = fs.statSync(sourceDir); // validate existence; throws otherwise
    if (!stat.isDirectory() && !stat.isFile()) {
      throw new Error("source must be a file or directory");
    }

    const command = buildPsCommand(sourceDir, outputFile, { shell });
    runner(command, { stdio: "inherit" });
    console.log(`✅ Created ${outputFile}`);
    return outputFile;
  } catch (error) {
    // Re-throw with a stable prefix for assertions
    const err = error instanceof Error ? error : new Error(String(error));
    err.message = `create-zip: ${err.message}`;
    throw err;
  }
}

/** Small CLI wrapper so the library stays testable. */
export function runCli(argv = process.argv.slice(2)) {
  const [sourceDir, outputFile, ...rest] = argv;
  if (!sourceDir || !outputFile) {
    console.error("Usage: node create-zip.js <source-directory> <output-file.zip> [--dry-run]");
    process.exit(1);
  }
  const dryRun = rest.includes("--dry-run");
  const runner = dryRun ? (cmd) => console.log(cmd) : execSync;

  try {
    createZip(sourceDir, outputFile, { runner });
    if (dryRun) console.log("DRY RUN OK");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

// Robust ESM "main module" check (Windows-safe)
const isMain = (() => {
  try {
    return process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (isMain) runCli();

export default createZip;
```

---

# Focused `node:test` that hits the real code (no ZIPs created)

This uses `node:test`’s built-in mocking to replace `child_process.execSync` **in place**, so you don’t need to re-implement `createZip` logic inside tests. It also checks quoting, options, and error propagation.

```js
// tests/utils/create-zip.test.js
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import * as cp from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildPsCommand, createZip } from "../../../utils/create-zip.js";

let calls = [];
let restoreExec;

function tmpDir(prefix = "zip-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}`));
}

describe("create-zip (PowerShell)", () => {
  let dir;
  beforeEach(() => {
    dir = tmpDir();
    calls = [];
    restoreExec = mock.method(cp, "execSync", (cmd, opts) => {
      calls.push({ cmd, opts });
      return Buffer.alloc(0);
    });
  });

  afterEach(() => {
    restoreExec.mock.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("builds a correct PowerShell command (spaces + single quotes)", () => {
    const src = path.join(dir, "layer with 'odd' name");
    fs.mkdirSync(src, { recursive: true });
    const out = path.join(dir, "out with spaces.zip");

    const cmd = buildPsCommand(src, out);
    assert.match(cmd, /^powershell\b/i);
    assert.match(cmd, /Compress-Archive/);
    // Single quotes in -Path must be doubled inside a single-quoted literal
    assert.match(cmd, /-Path '.*layer with ''odd'' name'/);
    assert.match(cmd, /-DestinationPath '.*out with spaces\.zip'/);
    assert.match(cmd, /-Force\b/);
    assert.match(cmd, /-ErrorAction Stop\b/);
  });

  it("invokes execSync exactly once with inherited stdio", () => {
    const src = path.join(dir, "nodejs");
    fs.mkdirSync(src, { recursive: true });
    const out = path.join(dir, "layer.zip");

    createZip(src, out);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.stdio, "inherit");
    assert.match(calls[0].cmd, /Compress-Archive/);
  });

  it("throws with a stable prefix when PowerShell fails", () => {
    restoreExec.mock.restore();
    mock.method(cp, "execSync", () => { throw new Error("Access denied"); });

    const src = path.join(dir, "nodejs");
    fs.mkdirSync(src, { recursive: true });
    const out = path.join(dir, "layer.zip");

    assert.throws(() => createZip(src, out), /create-zip: Access denied/);
  });

  it("errors if source does not exist", () => {
    const out = path.join(dir, "x.zip");
    assert.throws(() => createZip(path.join(dir, "missing"), out), /create-zip:/);
    assert.equal(calls.length, 0); // never reached execSync
  });
});
```

> If you want a CLI smoke test without creating files, run the script with `--dry-run` and assert on `stdout` from a `spawnSync(process.execPath, [file, src, out, '--dry-run'])`.

---

# Why your earlier tests spawned real ZIPs

* Some generators write CLI tests that **spawn the Node process** (e.g., `spawnSync(node, [create-zip.js, ...])`) without intercepting `execSync`, so they end up running PowerShell for real.
* Others try to `import` the ESM file and then **mutate `child_process.execSync`** after evaluation—too late; any top-level side effects (or a brittle CLI guard) may have already fired.
* Your current pasted suite avoids both by re-implementing the logic. That’s safe, but it’s not verifying the real module.

The small refactor above gives you **clean, side-effect-free unit tests** that exercise the real module and let you add precise assertions (paths with spaces, quotes, trailing slashes, etc.) without ever creating a ZIP.

---

# Final quick checks / gotchas

* ✅ Works on Windows PowerShell as you intended; optional `shell: 'pwsh'` works on systems with PowerShell 7.
* ✅ Handles directories or single files.
* ✅ No accidental exits in library code; CLI wrapper calls `process.exit`.
* ✅ Safer quoting for rare single-quote path names.
* ✅ Testable with `node:test` mocks; no ZIPs created in CI.
* ⚠️ If you ever need cross-platform without PowerShell, consider swapping in a Node zip lib (e.g., `archiver`) behind the same DI seam.

If you want, I can adapt your existing test file to this pattern so it uses `node:test` mocks instead of the re-implementation—but the snippet above should be enough to unblock you.
