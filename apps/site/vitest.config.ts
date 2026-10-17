import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for pure site code (no browser): cd apps/site && npx vitest run
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
