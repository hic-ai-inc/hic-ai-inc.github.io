You’re absolutely right to be suspicious—this test is still calling the **real** ZIP path. The short version:

* Your test creates a mocked `utils/create-zip.js`, but the **build script you execute is the real repo file** (`layers/build-lambda-layer.sh`).
* That script likely resolves its own directory (`SCRIPT_DIR=...`) and then uses `"$SCRIPT_DIR/../utils/create-zip.js"` (or similar), so it **ignores** the mock you placed under the test sandbox.
* Because of that, the build script ends up running the **real** ZIPer (which shells out to PowerShell `Compress-Archive`), which explains the AppData temp bloat and the hang.

Also, note that “mocking” `execSync` inside the Node test process does not affect a bash script spawning `node …` or external processes. Each `node` invocation in the shell script is a **different process**; your in-process mock doesn’t reach it.

Below are concrete, minimal changes that will make this hermetic and stop the sprawl.

---

# ✅ Fix 1: Force the build script to use your mock ZIP utility

Add this in your `beforeEach` **after** you compute `testDir` and **before** you call the build script:

```js
import { join } from "node:path";

// ... inside beforeEach, after testDir is created:
process.env.CREATE_ZIP_UTILITY = join(testDir, "utils", "create-zip.js");
```

Why this works: your build script already reads `CREATE_ZIP_UTILITY` (directly or via defaulting). Setting it here points the script at the mock you generated under the sandbox.

> If your build script doesn’t honor `CREATE_ZIP_UTILITY` yet, add this in the script once (tiny change):
>
> ```bash
> SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
> CREATE_ZIP_UTILITY="${CREATE_ZIP_UTILITY:-"${SCRIPT_DIR}/../utils/create-zip.js"}"
> ```
>
> …and later:
>
> ```bash
> node "$CREATE_ZIP_UTILITY" "$LAYER_BUILD_DIR/nodejs" "$ZIP_PATH"
> ```

---

# ✅ Fix 2: Make the mock actually write a tiny placeholder ZIP

Several of your tests assert `existsSync(zipPath) === true`. Your current mock prints and exits without creating anything, so even once Fix 1 is in place, those assertions would fail. Change the mock you write in `createMockLayer()` to “touch” the destination (harmless, tiny file in the sandbox):

```js
// Replace the body you write to utils/create-zip.js with this:
`#!/usr/bin/env node
// MOCK CREATE-ZIP - Writes a tiny placeholder file only inside the test sandbox
const fs = require('fs');
const path = require('path');

const [sourceDir, zipPath] = process.argv.slice(2);

if (!zipPath) {
  console.error('MOCK CREATE-ZIP: missing destination path');
  process.exit(1);
}

// Safety: only allow writes under a test sandbox path
const safeMarkers = ['.tmp-tests', 'temp', 'TMP', 'Temp'];
const allowed = safeMarkers.some(m => zipPath.includes(m));
if (!allowed) {
  console.error('MOCK CREATE-ZIP: Refusing to create outside sandbox:', zipPath);
  process.exit(1);
}

// Ensure parent dir exists and write a tiny file
fs.mkdirSync(path.dirname(zipPath), { recursive: true });
fs.writeFileSync(zipPath, 'MOCK ZIP\\n');
console.log('MOCK: wrote placeholder zip -> ' + zipPath);
process.exit(0);
`
```

This keeps everything inside your sandboxed `TEST_TMP_ROOT`, avoids any PowerShell calls, and satisfies your `existsSync` checks.

---

# ✅ Fix 3: Set the env for *every* test case that calls the script

Right now you set LAYER\_DIR/LAYER\_NAME/etc. on a per-test basis. Do the same for the ZIP utility so you don’t accidentally run the real one in any branch:

```js
// In each test, *after* createMockLayer(...) and *before* execSync(...):
process.env.CREATE_ZIP_UTILITY = join(testDir, "utils", "create-zip.js");
```

(You can also set it once in `beforeEach` as shown in Fix 1; doing both is harmless.)

---

# ✅ (Optional but recommended) Guard the *real* ZIP utility against self-zipping

On Windows, `Compress-Archive` will happily create the destination ZIP **inside** the source folder. That can recurse in awful ways (ever-growing ZIP). Put this guard into your real `utils/create-zip.js`:

```js
// BEFORE invoking Compress-Archive:
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function isSubpath(child, parent) {
  const a = path.resolve(child).toLowerCase();
  const b = path.resolve(parent).toLowerCase();
  return a === b || a.startsWith(b + path.sep);
}

const sourceDir = path.resolve(process.argv[2]);
const outputFile = path.resolve(process.argv[3]);

if (isSubpath(outputFile, sourceDir)) {
  console.error('Refusing to write ZIP inside source directory:', outputFile);
  process.exit(1);
}
```

This prevents the classic “ZIP includes itself” failure mode even outside tests.

---

# ✅ (Optional) Stop accidental network or tool calls during tests

If your build script sometimes runs `npm install`, your in-process `execSync` mock won’t help. Two options:

1. **Use version-gate** to “noop” in tests where the npm side isn’t needed (you already have a test for “skips build when noop”).

2. **Shadow tools in PATH** (hermetic approach):

```js
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const binDir = join(testDir, "bin");
mkdirSync(binDir, { recursive: true });

// Stub npm (Unix)
writeFileSync(join(binDir, "npm"), `#!/usr/bin/env bash
echo "MOCK npm $@"
exit 0
`);
fs.chmodSync(join(binDir, "npm"), 0o755);

// Stub npm.cmd (Windows)
writeFileSync(join(binDir, "npm.cmd"), `@echo off
echo MOCK npm %*
exit /b 0`);

// Prepend PATH
process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
```

(You generally don’t need to stub PowerShell if you’re successfully redirecting to the mocked `create-zip.js`.)

---

# ✅ Cleanups in your test (non-blocking but good hygiene)

* The `global.execSync = mockExecSync` line doesn’t affect commands launched by the bash script or any separate `node` processes, so it’s not doing what you might expect. You can remove that whole mocking block to avoid confusion.
* `sweepStaleUnderRoot()` uses `require("fs")` inside ESM; since `require` is not defined in ESM, that `try { … } catch {}` always swallows an error. If you want it to work, just import `statSync` at the top and use that.

---

## TL;DR change list

1. Set `process.env.CREATE_ZIP_UTILITY = join(testDir, "utils", "create-zip.js")` in `beforeEach` (or per test before calling the script).

2. Change the mocked `utils/create-zip.js` to actually **write a tiny placeholder file** at `zipPath`.

3. (Optional) Add a self-zip guard to the **real** `create-zip.js`.

4. (Optional) Shadow `npm` via PATH in tests if network tooling ever runs.

With those in place, this test will stop touching your real AppData temp directory, won’t hang, and will still validate that the build script produces the expected outputs.
