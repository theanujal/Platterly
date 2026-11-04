import { defineConfig, devices } from "@playwright/test";

/**
 * Platform end-to-end test. Run from the repo root (it uses the root Playwright): `npx playwright test -c apps/platform/e2e/playwright.config.ts`.
 * It starts (or reuses) the Platform dev server on 3300. The Account prototype needs no database, sign-in or secrets.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  webServer: { command: "npm --prefix apps/platform run dev", url: "http://account.localhost:3300/api/health", reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: "http://account.localhost:3300", ...devices["Desktop Chrome"], headless: !!process.env.CI || !process.env.PW_HEADED },
});
