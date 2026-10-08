import path from "node:path";
import type { NextConfig } from "next";

// Ops sits inside the catering repository and imports the shared contract from ../../packages/contract, so the
// bundler root is the repository root (not this folder). Nothing from the catering app itself is imported.
const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["*.localhost"],
  devIndicators: { position: "bottom-right" },
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async rewrites() {
    // The editor shows pictures as /uploads/<name>, the address the live site uses; in Ops they come from the library.
    return [{ source: "/uploads/:name", destination: "/api/site/media/:name" }];
  },
  async headers() {
    // Ops is never indexed and never framed.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
