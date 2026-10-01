import { defineConfig, devices } from "@playwright/test";

// Local-only for now (AJ's explicit choice) — not wired into CI, which
// would need the app built+started plus browser binaries in the runner.
// Runs against the real dev Postgres DB, same convention as the Vitest
// suite (no mocking, no separate test DB) — specs are responsible for their
// own cleanup, same as `afterEach` in the Vitest tests.
// Two ways to run locally (AJ, 2026-10-01: the default is now the fast one, about 1 minute for the full suite):
//   npm run test:e2e         headless, no slowMo, 4 workers
//   npm run test:e2e:headed  PW_HEADED=1: headed, slowMo 350, one window at a time, for watching a run live
// Every spec signs up its own throwaway caterer, so specs don't share data and can run in parallel.
const fast = !process.env.PW_HEADED;
const headless = !!process.env.CI || fast;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Headed local runs are meant to be watched — one browser window at a
  // time, not five at once. CI (if ever wired in) keeps default parallelism.
  workers: fast ? 4 : process.env.CI ? undefined : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // "list" prints each test and its time in the terminal; the HTML report is still written but never auto-opened (it used to hang the terminal on a failure).
  reporter: [["list"], ["html", { open: "never" }]],
  // Four workers share one dev server that compiles each page on first visit, so the default
  // 5s assertion wait is too tight in fast mode (two specs flaked on it). Headed runs keep 5s.
  expect: { timeout: fast ? 15_000 : 5_000 },
  use: {
    // PW_BASE_URL points the suite at a production-like rehearsal (see PW_RESOLVE) instead of the dev server.
    baseURL: process.env.PW_BASE_URL ?? "http://catering.localhost:3000",
    ignoreHTTPSErrors: !!process.env.PW_BASE_URL,
    trace: "on-first-retry",
    // AJ wants to actually watch these run, not just see screenshots after
    // the fact — headed + a bit of slowMo so actions are visible in real
    // time. Revisit (headless in CI) if this ever gets wired into CI.
    headless,
    launchOptions: {
      slowMo: headless ? 0 : 350,
      // Rehearsal only: map the fake production domain to this machine, e.g. "MAP *.platterly.test 127.0.0.1".
      args: process.env.PW_RESOLVE ? [`--host-resolver-rules=${process.env.PW_RESOLVE}`] : [],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PW_BASE_URL ? undefined : {
    command: "npm run dev",
    url: "http://catering.localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
