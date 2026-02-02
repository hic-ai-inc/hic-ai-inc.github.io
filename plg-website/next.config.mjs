/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,

  // Turbopack config (Next.js 16+ default bundler)
  // Alias HIC layer imports to barrel exports (SDK + HIC utilities)
  // IMPORTANT: Turbopack requires relative paths from project root, NOT absolute paths
  // Absolute paths get treated as "server relative" which aren't supported
  turbopack: {
    resolveAlias: {
      "hic-auth-layer": "../dm/layers/auth/src/index.js",
      "hic-ses-layer": "../dm/layers/ses/src/index.js",
    },
  },

  // Webpack config (fallback for non-Turbopack builds)
  // Webpack handles both relative and absolute paths
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "hic-auth-layer": "../dm/layers/auth/src/index.js",
      "hic-ses-layer": "../dm/layers/ses/src/index.js",
    };
    return config;
  },
};

export default nextConfig;
