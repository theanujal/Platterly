import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedApprovedOrderForShare } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Once the customer has approved the menu, the order's Customer Details, Event Information, Guest Information and Pricing are all
 * read-only (AJ, 2026-10-17): no Edit buttons, one notice that says so, and the pricing fields cannot be changed.
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("after the customer approves the menu, customer, event, guests and pricing are read-only", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-readonly-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Read", lastName: "Only", phone: "9800000081" });
  const { orderId } = await seedApprovedOrderForShare(email, { stage: "VENUE" }); // approved by the customer, venue details not in yet

  await page.goto(`/orders/${orderId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByTestId("order-frozen-banner")).toContainText("The customer has approved the menu");
  await expect(page.getByTestId("order-frozen-banner")).toContainText("Customer details, event information, guests and pricing");
  await expect(page.getByRole("button", { name: "Edit customer details" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit event information" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit guest information" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.locator("#order-panel-pricing").getByRole("switch", { name: "Individual / Custom Pricing" })).toBeDisabled();
});
