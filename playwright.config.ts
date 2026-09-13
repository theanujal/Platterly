import { defineConfig, devices } from "@playwright/test";

// Local-only for now (AJ's explicit choice) — not wired into CI, which
// would need the app built+started plus browser binaries in the runner.
// Runs against the real dev Postgres DB, same convention as the Vitest
// suite (no mocking, no separate test DB) — specs are responsible for their
// own cleanup, same as `afterEach` in the Vitest tests.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Headed local runs are meant to be watched — one browser window at a
  // time, not five at once. CI (if ever wired in) keeps default parallelism.
  workers: process.env.CI ? undefined : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // AJ wants to actually watch these run, not just see screenshots after
    // the fact — headed + a bit of slowMo so actions are visible in real
    // time. Revisit (headless in CI) if this ever gets wired into CI.
    headless: !!process.env.CI,
    launchOptions: { slowMo: process.env.CI ? 0 : 350 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
