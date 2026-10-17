import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** The Ops-fed site tests: `npm run test:e2e:ops-fed` builds the site from e2e/fixtures/ops-bundle.json first (scripts/test-ops-fed.mjs). */
export default defineConfig({
  testDir: ".",
  testMatch: "ops-fed.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  webServer: { command: "python3 -m http.server 3301 --directory out", cwd: path.resolve(__dirname, ".."), url: "http://localhost:3301/", reuseExistingServer: false, timeout: 30_000 },
  use: { baseURL: "http://localhost:3301", ...devices["Desktop Chrome"] },
});
