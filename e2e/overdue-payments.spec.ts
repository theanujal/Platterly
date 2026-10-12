import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderForBilling, setOrderEventPast } from "./db";
import { signUpCaterer, selectOption } from "./auth-helpers";

/**
 * Overdue payments (AJ, 2026-10-12): calculated, never stored. An order whose event is over while money is still
 * owed shows an Overdue badge on its card, in the list and on the order page, and the Orders "Overdue Payments"
 * filter finds it even though finished events are normally hidden. Cancelled orders are excluded.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("overdue badge on the card, list and order page, found by the Overdue Payments filter; cancelled excluded", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-overdue-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Overdue", lastName: "Tester", phone: "9800000077" });

  const overdue = await seedOrderForBilling(email, 20000);
  const cancelled = await seedOrderForBilling(email, 10000);
  const upcoming = await seedOrderForBilling(email, 5000);
  await setOrderEventPast(overdue.orderId, 3);
  await setOrderEventPast(cancelled.orderId, 3, "CANCELLED");

  // Finished events are hidden from the normal Orders page.
  await page.goto("/orders");
  await expect(page.getByText(upcoming.orderNumber).first()).toBeVisible();
  await expect(page.getByText(overdue.orderNumber)).toHaveCount(0);

  // The Overdue Payments filter shows the overdue order only, with the badge and the overdue amount.
  await selectOption(page, page.getByLabel("Payment filter"), "Overdue Payments");
  await expect(page).toHaveURL(/payment=overdue/);
  await expect(page.getByText(overdue.orderNumber).first()).toBeVisible();
  await expect(page.getByText("Overdue", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "₹20,000.00 Overdue" })).toBeVisible();
  await expect(page.getByText(cancelled.orderNumber)).toHaveCount(0);
  await expect(page.getByText(upcoming.orderNumber)).toHaveCount(0);

  // The order page's payment summary carries the badge; the upcoming order's does not.
  await page.goto(`/orders/${overdue.orderId}`);
  await page.getByRole("tab", { name: /Pricing/ }).click();
  await expect(page.getByTestId("payment-overdue")).toBeVisible();
  await page.goto(`/orders/${upcoming.orderId}`);
  await page.getByRole("tab", { name: /Pricing/ }).click();
  await expect(page.getByTestId("payments-panel")).toBeVisible();
  await expect(page.getByTestId("payment-overdue")).toHaveCount(0);
});
