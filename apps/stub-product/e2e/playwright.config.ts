import { defineConfig, devices } from "@playwright/test";

/**
 * Stub product end-to-end test (F6.3.3, checkpoint IC2). It drives a real browser across the Platform (account.localhost:3300, auth.localhost:3300) and the
 * stub product (stub.localhost:3500). Both dev servers and the mail sink (3600) must already be running (Platform: ~/.platterly/f4dev/dev.sh, stub:
 * ~/.platterly/f4dev/stub-dev.sh); the shell needs the stub's settings: `source ~/.platterly/f4dev/stub-env.sh`. Run from the repo root:
 *   npx playwright test -c apps/stub-product/e2e/playwright.config.ts
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  use: { baseURL: "http://stub.localhost:3500", ...devices["Desktop Chrome"], headless: !!process.env.CI || !process.env.PW_HEADED },
});
