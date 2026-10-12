import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderForBilling, setOrderEventPast } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Overdue payments (AJ, 2026-10-12): calculated, never stored, and a Finance job. Finance -> Overdue Payments lists
 * orders whose event is over while money is still owed (cancelled and upcoming ones are left out), with a Record
 * payment shortcut; recording the full balance drops the order. The order page shows an Overdue badge.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("Finance -> Overdue Payments lists overdue orders, record payment from the list, cancelled and upcoming left out", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-overdue-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Overdue", lastName: "Tester", phone: "9800000077" });

  const overdue = await seedOrderForBilling(email, 20000);
  const second = await seedOrderForBilling(email, 8000);
  const cancelled = await seedOrderForBilling(email, 10000);
  const upcoming = await seedOrderForBilling(email, 5000);
  await setOrderEventPast(overdue.orderId, 3);
  await setOrderEventPast(second.orderId, 1);
  await setOrderEventPast(cancelled.orderId, 3, "CANCELLED");

  // Orders no longer carries a payment filter, and finished events stay out of it.
  await page.goto("/orders");
  await expect(page.getByText(upcoming.orderNumber).first()).toBeVisible();
  await expect(page.getByText(overdue.orderNumber)).toHaveCount(0);
  await expect(page.getByLabel("Payment filter")).toHaveCount(0);

  // The Finance tab lists the two overdue orders with the totals; cancelled and upcoming are absent.
  await page.goto("/profitability");
  await page.getByRole("link", { name: "Overdue Payments" }).click();
  await expect(page).toHaveURL(/\/overdue-payments/);
  await expect(page.getByTestId("overdue-count")).toHaveText("2");
  await expect(page.getByTestId("overdue-total")).toHaveText("₹28,000.00");
  await expect(page.getByTestId("overdue-longest")).toHaveText("3 days overdue");
  await expect(page.getByText(overdue.orderNumber).first()).toBeVisible();
  await expect(page.getByText(second.orderNumber).first()).toBeVisible();
  await expect(page.getByText(cancelled.orderNumber)).toHaveCount(0);
  await expect(page.getByText(upcoming.orderNumber)).toHaveCount(0);

  // Record the full balance from the list: the order drops off.
  await page.getByRole("button", { name: `Record payment for ${second.orderNumber}` }).click();
  await page.getByRole("button", { name: "Record Only" }).click();
  await expect(page.getByTestId("overdue-count")).toHaveText("1");
  await expect(page.getByTestId("overdue-total")).toHaveText("₹20,000.00");
  await expect(page.getByText(second.orderNumber)).toHaveCount(0);

  // The order page's payment summary carries the badge; the upcoming order's does not.
  await page.goto(`/orders/${overdue.orderId}`);
  await page.getByRole("tab", { name: /Pricing/ }).click();
  await expect(page.getByTestId("payment-overdue")).toBeVisible();
  await page.goto(`/orders/${upcoming.orderId}`);
  await page.getByRole("tab", { name: /Pricing/ }).click();
  await expect(page.getByTestId("payments-panel")).toBeVisible();
  await expect(page.getByTestId("payment-overdue")).toHaveCount(0);
});
