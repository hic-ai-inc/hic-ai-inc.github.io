import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths and convert to forward slashes for Turbopack compatibility
const authLayerPath = resolve(__dirname, "../dm/layers/auth/src/index.js").replace(/\\/g, "/");
const sesLayerPath = resolve(__dirname, "../dm/layers/ses/src/index.js").replace(/\\/g, "/");

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,

  // Turbopack config (Next.js 16+ default bundler)
  // Alias HIC layer imports to barrel exports (SDK + HIC utilities)
  turbopack: {
    resolveAlias: {
      "hic-auth-layer": authLayerPath,
      "hic-ses-layer": sesLayerPath,
    },
  },

  // Webpack config (fallback for non-Turbopack builds)
  // This allows code to import from 'hic-*-layer' and have it
  // resolve to the dm/layers barrel exports at build time
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "hic-auth-layer": authLayerPath,
      "hic-ses-layer": sesLayerPath,
    };
    return config;
  },
};

export default nextConfig;
