import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, getTrialSubscriptionStatus } from "./db";

/**
 * Chunk 4 — first real Playwright coverage in the repo. Runs against the
 * real dev Postgres DB (same convention as the Vitest suite, no mocking);
 * each test cleans up the account/org it creates in `afterEach`.
 *
 * Chunk 5 — deliberately does NOT call `closeDbPool()`: `db.ts`'s pool is a
 * shared module singleton across every spec file in this Playwright worker
 * process (`workers: 1`), and closing it here (this file ran first) left it
 * dead for every spec file that ran afterward, breaking their own db calls.
 * A short-lived test-runner process doesn't need a graceful pool shutdown —
 * the OS reclaims the connections when the process exits.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("sign up, complete the onboarding wizard, sign out, and sign back in", async ({ page }) => {
  // Longer than the 30s default: the full 5-step wizard + sign-out/sign-in
  // round trip, each action slowed by launchOptions.slowMo (350ms, AJ's
  // standing "watch it run" preference), plus the Chunk 6 sidebar shell
  // added real hydration weight to every /dashboard visit this test makes.
  test.setTimeout(60_000);
  const email = `e2e-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const businessName = "Playwright Test Catering";

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Priya Sharma");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();

  // Organization is already provisioned at signup — the wizard is reached
  // by an explicit client-side redirect to its own route, not by a
  // server-side "no org yet" check.
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Priya Sharma");
  await expect(page.getByLabel("Full name")).toBeDisabled();

  await page.getByLabel("Company / business name").fill(businessName);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();

  await page.getByRole("button", { name: "Complete Setup" }).click();
  await expect(page.getByText("Your Platterly account is ready!")).toBeVisible({ timeout: 10_000 });

  // Confirm the trial subscription was actually created, not just the UI text.
  expect(await getTrialSubscriptionStatus(email)).toBe("TRIALING");

  await page.getByRole("button", { name: "Take me to my Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // A brand-new org has never claimed a custom link (slugChangeCount === 0),
  // so the Dashboard's custom-link popup auto-opens on this first visit —
  // dismiss it (it reappears on the *next* visit, by design) before
  // checking anything else. While it's open, the modal correctly marks the
  // rest of the page aria-hidden (confirmed accessible-dialog behavior), so
  // role-based queries against the page behind it won't resolve until it's
  // closed — check the heading only after dismissing.
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: `Welcome back, ${businessName}` })).toBeVisible();

  // Sign out, then sign back in — a fresh session has no active org until
  // requireActiveOrganization() restores it from the existing Member row;
  // this proves that restoration path lands on the Dashboard directly,
  // never back at the onboarding wizard.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in to your account" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in to your account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  // The custom-link popup still hasn't been satisfied, so it reopens here
  // too — dismiss it before checking the heading behind it (see above).
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: `Welcome back, ${businessName}` })).toBeVisible();
});

test("sign-in with the wrong password shows an inline error, not a crash", async ({ page }) => {
  await page.goto("/kitchenlogin");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in to your account" }).click();

  // Next.js's own route announcer (#__next-route-announcer__) is also
  // role="alert", so a bare role query is ambiguous — scope to our own
  // error <p> by its actual text.
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});
