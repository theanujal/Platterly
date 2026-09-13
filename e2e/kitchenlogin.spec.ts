import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, getTrialSubscriptionStatus, closeDbPool } from "./db";

/**
 * Chunk 4 — first real Playwright coverage in the repo. Runs against the
 * real dev Postgres DB (same convention as the Vitest suite, no mocking);
 * each test cleans up the account/org it creates in `afterEach`.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test.afterAll(async () => {
  await closeDbPool();
});

test("sign up, complete the onboarding wizard, sign out, and sign back in", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const businessName = "Playwright Test Catering";

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Full name").fill("Priya Sharma");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  // Session exists, no org yet — the wizard should render.
  await expect(page.getByText("Step 1 of 5")).toBeVisible();

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
  await expect(page.getByText(`You're all set, ${businessName}!`)).toBeVisible({ timeout: 10_000 });

  // Confirm the trial subscription was actually created, not just the UI text.
  expect(await getTrialSubscriptionStatus(email)).toBe("TRIALING");

  // Sign out, then sign back in — a fresh session has no active org until
  // page.tsx restores it from the existing Member row (see the Group 4.1
  // fix); this proves that restoration path renders the right screen.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in to your account" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in to your account" }).click();

  await expect(page.getByText(`You're all set, ${businessName}!`)).toBeVisible();
});

test("sign-in with the wrong password shows an inline error, not a crash", async ({ page }) => {
  await page.goto("/kitchenlogin");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in to your account" }).click();

  // Next.js's own route announcer (#__next-route-announcer__) is also
  // role="alert", so a bare role query is ambiguous — scope to our own
  // error <p> by its actual text.
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});
