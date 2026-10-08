import path from "node:path";
import type { NextConfig } from "next";

// A fully static site: `next build` writes plain files to `out/`, which Nginx serves on platterly.in.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // This app sits inside the catering repository; pin its root here so Next never picks up the catering app's files.
  turbopack: { root: path.resolve(__dirname) },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
