import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom (used for article content extraction) has an ESM/CJS-interop
  // transitive dependency chain that breaks when bundled by Turbopack for
  // the serverless runtime — load it natively from node_modules instead.
  serverExternalPackages: ["jsdom"],
};

export default nextConfig;
