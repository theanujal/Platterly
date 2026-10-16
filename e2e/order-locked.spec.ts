import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedApprovedOrderForShare, setOrderStatus } from "./db";
import { signUpCaterer } from "./auth-helpers";
import { openOrderStatusHistory } from "./approval-helpers";

/**
 * A sent order is final, a completed order is closed (AJ, 2026-10-14). Sent to Kitchen: the order's own fields are read-only,
 * payments and the status card still work. Completed: nothing changes, not even the status; payments still work.
 */
const emails: string[] = [];
test.afterEach(async () => { const e = emails.pop(); if (e) await cleanupOnboardingTestUser(e); });

test("Sent to Kitchen: fields read-only; Completed: closed completely; payments stay open; no Payment Details card on an existing order", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-orderlock-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email);
  const { orderId } = await seedApprovedOrderForShare(email);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Approved: editable, and the old Payment Details card is gone from an existing order.
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByTestId("order-locked-banner")).toHaveCount(0);
  await page.getByRole("tab", { name: "Guests & Event Info" }).click();
  await expect(page.getByRole("button", { name: "Edit event information" })).toBeEnabled();
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByRole("heading", { name: "Payment Details" })).toHaveCount(0);
  await expect(page.getByLabel("Advance Received")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record Payment" })).toBeVisible();

  // Sent to the kitchen: read-only fields, payments and the status control still there.
  await setOrderStatus(orderId, "SENT_TO_KITCHEN");
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByTestId("order-locked-banner")).toContainText("Sent to the kitchen");
  await page.getByRole("tab", { name: "Guests & Event Info" }).click();
  await expect(page.getByRole("button", { name: "Edit event information" })).toHaveCount(0); // details only once with the kitchen
  await page.getByRole("tab", { name: "Order Details" }).click();
  await openOrderStatusHistory(page); // the status control is in the sidebar card's drawer
  await expect(page.getByRole("combobox", { name: "Change status" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByRole("spinbutton", { name: "Transportation Cost" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Record Payment" })).toBeVisible();
  await page.getByRole("tab", { name: "Expenses" }).click(); // the kitchen's own work (expenses, staffing, inventory) stays open until the order is completed
  await expect(page.getByRole("button", { name: /Add Expense/ })).toBeEnabled();

  // Completed: closed completely. No status change, the tabs are read-only, payments still open.
  await setOrderStatus(orderId, "COMPLETED");
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByTestId("order-locked-banner")).toContainText("Completed");
  await expect(page.getByTestId("order-locked-banner")).not.toContainText("change the status");
  await page.getByRole("tab", { name: "Guests & Event Info" }).click();
  await expect(page.getByRole("button", { name: "Edit event information" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Change status" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Expenses" }).click();
  await expect(page.getByTestId("order-locked-fields").getByRole("button", { name: /Add Expense/ })).toBeDisabled();
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByRole("button", { name: "Record Payment" })).toBeVisible();
});
