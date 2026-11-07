import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"], fileParallelism: false },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@platterly/platform-contract": path.resolve(__dirname, "../../packages/platform-contract/index.ts"),
      "@platterly/contract": path.resolve(__dirname, "../../packages/contract/index.ts"),
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
