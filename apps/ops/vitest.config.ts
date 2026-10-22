import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts"],
    // Tests share one real Postgres database, so files run one after another.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@platterly/contract/plan-invoice-pdf": path.resolve(__dirname, "../../packages/contract/src/plan-invoice-pdf.ts"),
      "@platterly/contract": path.resolve(__dirname, "../../packages/contract/index.ts"),
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
