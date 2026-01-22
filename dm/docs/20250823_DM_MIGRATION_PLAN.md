# HIC Dependency Manager (DM) Migration Plan

**Date:** August 23, 2025

## Executive Summary

This plan outlines the recommended restructuring of the `/dm` centralized dependency management system to streamline Lambda layer, mock, and CI/CD dependency access for all HIC microservices. The goal is to reduce dependency bloat, simplify updates, and provide a universal facade for all systems except `/dm` itself.

---

## Current `/dm` Structure (Inferred)

- `/dm/layers/` — Build scripts and possibly source files for layers
- `/dm/dist/` — Built ZIPs for Lambda layers
- `/dm/utils/` — Shared utilities (validation, ZIP helpers)
- `/dm/docs/` — Documentation
- `/dm/facade/` — Facade code (testing, not yet for Lambda layers)
- `/dm/tests/` — Test scripts
- `/dm/versions.env` — Centralized version management

---

## Recommended `/dm` Structure

```
/dm/
  layers/
    base/
      build.sh
      package.json
      *.js (utilities)
    bedrock/
      build.sh
      package.json
    dynamodb/
      build.sh
      package.json
      ...
  dist/
    hic-base-layer.zip
    hic-bedrock-layer.zip
    ...
  utils/
    validate.sh
    create-zip.js
    ...
  facade/
    index.js (universal interface)
    mocks/
      ...
  tests/
    unit/
    integration/
  docs/
    ...
  versions.env
  README.md
```

---

## Actionable Recommendations

1. **Restructure `/layers`**
   - Move each layer’s source files and build script into its own subfolder (e.g., `/dm/layers/base/`, `/dm/layers/bedrock/`).
   - Each subfolder contains source files, `package.json`, and `build.sh`.
2. **Update Build Scripts**
   - Adjust paths in build scripts to reference their local subfolder structure.
   - Output ZIPs to `/dm/dist/`.
3. **Centralize Utilities**
   - Keep shared scripts in `/dm/utils/`.
4. **Facade**
   - Expand `/dm/facade/` to support Lambda layer access (not just mocks).
   - Document how other HIC systems should use the facade.
5. **Testing**
   - Ensure `/dm/tests/` contains unit/integration tests for facade and build logic.
6. **Documentation**
   - Add or update `/dm/README.md` and `/dm/docs/` to explain the structure, usage, and facade pattern.

---

## Summary Table of Changes

| Current Location                     | Recommended Change                    |
| ------------------------------------ | ------------------------------------- |
| `/dm/layers/build-hic-base-layer.sh` | Move to `/dm/layers/base/build.sh`    |
| `/dm/layers/build-bedrock-layer.sh`  | Move to `/dm/layers/bedrock/build.sh` |
| `/dm/layers/*.js`                    | Move to appropriate layer subfolder   |
| `/dm/dist/`                          | Keep as ZIP output directory          |
| `/dm/utils/`                         | Keep as shared utilities              |
| `/dm/facade/`                        | Expand for Lambda layer access        |
| `/dm/tests/`                         | Add/expand for DM system tests        |
| `/dm/docs/`                          | Update for new structure and usage    |
| `/dm/versions.env`                   | Keep for version management           |

---

## Next Steps

1. Restructure `/dm/layers/` into subfolders per layer.
2. Update build scripts for new paths.
3. Expand facade and documentation.
4. Test the new structure with one layer (e.g., base) before migrating others.

---

## Architectural Comments & Suggestions

- **Consistency:** Use the same foldering and packaging convention for all layers.
- **Isolation:** Each layer should be built and versioned independently, but all are managed by `/dm`.
- **Documentation:** Document the folder structure and facade usage clearly for other teams.
- **Extensibility:** As new dependencies are needed, add new layer folders and build scripts—no need to touch other systems.
- **Testing:** Keep a comprehensive test suite in `/dm` to validate all layers and facade helpers.
- **CI/CD:** The facade should expose mocks for CI/CD pipelines, so tests run fast and reliably.

---

**This restructuring will make `/dm` a truly centralized, maintainable, and scalable dependency manager for all HIC systems.**
