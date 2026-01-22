You’re doing almost everything right—the leak is coming from 3 things colliding:

1. you create very **large / deep** trees (e.g., “Performance Monitoring”, “deeply nested”, “very long path names”),
2. on Windows those can exceed `MAX_PATH` or set odd attributes (read-only), and
3. your cleanup catches & logs errors, then continues—so failed deletions are silently left in `%LOCALAPPDATA%\Temp`.

Below is a surgical plan that keeps your coverage/robustness but eliminates the OS-temp pollution.

---

# What to change (minimal + robust)

## 1) Sandbox all test temp under a single, project-scoped root

Avoid `os.tmpdir()` for test fixtures. Put everything under a known folder you own (easy to nuke), with an env override for flexibility.

```js
// at top of the test file (add imports if needed)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";

const TEST_TMP_ROOT =
  process.env.HIC_TEST_TMP_ROOT ||
  path.join(process.cwd(), ".tmp-tests", "create-zip");

fs.mkdirSync(TEST_TMP_ROOT, { recursive: true });

function mkdtempInRoot(prefix = "cz-") {
  // mkdtemp ensures uniqueness; avoids homegrown collisions
  return fs.mkdtempSync(path.join(TEST_TMP_ROOT, prefix));
}
```

Then replace your `createTempDir` with:

```js
function createTempDir(prefix = "cz-") {
  const dir = mkdtempInRoot(prefix);
  tempDirs.push(dir);
  return dir;
}
```

Now—even if a crash happens—leftovers live under `.tmp-tests/create-zip/`, not AppData.

> If you absolutely want to keep using OS temp, set `HIC_TEST_TMP_ROOT` to `%TEMP%\hic-create-zip` in your shell; same code works.

---

## 2) Make cleanup Windows-proof (long paths, read-only) with a fallback

Keep your `cleanup()` but harden deletion. Use retries + Win long-path prefix + a PowerShell fallback that clears read-only and long paths.

```js
function toWinLong(p) {
  return process.platform === "win32" && !p.startsWith("\\\\?\\")
    ? "\\\\?\\" + p
    : p;
}

function rmrf(p) {
  const target = toWinLong(p);

  try {
    // Node 20 supports retries; helps with transient ENOTEMPTY
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
    return true;
  } catch (err) {
    if (process.platform === "win32") {
      // Clear read-only attributes and remove via PowerShell (handles long paths well)
      try {
        const lit = target.replace(/'/g, "''"); // PS single-quote escape
        cp.execFileSync("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `if (Test-Path -LiteralPath '${lit}') {
             try { attrib -r -s -h -a '${lit}' /s /d } catch {}
             Remove-Item -LiteralPath '${lit}' -Recurse -Force -ErrorAction SilentlyContinue
           }`
        ], { stdio: "ignore" });
        return true;
      } catch (_) {
        // fall-through
      }
    }
    return false;
  }
}

function cleanup() {
  for (const tempDir of tempDirs) {
    try {
      if (fs.existsSync(tempDir)) {
        if (!rmrf(tempDir)) {
          console.warn(`Warning: Could not clean up ${tempDir}`);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not clean up ${tempDir}:`, error.message);
    }
  }
  tempDirs = [];
}
```

### Optional (CI safety)

Fail the suite in CI if cleanup fails so you don’t silently accumulate junk:

```js
const STRICT_CLEANUP = process.env.CI === "true";

function cleanup() {
  let ok = true;
  for (const tempDir of tempDirs) {
    try {
      if (fs.existsSync(tempDir) && !rmrf(tempDir)) {
        ok = false;
        console.warn(`Warning: Could not clean up ${tempDir}`);
      }
    } catch (e) {
      ok = false;
      console.warn(`Warning: Could not clean up ${tempDir}:`, e.message);
    }
  }
  tempDirs = [];
  if (STRICT_CLEANUP && !ok) {
    throw new Error("Cleanup failed under CI");
  }
}
```

---

## 3) Add a final safety net: `afterAll` + `process.on('exit')`

Your `afterEach` is great, but long-path failures still slip through. Add an end-of-suite sweep and a process exit hook.

```js
import { beforeAll, afterAll } from "../../../facade/test-helpers/index.js"; // if available

// Sweep any stale subfolders from previous crashed runs
function sweepStaleUnderRoot() {
  if (!fs.existsSync(TEST_TMP_ROOT)) return;
  for (const name of fs.readdirSync(TEST_TMP_ROOT)) {
    const full = path.join(TEST_TMP_ROOT, name);
    try {
      const st = fs.statSync(full);
      const ageMs = Date.now() - st.mtimeMs;
      if (ageMs > 5 * 60 * 1000) { // older than 5 minutes
        rmrf(full);
      }
    } catch { /* ignore */ }
  }
}

// optional: start-of-suite sweep
beforeAll?.(() => sweepStaleUnderRoot());

// end-of-suite: remove the entire root
afterAll?.(() => {
  if (fs.existsSync(TEST_TMP_ROOT)) rmrf(TEST_TMP_ROOT);
});

// if your helpers don't expose beforeAll/afterAll, keep this as a belt-and-suspenders:
process.on("exit", () => {
  try { if (fs.existsSync(TEST_TMP_ROOT)) rmrf(TEST_TMP_ROOT); } catch {}
});
```

---

## 4) Keep the “stress” coverage but scale by env var

Your “Performance Monitoring” test creates \~1,000 files; plus deep nesting + long names triggers Windows path limits. You can keep the same assertions while dialing volume down by default and enabling full stress mode only when desired.

```js
const HEAVY = process.env.RUN_HEAVY_TESTS === "1";

// Example tweak in "Performance Monitoring"
const modules = HEAVY ? 100 : 10;
const filesPerModule = HEAVY ? 10 : 3;
for (let i = 0; i < modules; i++) {
  const subDir = path.join(paths.src, `module${i}`);
  fs.mkdirSync(subDir, { recursive: true });
  for (let j = 0; j < filesPerModule; j++) {
    fs.writeFileSync(path.join(subDir, `file${j}.js`), `export const data=${j};`);
  }
}

// Example tweak for long-name/deep-path tests
const longName = HEAVY ? "a".repeat(100) : "a".repeat(40);
const depth = HEAVY ? 20 : 8;
```

This preserves logic/structure coverage without hammering the FS on every run.

---

## 5) (Optional) Memory FS for the mega cases

If you’re okay with one small **dev-only** dependency, wrap the biggest trees with `mock-fs` or `memfs` to simulate large layouts without writing to disk. You already inject a `runner`; you can also provide an alternate `fs` to your command builder (or mock `node:fs` using Node 20’s native mocking if your helpers expose it). This is purely optional—the steps above should already solve the leak.

---

# Why you were seeing “55 dirs / 2k+ files”

* The **“large project”** and **deep/long-name** tests *do* create thousands of files.
* On Windows, deleting those can fail due to **`MAX_PATH`** and **read-only** bits.
* Your cleanup logs a warning and continues, so those failed deletions **persist** in `%LOCALAPPDATA%\Temp`.
* Repeating runs accumulates more.

The hardened `rmrf` + project-scoped tmp root + end-of-suite sweep removes the OS temp pollution while keeping your test matrix intact.

---

## Drop-in summary (copy/paste order)

1. Add the **TEST\_TMP\_ROOT** constants + `mkdtempInRoot` and update `createTempDir` to use it.
2. Replace your `cleanup()` with the **hardened** version (`rmrf` + PowerShell fallback).
3. Add `beforeAll/afterAll` (or `process.on('exit')`) to sweep the root at the end.
4. Gate heavy counts by `RUN_HEAVY_TESTS`.

If you want, I can paste a single consolidated patch of your file with these changes applied.
