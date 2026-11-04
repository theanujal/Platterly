import path from "node:path";
import type { NextConfig } from "next";

// Platform sits inside the repository and will import shared packages from ../../packages, so the bundler root is the
// repository root (not this folder), as in apps/ops. Nothing from the catering app itself is imported.
const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["*.localhost"],
  devIndicators: { position: "bottom-right" },
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async headers() {
    // Not indexed and never framed; sign-in pages must not be embeddable.
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
