import path from "node:path";
import type { NextConfig } from "next";

// Platform sits inside the repository and will import shared packages from ../../packages, so the bundler root is the
// repository root (not this folder), as in apps/ops. Nothing from the catering app itself is imported.
const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["*.localhost"],
  devIndicators: { position: "bottom-right" },
  // The shared platform-contract imports jose, which only this app's own node_modules has when the Platform is installed on its own (CI, deploy.sh platform):
  // a file under ../../packages looks for it beside packages/, not here. (The contract's invoice PDF needs jsPDF; the Platform never uses it, so tsconfig leaves it out.)
  turbopack: { root: repoRoot, resolveAlias: { jose: "./node_modules/jose" } },
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
