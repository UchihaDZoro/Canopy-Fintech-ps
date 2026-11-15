import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes read the pipeline output from disk at runtime (fs.readFileSync),
  // so serverless bundles must ship it alongside the functions.
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/data/generated/**/*"],
  },
};

export default nextConfig;
