import { defineConfig, devices } from "@playwright/test";

/**
 * Ops end-to-end test. Run from the repo root (it uses the root Playwright): `npx playwright test -c apps/ops/e2e/playwright.config.ts`.
 * It starts (or reuses) the ops dev server on 3200 against the ops database in apps/ops/.env and cleans up after itself.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /(ops|site|switcher|businesses|editor|library)\.spec\.ts/,
  workers: 1,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  webServer: { command: "npm --prefix apps/ops run dev", url: "http://ops.localhost:3200/api/health", reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: "http://ops.localhost:3200", ...devices["Desktop Chrome"], headless: !!process.env.CI || !process.env.PW_HEADED },
});
