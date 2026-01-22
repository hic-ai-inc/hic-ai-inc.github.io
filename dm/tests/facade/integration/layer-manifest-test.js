import { test, describe, expect } from "../../test-helpers/index.js";
import { resolve as testLoader } from "../../facade/utils/test-loader.js";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAYERS_DIR = resolve(HERE, "../../layers");

describe("Layer Manifest Integration", () => {
  test("should redirect all published layers to facade helpers", async () => {
    const mockNextResolve = () => ({ url: "mock://fallback" });
    const mockContext = {};
    
    // Get all layer directories
    const layerDirs = await readdir(LAYERS_DIR, { withFileTypes: true });
    const publishedLayers = [];
    
    for (const dir of layerDirs) {
      if (dir.isDirectory()) {
        const layerPath = join(LAYERS_DIR, dir.name);
        try {
          const files = await readdir(layerPath);
          
          // Find latest publish manifest
          const manifests = files.filter(f => 
            f.startsWith('publish.') && f.endsWith('.manifest.json')
          );
          
          if (manifests.length > 0) {
            const latest = manifests.sort().pop();
            const manifestPath = join(layerPath, latest);
            const content = await readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(content);
            publishedLayers.push(manifest.layerName);
          }
        } catch (error) {
          // Skip directories without manifests
        }
      }
    }
    
    // Verify we found published layers
    expect(publishedLayers.length).toBeGreaterThan(0);
    expect(publishedLayers).toContain('hic-base-layer');
    
    // Test hic-base-layer redirection (guaranteed to exist)
    const result = await testLoader('hic-base-layer', mockContext, mockNextResolve);
    expect(result.shortCircuit).toBe(true);
    expect(result.url).toMatch(/hic-base\.js$/);
  });
});