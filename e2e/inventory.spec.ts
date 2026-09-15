import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 7 — Inventory (Basic). Signs up a fresh throwaway account, skips
 * onboarding, then drives the real Add Item -> Stock In/Out -> Edit -> Low
 * Stock -> Delete flow against the real dev DB and browser. `stockCount` is
 * never edited directly (Edit form has no stock field) — every change goes
 * through the Stock Movement popup, proving `recordStockTransaction` is the
 * only path that ever moves it (see `dev plans/chunk-07-inventory-basic.md`
 * Group 7.1's Verify line).
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create an inventory item with opening stock, record stock in/out, edit metadata, trigger low stock, then delete", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = `e2e-inventory-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Inventory");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // A fresh account's Dashboard auto-opens the "Claim your custom link"
  // dialog, which overlays the whole page (including the sidebar) until
  // dismissed.
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("link", { name: "Inventory" }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();

  // --- Add Item with an opening stock, via the "Add Item" popup ---
  const itemName = `Basmati Rice ${suffix}`;
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Category").fill("Grains");
  await page.getByLabel("Unit", { exact: true }).fill("kg");
  await page.getByLabel("Opening Stock").fill("50");
  await page.getByLabel("Low Stock Alert").fill("20");
  await page.getByLabel("Cost Per Unit").fill("40");
  await page.getByLabel("Storage Location").fill("Dry Store A");
  await page.getByRole("button", { name: "Create item" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(itemName)).toBeVisible();
  await expect(page.getByText("50 kg")).toBeVisible();
  await expect(page.getByText("In Stock", { exact: true }).first()).toBeVisible();

  // --- Stock Out below the low-stock threshold (20) ---
  await page.getByRole("button", { name: `Record stock movement for ${itemName}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Current stock:")).toBeVisible();
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Stock Out" }).click();
  await page.getByLabel(/Quantity/).fill("35");
  await page.getByLabel("Note").fill("Used for a catering order");
  await page.getByRole("button", { name: "Record movement" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await expect(page.getByText("15 kg")).toBeVisible();
  await expect(page.getByText("Low Stock", { exact: true }).first()).toBeVisible();

  // --- Stock Out past zero is rejected, with stock unchanged ---
  await page.getByRole("button", { name: `Record stock movement for ${itemName}` }).click();
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Stock Out" }).click();
  await page.getByLabel(/Quantity/).fill("1000");
  await page.getByRole("button", { name: "Record movement" }).click();
  await expect(page.getByText("This would take stock below zero.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("15 kg")).toBeVisible();

  // --- Edit metadata (no stock field on this form) ---
  await page.getByRole("button", { name: `Edit ${itemName}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Item Name")).toHaveValue(itemName);
  await expect(page.getByLabel("Opening Stock")).toHaveCount(0);
  await page.getByLabel("Storage Location").fill("Dry Store B");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Dashboard's Inventory Overview card reflects the real data ---
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // A full navigation to /dashboard re-opens the "Claim your custom link"
  // dialog every time (defaultOpen while slugChangeCount stays 0) — close
  // it again before interacting with anything else.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Inventory Overview")).toBeVisible();
  await expect(page.getByText("₹600.00")).toBeVisible(); // 15kg * ₹40

  // --- Delete ---
  await page.getByRole("link", { name: "Inventory" }).click();
  await page.getByRole("button", { name: `Delete ${itemName}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(itemName)).not.toBeVisible();
});
