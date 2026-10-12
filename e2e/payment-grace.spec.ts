import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, setPaidPeriodEnded } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Payment grace (AJ, 2026-10-12): a paid plan whose period ended keeps working for 7 days with a warning box (the day it
 * ends, a Renew button), then the kitchen is locked to the payment page. Follows the Refund policy page.
 */

const emails: string[] = [];
test.afterEach(async () => {
  const e = emails.pop();
  if (e) await cleanupOnboardingTestUser(e);
});

test("2 days after the period ended: open, with a Payment overdue box and 5 days left; after 8 days: locked to /subscribe", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-grace-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email, { firstName: "Grace", lastName: "Tester", phone: "9800000052" });

  await setPaidPeriodEnded(email, 2);
  await page.goto("/dashboard");
  const box = page.getByTestId("grace-card");
  await expect(box).toBeVisible();
  await expect(box).toContainText("Payment overdue");
  await expect(box).toContainText("Renew within 5 days");
  await expect(box.getByRole("button", { name: "Renew now" }).or(box.getByRole("link", { name: "Renew now" }))).toBeVisible();
  // Everything still works: the page is the real dashboard, not the payment page.
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/orders/);

  // Past the 7 days: locked to the payment page, no grace box.
  await setPaidPeriodEnded(email, 8);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/subscribe/);
  await expect(page.getByTestId("grace-card")).toHaveCount(0);
});
