import { test, expect } from "@playwright/test";
import { activatePaidPlan, cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Settings, Subscription: a monthly plan offers "Renew or upgrade plan"; a yearly plan is paid once for the whole year,
 * so the button is greyed out and /subscribe is not reachable, until its last 30 days, when both open for renewal.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("a yearly plan greys out the plan button, and /subscribe sends it back to Settings", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-planbtn-annual-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Year", lastName: "Payer", phone: "9800000081" });
  await activatePaidPlan(email, "premium", 365, "ANNUAL");

  await page.goto("/settings/subscription");
  const button = page.getByTestId("manage-plan");
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();

  await page.goto("/subscribe");
  await expect(page).toHaveURL(/\/settings\/subscription/);
});

test("a yearly plan in its last 30 days opens the plan button and /subscribe", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-planbtn-renew-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Soon", lastName: "Payer", phone: "9800000083" });
  await activatePaidPlan(email, "premium", 20, "ANNUAL");

  await page.goto("/settings/subscription");
  const button = page.getByTestId("manage-plan");
  await expect(button).toBeEnabled();
  await expect(button).toHaveText(/renew/i);
  await button.click();
  await expect(page).toHaveURL(/\/subscribe/);

  await page.goto("/subscribe");
  await expect(page).toHaveURL(/\/subscribe/);
});

test("a monthly plan offers Upgrade plan", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-planbtn-monthly-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Month", lastName: "Payer", phone: "9800000082" });
  await activatePaidPlan(email, "premium", 30, "MONTHLY");

  await page.goto("/settings/subscription");
  const button = page.getByTestId("manage-plan");
  await expect(button).toHaveText(/upgrade plan/i);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/subscribe/);
});
