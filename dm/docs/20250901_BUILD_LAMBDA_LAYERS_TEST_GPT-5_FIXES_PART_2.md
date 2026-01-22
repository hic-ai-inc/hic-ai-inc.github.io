Nice, this is very close. The 8 failures all trace back to two primary issues in the test harness (not the shell script):

1. **You’re running the *real* `layers/build-lambda-layer.sh` against the repo’s *real* `utils/`**, so your mocked `validate.sh`, `version-gate.sh`, and `create-zip.js` are being ignored most of the time. That’s why:

   * The “noop” test doesn’t see the mocked `version-gate.sh` output.
   * No ZIP or `nodejs/` structure shows up (the build is effectively short-circuited by the real gate/validators).

2. **A scoping bug makes `CREATE_ZIP_UTILITY` disappear** inside the mocked `execSync` call. You declare `let relativeToScript` at the top, then re-declare `const relativeToScript = …` inside `beforeEach`. The global mock uses the *outer* `relativeToScript` (still `undefined`) and overwrites the env with that `undefined`, undoing the good env you set just above. That forces the script to fall back to the real ZIP utility.

There’s also one small landmine that hasn’t bitten you yet:

3. **`sweepStaleUnderRoot` uses `require('fs')` inside an ESM file** (where `require` isn’t defined). It’s gated in practice (function isn’t called), but let’s make it safe.

---

## What to change (surgical)

### A) Run a **sandbox copy** of the build script so it sources your mocked `utils/`

In `beforeEach`, copy the *real* script into the test sandbox (`<testDir>/layers/build-lambda-layer.sh`), and run **that**. From there, `../utils` resolves to your mocked `utils` in the sandbox.

```diff
@@
-  // Path to the actual build script
-  buildScript = resolve(process.cwd(), "layers", "build-lambda-layer.sh");
+  // Use a sandbox copy of the build script so ../utils resolves to our mocks
+  const realBuildScript = resolve(process.cwd(), "layers", "build-lambda-layer.sh");
+  const sandboxLayersDir = join(testDir, "layers");
+  mkdirSync(sandboxLayersDir, { recursive: true });
+  const sandboxBuildScript = join(sandboxLayersDir, "build-lambda-layer.sh");
+  writeFileSync(sandboxBuildScript, readFileSync(realBuildScript, "utf8"));
+  try { require("node:fs").chmodSync(sandboxBuildScript, 0o755); } catch {}
+  buildScript = sandboxBuildScript;
```

### B) Compute paths **relative to the sandboxed script** and fix the variable shadowing

```diff
@@
-  // GPT-5 APPROACH: Set CREATE_ZIP_UTILITY environment variable to point to our mock
-  const mockCreateZipPath = join(testDir, "utils", "create-zip.js");
-
-  // CRITICAL: The build script resolves CREATE_ZIP_UTILITY relative to SCRIPT_DIR
-  // We need to provide a path that when resolved will point to our mock
-  const buildScriptDir = resolve(process.cwd(), "layers");
-  const relativeToScript = relative(buildScriptDir, mockCreateZipPath);
-  process.env.CREATE_ZIP_UTILITY = relativeToScript;
+  // Point CREATE_ZIP_UTILITY to our mock, relative to the sandboxed script dir
+  const mockCreateZipPath = join(testDir, "utils", "create-zip.js");
+  const buildScriptDir = sandboxLayersDir; // <— the sandbox layers dir
+  // IMPORTANT: assign to the OUTER variable; do NOT re-declare a new const
+  relativeToScript = relative(buildScriptDir, mockCreateZipPath);
+  process.env.CREATE_ZIP_UTILITY = relativeToScript;
```

### C) Don’t clobber the env with `undefined` inside the execSync mock

(If you keep the mock—frankly you can delete it; the explicit `env` you pass to `execSync` is enough.)

```diff
@@
-            CREATE_ZIP_UTILITY: relativeToScript,
+            // Only override if we actually computed it
+            ...(relativeToScript ? { CREATE_ZIP_UTILITY: relativeToScript } : {}),
```

Do that in **both** places where you build `mockOptions.env`.

Or (simpler): **remove the global `execSync` mock** entirely; it’s redundant. Every `execSync` you do already passes a fully-formed `env`, and the bash script inherits and uses it for its internal `node` calls.

### D) Make `sweepStaleUnderRoot` ESM-safe

Replace the little `require('fs')` bit with your already-imported API:

```diff
-    try {
-      const st = readFileSync ? require("fs").statSync(full) : null;
+    try {
+      const st = readFileSync ? require("node:fs").statSync(full) : null;
```

…or better:

```diff
+import { statSync } from "node:fs";
@@
-      const st = readFileSync ? require("fs").statSync(full) : null;
+      const st = readFileSync ? statSync(full) : null;
```

---

## Why this fixes all 8 failures

* **Directory structure / package.json tests**: once the script is run from the sandbox and resolves `../utils` to your mocked `validate.sh`, it proceeds to create `build/<layer>/nodejs/...` and `package.json` the way the tests expect. Previously it used the repo’s validators/gate and short-circuited.

* **ZIP creation tests**: with the scoping bug fixed, `CREATE_ZIP_UTILITY` points at your mock, which writes the 2KB placeholder **inside** your sandbox `DIST_DIR`. That flips all `existsSync(zipPath)` assertions to `true`.

* **Version gate “noop” test**: your test overwrites `version-gate.sh` in the sandbox. With the script sourcing from `../utils` (sandbox), you’ll now see the expected “No changes detected / Skipping build” markers.

* **Custom BUILD\_DIR / DIST\_DIR tests**: same story—env makes it to the sandboxed script; outputs are created in the custom locations; assertions turn true.

---

## Minimal patch block you can paste

If you want the smallest possible change set, here’s a single consolidated patch for the `beforeEach` (and the ESM-safe `statSync` fix). Apply this and you shouldn’t need to touch anything else:

```diff
@@
-import {
-  mkdirSync,
-  rmSync,
-  writeFileSync,
-  readFileSync,
-  existsSync,
-  readdirSync,
-  mkdtempSync,
-} from "node:fs";
+import {
+  mkdirSync,
+  rmSync,
+  writeFileSync,
+  readFileSync,
+  existsSync,
+  readdirSync,
+  mkdtempSync,
+  chmodSync,
+  statSync,
+} from "node:fs";
@@
   let buildScript;
   let relativeToScript; // GPT-5 approach variable
 
   beforeEach(() => {
     testDir = createTempDir();
     originalCwd = process.cwd();
     originalEnv = { ...process.env };
 
-    // Path to the actual build script
-    buildScript = resolve(process.cwd(), "layers", "build-lambda-layer.sh");
+    // Use a sandbox copy of the build script so ../utils resolves to our mocks
+    const realBuildScript = resolve(process.cwd(), "layers", "build-lambda-layer.sh");
+    const sandboxLayersDir = join(testDir, "layers");
+    mkdirSync(sandboxLayersDir, { recursive: true });
+    const sandboxBuildScript = join(sandboxLayersDir, "build-lambda-layer.sh");
+    writeFileSync(sandboxBuildScript, readFileSync(realBuildScript, "utf8"));
+    try { chmodSync(sandboxBuildScript, 0o755); } catch {}
+    buildScript = sandboxBuildScript;
 
     // GPT-5 APPROACH: Set CREATE_ZIP_UTILITY environment variable to point to our mock
     const mockCreateZipPath = join(testDir, "utils", "create-zip.js");
 
     // CRITICAL: The build script resolves CREATE_ZIP_UTILITY relative to SCRIPT_DIR
     // We need to provide a path that when resolved will point to our mock
-    const buildScriptDir = resolve(process.cwd(), "layers");
-    const relativeToScript = relative(buildScriptDir, mockCreateZipPath);
-    process.env.CREATE_ZIP_UTILITY = relativeToScript;
+    const buildScriptDir = sandboxLayersDir;
+    relativeToScript = relative(buildScriptDir, mockCreateZipPath);
+    process.env.CREATE_ZIP_UTILITY = relativeToScript;
@@
-    mockExecSync.mockImplementation((command, options) => {
+    mockExecSync?.mockImplementation?.((command, options) => {
@@
-          env: {
-            ...(options.env || process.env),
-            CREATE_ZIP_UTILITY: relativeToScript,
-            NODE_MODULES_CACHE: join(testDir, "cache"),
-            HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
-          },
+          env: {
+            ...(options.env || process.env),
+            ...(relativeToScript ? { CREATE_ZIP_UTILITY: relativeToScript } : {}),
+            NODE_MODULES_CACHE: join(testDir, "cache"),
+            HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
+          },
@@
-          env: {
-            ...(options.env || process.env),
-            CREATE_ZIP_UTILITY: relativeToScript,
-            HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
-          },
+          env: {
+            ...(options.env || process.env),
+            ...(relativeToScript ? { CREATE_ZIP_UTILITY: relativeToScript } : {}),
+            HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
+          },
@@
-      const timeoutOptions = {
+      const timeoutOptions = {
         ...options,
         timeout: 5000,
         env: {
           ...(options.env || process.env),
-          CREATE_ZIP_UTILITY: relativeToScript,
+          ...(relativeToScript ? { CREATE_ZIP_UTILITY: relativeToScript } : {}),
           HIC_TEST_TMP_ROOT: TEST_TMP_ROOT,
         },
       };
       return originalExecSync(command, timeoutOptions);
     });
@@
 function sweepStaleUnderRoot() {
   if (!existsSync(TEST_TMP_ROOT)) return;
 
   for (const name of readdirSync(TEST_TMP_ROOT)) {
     const full = join(TEST_TMP_ROOT, name);
     try {
-      const st = readFileSync ? require("fs").statSync(full) : null;
+      const st = readFileSync ? statSync(full) : null;
       if (st) {
         const ageMs = Date.now() - st.mtimeMs;
         if (ageMs > 5 * 60 * 1000) {
           // older than 5 minutes
           rmrf(full);
         }
       }
     } catch {
       /* ignore */
     }
   }
 }
```

> Optional: delete the entire “mock execSync” block to simplify things. It isn’t needed once you pass `env` directly to the one `execSync` that runs the bash script.

---

## Sanity check you can run after the patch

* In the “ZIP Creation” test, temporarily log the script output:

  ```js
  const output = execSync(`bash "${buildScript}"`, { ..., encoding: "utf8" });
  console.log(output);
  ```

  You should see your **mock** zip utility logs:

  ```
  MOCK CREATE-ZIP: Simulating ZIP creation
    Source: ...
    Target: ...
  MOCK CREATE-ZIP: Placeholder file created for test validation
  ```
* In the “noop” test, you should now see:

  ```
  No changes detected
  Skipping build
  ```

If anything still flakes on Windows paths, we can harden the `includes("build-lambda-layer.sh")` check (e.g., `path.basename(command).includes("build-lambda-layer.sh")`) or just remove the `execSync` mock entirely.

---

If you want, paste the first \~50 lines of your real `layers/build-lambda-layer.sh` and I’ll double-check that it indeed resolves `../utils` the way I assumed. But I’m confident the two fixes above (sandbox copy + scoping) will flip all eight failures to green.
