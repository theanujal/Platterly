import { test, expect } from "@playwright/test";
import { activatePaidPlan, cleanupOnboardingTestUser, expireSubscription } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * A kitchen whose trial has run out can sign in but reaches only the "plan ended" screen. Caterly takes no payment itself (AJ, 2026-11-14): the Business Admin
 * renews in the Platterly Store, and /subscribe and /settings/subscription only send people there. Once a payment lands the whole account opens again.
 * Razorpay is not called here, so a landed payment is simulated in the DB.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("an ended trial lands on the plan-ended screen only; the Admin renews in the Store; a payment opens the account again", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-billing-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Bill", lastName: "Payer", phone: "9800000077" });

  // Fresh trial: the app is open. The old billing addresses send the Admin to the Store (the browser's request to the Store is what is checked).
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  for (const path of ["/subscribe", "/settings/subscription"]) {
    const toStore = page.waitForRequest(/store\.localhost:3300\/manage\/caterly/, { timeout: 15_000 });
    await page.goto(path).catch(() => undefined);
    await toStore;
  }
  await page.goto("/dashboard");

  await expireSubscription(email);
  for (const path of ["/dashboard", "/orders", "/settings/account/business-profile", "/inventory"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/plan-ended$/);
  }
  await expect(page.getByTestId("plan-ended-title")).toHaveText("Your free trial has ended");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // The Admin gets a Renew button to the Store; Caterly shows no plans, prices or payment form.
  await expect(page.getByTestId("renew-in-store")).toHaveAttribute("href", /\/manage\/caterly$/);
  await expect(page.getByTestId("price-breakdown")).toHaveCount(0);
  // A locked account has nowhere else to go, so there is no Back.
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

  // A payment lands: everything opens again, and the screen sends an open account back to the dashboard.
  await activatePaidPlan(email, "premium", 30);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/plan-ended");
  await expect(page).toHaveURL(/\/dashboard/);

  // A paid period that has run out locks it again.
  await activatePaidPlan(email, "premium", -8); // past the 7-day grace
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/plan-ended$/);
  await expect(page.getByTestId("plan-ended-title")).toHaveText("Your plan has ended");
});
