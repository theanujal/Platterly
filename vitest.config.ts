import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts"],
    // All test files share one real Postgres DB (no per-test isolated DB).
    // Chunk 3 Group 3.4 added platform-wide aggregate-count queries
    // (getPlatformCounts) — those assertions are only deterministic if no
    // other file is concurrently creating/deleting the same tables.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The real package throws unconditionally outside Next's RSC bundler.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
