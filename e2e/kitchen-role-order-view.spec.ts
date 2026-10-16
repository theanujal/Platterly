import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderWithEvent, setMemberRole } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * The Kitchen Team (AJ, 2026-10-17): sees the Kitchen Dashboard and the orders, opens an order's details read-only, and
 * has no way to create or edit one. (Moving the kitchen stage is covered by the kitchen dashboard specs.)
 */
const emails: string[] = [];
test.afterEach(async () => {
  const email = emails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the kitchen role opens an order's details read-only instead of a 403", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-kitchenview-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email);
  const { orderId, orderNumber } = await seedOrderWithEvent(email);
  await setMemberRole(email, "kitchen");

  await page.goto("/orders");
  await expect(page.getByRole("link", { name: "Create Order" })).toHaveCount(0);
  // Nothing sales-related: no amounts, no Abandoned Orders (customer leads).
  await expect(page.getByText(/Order Amount/)).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Amount" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abandoned Orders" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kitchen Dashboard" })).toBeVisible();

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByTestId("approval-only-order")).toBeVisible();
  await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
  await expect(page.getByTestId("approval-only-banner")).toContainText("view-only for your role");
  await expect(page.getByRole("button", { name: /Save|Edit/ })).toHaveCount(0);

  // Still no way into the pages the role does not have.
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toHaveCount(0);
});
