Great repro—thank you. The failure pattern (“tests 1 / suites 0 / fail 1” with a lone `Usage: node create-zip.js ...`) is very suggestive:

## TL;DR diagnosis

1. **Your test helpers aren’t registering tests with Node’s runner.**
   Node sees **no `node:test` tests/suites**, so it treats the *file itself* as a single test. Any thrown assertion (e.g., from your `expect`) then looks like a top-level failure → `test at ...:1:1 'test failed'`.

2. **Your CLI guard in `create-zip.js` is likely off**, so when the module is imported, CLI code might run (or your CLI tests’ throws propagate as top-level errors because they’re not inside a real `node:test` test).

3. The “✅ Created …” lines are harmless—they’re just your function’s `console.log` after the **mocked** runner is invoked. No real ZIP is created (runner returns `Buffer.alloc(0)`). If you want silence, stub `console.log` in those tests or add a `quiet` option.

Below is a concrete, minimal set of changes that will make this pass reliably with `node --test` while keeping your nice spies and structure.

---

## 1) Fix the ESM “run as script” guard & make CLI DI-friendly

**`utils/create-zip.js`**

```js
// utils/create-zip.js
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function psEscapeSingleQuotes(s) {
  return s.replace(/'/g, "''");
}

export function buildPsCommand(source, output, opts = {}) {
  const shell = opts.shell || "powershell";
  const srcAbs = path.resolve(source);
  const outAbs = path.resolve(output);
  const srcEsc = psEscapeSingleQuotes(srcAbs);
  const outEsc = psEscapeSingleQuotes(outAbs);

  // -NoLogo/-NoProfile/-NonInteractive keep CI clean & deterministic
  return `${shell} -NoLogo -NoProfile -NonInteractive -Command "Compress-Archive -Path '${srcEsc}' -DestinationPath '${outEsc}' -Force -ErrorAction Stop"`;
}

export function createZip(source, output, opts = {}) {
  const { runner = execSync, shell = "powershell", dryRun = false, quiet = false } = opts;

  if (!fs.existsSync(source)) {
    throw new Error(`create-zip: Source not found: ${source}`);
  }
  const st = fs.statSync(source);
  if (!st.isFile() && !st.isDirectory()) {
    throw new Error(`create-zip: Source must be a file or directory: ${source}`);
  }

  const cmd = buildPsCommand(source, output, { shell });

  if (dryRun) {
    if (!quiet) console.log(`🔍 DRY RUN: Would execute: ${cmd}`);
    if (!quiet) console.log(`✅ DRY RUN OK`);
    return path.resolve(output);
  }

  try {
    runner(cmd, { stdio: "inherit" });
    if (!quiet) console.log(`✅ Created ${path.resolve(output)}`);
    return path.resolve(output);
  } catch (e) {
    const err = new Error(`create-zip: ${e?.message || String(e)}`);
    err.cause = e;
    throw err;
  }
}

// Dependency-injected CLI (so tests don’t need to monkeypatch process)
export function runCli(argv, io = {}) {
  const {
    runner = execSync,
    shell = "powershell",
    log = console.log,
    error = console.error,
    exit = (code) => process.exit(code),
  } = io;

  const [src, out, ...flags] = argv;
  const dryRun = flags.includes("--dry-run");

  if (!src || !out) {
    error("Usage: node create-zip.js <source-directory> <output-file.zip> [--dry-run]");
    return exit(1);
  }

  try {
    createZip(src, out, { runner, shell, dryRun });
    return exit(0);
  } catch (e) {
    error(e?.message || e);
    return exit(1);
  }
}

// Correct ESM “main” guard
const isMain = (() => {
  if (!process.argv[1]) return false;
  const me = fileURLToPath(import.meta.url);
  return path.resolve(process.argv[1]) === me;
})();

if (isMain) {
  runCli(process.argv.slice(2));
}
```

**Why this matters**

* The `fileURLToPath(import.meta.url)` + `path.resolve(process.argv[1])` guard **prevents CLI code from running on import**, which was likely the source of spurious usage output.
* `runCli(argv, io)` now accepts `{ exit, log, error, runner, shell }`, so tests can **stub `exit`** without touching `process.exit`.

---

## 2) Make sure your test helpers truly bind to `node:test`

If your `../../../facade/test-helpers/index.js` *doesn’t* re-export from `node:test`, Node won’t see your tests. A minimal version:

```js
// facade/test-helpers/index.js
import * as nt from "node:test";
import assert from "node:assert/strict";

// Re-export Node's test API so the runner sees suites/tests
export const describe = nt.describe;
export const it = nt.it;
export const beforeEach = nt.beforeEach;
export const afterEach = nt.afterEach;

// Light "expect"-style sugar on top of node:assert
export function expect(actual) {
  return {
    toBe(exp) { assert.strictEqual(actual, exp); },
    toMatch(re) { assert.match(actual, re); },
    toContain(str) { assert.ok(String(actual).includes(str)); },
    toBeTruthy() { assert.ok(actual); },
    toBeFalsy() { assert.ok(!actual); },
    // add more as you need
  };
}

// Simple spy utilities
export function createSpy(name = "spy") {
  const fn = (...args) => {
    fn.calls.push(args);
    if (fn._impl) return fn._impl(...args);
  };
  fn.calls = [];
  fn.mockImplementation = (impl) => { fn._impl = impl; return fn; };
  fn.mockReturnValue = (v) => { fn._impl = () => v; return fn; };
  fn.reset = () => { fn.calls = []; fn._impl = undefined; };
  fn.toHaveBeenCalledTimes = (n) => assert.strictEqual(fn.calls.length, n);
  return fn;
}

export function spyOn(obj, method) {
  const original = obj[method];
  const spy = createSpy(`${String(method)}Spy`);
  obj[method] = (...args) => spy(...args);
  spy.mockRestore = () => { obj[method] = original; };
  // Jest-like matchers
  spy.toHaveBeenCalled = () => assert.ok(spy.calls.length > 0);
  spy.toHaveBeenCalledWith = (...exp) =>
    assert.ok(spy.calls.some(args => assert.deepStrictEqual(args, exp) === undefined));
  spy.toHaveBeenCalledTimes = (n) => assert.strictEqual(spy.calls.length, n);
  return spy;
}

// Handy test-wide auto-reset hook
export function setupAutoReset() {
  // If you keep global registries/spies, clear them here each test if desired.
  // For now it’s a no-op to keep compatibility.
}
```

Key point: **those `describe/it` must come from `node:test`**, not your own registry.

---

## 3) Tweak the two CLI tests to use injected `exit`/`error`

Update just those tests to avoid patching `process.exit`:

```js
// shows usage when insufficient arguments provided
it("shows usage when insufficient arguments provided", () => {
  const errorSpy = spyOn(console, "error");
  errorSpy.mockImplementation(() => {}); // silence
  const exitSpy = createSpy("exit");
  exitSpy.mockImplementation((code) => { throw new Error(`exit:${code}`); });

  try {
    expect(() => runCli([], { error: console.error, exit: exitSpy }))
      .toThrow(/exit:1/);

    expect(errorSpy.calls.some(call =>
      call[0] && call[0].includes("Usage: node create-zip.js")
    )).toBe(true);
  } finally {
    errorSpy.mockRestore();
  }
});

// handles CLI errors gracefully
it("handles CLI errors gracefully", () => {
  const dir = createTempDir();
  const errorSpy = spyOn(console, "error");
  errorSpy.mockImplementation(() => {});
  const exitSpy = createSpy("exit");
  exitSpy.mockImplementation((code) => { throw new Error(`exit:${code}`); });

  try {
    expect(() => runCli([path.join(dir, "missing"), path.join(dir, "out.zip")], {
      error: console.error,
      exit: exitSpy,
    })).toThrow(/exit:1/);
    // errorSpy should have been called with a create-zip:... message
    expect(errorSpy.calls.some(call => /create-zip:/.test(call[0]))).toBe(true);
  } finally {
    errorSpy.mockRestore();
  }
});
```

This keeps the same assertions but **doesn’t touch `process.exit`** at all.

---

## 4) (Optional) Quiet logs during tests

If you don’t want to see “✅ Created …” while the mocked runner executes, temporarily stub `console.log` in those tests or pass `{ quiet: true }` to `createZip` (supported in the implementation above):

```js
const result = createZip(src, out, { runner: mockRunner, quiet: true });
```

---

## 5) What likely happened & how to verify

* With helpers not registering to `node:test`, Node counted **0 tests** and treated the file as a single “test.”
* An assertion/throw in your CLI tests (e.g., the thrown `process.exit called`) **bubbled to top-level**, so Node reported the file as a 1-test failure at `:1:1`.

### Quick smoke-check

Add this trivial file and run `node --test`:

```js
// tests/smoke.node-test.js
import { it } from "node:test";
import assert from "node:assert/strict";
it("node test wire-up works", () => assert.ok(true));
```

You should see `tests 1 / pass 1`.

Then re-run your comprehensive test. If your helpers re-export `node:test`, Node’s summary should show **suites > 0** and many passing tests instead of “tests 1 / suites 0”.

---

## 6) Windows quoting/paths (you’re good)

Your tests around spaces, quotes, and backslashes align with PowerShell rules (single quotes doubled inside single-quoted literals). The `buildPsCommand` above keeps the `-NoLogo -NoProfile -NonInteractive` trio and absolute paths—nice and deterministic for CI.

---

## 7) Minimal run command

```bash
node --test tests/internal/utils/create-zip-comprehensive.test.js
```

(You don’t need to change this; once the two fixes above land, it should pass.)

---

If anything still flakes after these fixes, paste the revised `test-helpers/index.js` and the top \~60 lines of `create-zip.js`, and I’ll zero in further.
