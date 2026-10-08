import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** Smoke tests for the built marketing site: `npm run build` first, then `npm run test:e2e` (runs from the repo root, using its Playwright). */
export default defineConfig({
  testDir: ".",
  testMatch: "site.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  webServer: { command: "python3 -m http.server 3300 --directory out", cwd: path.resolve(__dirname, ".."), url: "http://localhost:3300/", reuseExistingServer: true, timeout: 30_000 },
  use: { baseURL: "http://localhost:3300", ...devices["Desktop Chrome"] },
});
