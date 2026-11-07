import path from "node:path";
import type { NextConfig } from "next";

// The stub imports the shared packages from ../../packages, so the bundler root is the repository root (as in apps/platform and apps/ops).
const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["*.localhost"],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "X-Frame-Options", value: "DENY" }, { key: "X-Content-Type-Options", value: "nosniff" }] }];
  },
};

export default nextConfig;
