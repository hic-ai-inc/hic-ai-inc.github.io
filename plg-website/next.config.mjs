/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,

  // Webpack config to alias HIC layer imports to npm packages
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
