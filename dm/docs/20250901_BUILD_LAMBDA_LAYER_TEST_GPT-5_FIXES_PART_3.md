You nailed the diagnosis already: those 3 tests are inspecting the build tree **after** `build-lambda-layer.sh` has already deleted it. Your logs even show the build succeeded, then the assertions fail because `build/test-layer/nodejs` no longer exists.

There are two clean, low-friction fixes:

---

# 1) Make cleanup opt-out in the build script (test-friendly)

Add a guard so tests can keep the build tree around briefly:

```bash
# --- Cleanup ---
if [[ "${PRESERVE_BUILD:-0}" != "0" ]]; then
  echo "🧩 PRESERVE_BUILD set; leaving build directory: ${BUILD_DIR}"
else
  rm -rf "${BUILD_DIR}" || echo "⚠️ Warning: Failed to clean up build directory"
fi
```

Now the production behavior is unchanged, and tests that need to peek inside `build/**` can set `PRESERVE_BUILD=1`.

💡 While you’re in that file, fix a subtle `jq` bug that will bite your “package.json structure” test once you preserve the folder. Your current `exports` construction is off. Use this:

```bash
jq -n \
  --arg name "${LAYER_NAME}" \
  --arg ver  "${HIC_LAYER_VERSION}" \
  --arg desc "${LAYER_DESCRIPTION}" \
  --argjson deps "${LAYER_DEPENDENCIES}" \
  --arg main "./hic-utils/index.js" \
  --arg exports "./hic-utils/index.js" \
  '{
     name: $name,
     version: $ver,
     private: true,
     description: $desc,
     type: "module",
     dependencies: $deps,
     main: $main,
     exports: { ".": $exports }
   }' \
  > "${PKG_PATH}"
```

That guarantees `"exports": { ".": "./hic-utils/index.js" }` exactly as your test expects.

---

# 2) Set `PRESERVE_BUILD=1` only for the tests that need it

Update the **three** failing tests to pass the env override in the `execSync` call:

* **“creates correct nodejs directory structure”**
* **“copies src files to nodejs/hic-utils when present”**
* **“generates valid package.json with correct structure”**

For each of those, change:

```js
execSync(`bash "${buildScript}"`, {
  cwd: testDir,
  stdio: "pipe",
  env: process.env,
});
```

to:

```js
execSync(`bash "${buildScript}"`, {
  cwd: testDir,
  stdio: "pipe",
  env: { ...process.env, PRESERVE_BUILD: "1" },
});
```

Leave your “cleans up build directory after ZIP creation” test **as-is** (don’t set `PRESERVE_BUILD`) so it continues to assert the default cleanup behavior.

---

## Why this fixes all 3 failures

* **Dir structure**: with `PRESERVE_BUILD=1`, `build/test-layer/nodejs` still exists when the assertion runs → `existsSync(nodejsDir) === true`.
* **Copy to `hic-utils`**: the copy already happened (your logs show it). The directory only looked missing due to cleanup. Preserving the build dir makes the assertion pass.
* **package.json structure**: once preserved, the test will actually read the file; fixing the `jq` `exports` mapping ensures it matches `{ ".": "./hic-utils/index.js" }`.

---

## Two tiny polish items (optional but nice)

1. In your test helper `sweepStaleUnderRoot()` you have a stray conditional:

```js
const st = readFileSync ? statSync(full) : null;
```

That `readFileSync ?` is a typo. Make it:

```js
const st = statSync(full);
```

inside the try/catch.

2. If you want to shave a couple seconds from runs that install a small dep (e.g., lodash), point npm’s cache into your sandbox so subsequent tests reuse it:

```js
env: {
  ...process.env,
  PRESERVE_BUILD: "1",
  npm_config_cache: join(testDir, ".npm-cache"),
}
```

(No change to the script needed; npm honors this automatically.)

---

## TL;DR

* Your tests are correct to assert structure, but they look **after** the script’s auto-cleanup.
* Add `PRESERVE_BUILD` to the script’s cleanup step (shown above).
* Pass `PRESERVE_BUILD=1` in the 3 structure/metadata tests.
* Fix the `jq` `exports` object so the package.json assertion is exact.

If you want, paste back the three updated `execSync` call sites and I’ll sanity-check them line-by-line.
