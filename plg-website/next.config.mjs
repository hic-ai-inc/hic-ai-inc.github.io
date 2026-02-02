/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,

  // Turbopack config (Next.js 16+ default bundler)
  // Alias HIC layer imports to npm packages at build time
  turbopack: {
    resolveAlias: {
      "hic-auth-layer": "@aws-sdk/client-cognito-identity-provider",
    },
  },

  // Webpack config (fallback for non-Turbopack builds)
  // This allows code to import from 'hic-auth-layer' and have it
  // resolve to the actual npm package at build time
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "hic-auth-layer": "@aws-sdk/client-cognito-identity-provider",
    };
    return config;
  },
};

export default nextConfig;
