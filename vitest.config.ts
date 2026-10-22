import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "packages/**/*.test.ts"],
    // All test files share one real Postgres DB (no per-test isolated DB).
    // Chunk 3 Group 3.4 added platform-wide aggregate-count queries
    // (getPlatformCounts) — those assertions are only deterministic if no
    // other file is concurrently creating/deleting the same tables.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Kept out of the index so jsPDF never reaches a browser bundle; listed first so the shorter alias does not catch it.
      "@platterly/contract/plan-invoice-pdf": path.resolve(__dirname, "./packages/contract/src/plan-invoice-pdf.ts"),
      "@platterly/contract": path.resolve(__dirname, "./packages/contract/index.ts"),
      // The real package throws unconditionally outside Next's RSC bundler.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
