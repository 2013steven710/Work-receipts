import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  reactStrictMode: true,
  // A self-contained server build for the container (Dockerfile.web).
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@claimtidy/core"],
  // Shared packages use NodeNext-style imports ("./money.js" for money.ts); webpack maps them.
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return webpackConfig;
  },
};

export default config;
