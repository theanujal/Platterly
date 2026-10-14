import { test, expect } from "@playwright/test";
import { editInventoryItem, stockIn } from "./inventory-helpers";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

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

test("create an inventory item (no opening stock), add stock, record stock in/out, edit metadata, trigger low stock, then delete", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = `e2e-inventory-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Inventory", lastName: "Tester", closeClaimDialog: false });

  // A fresh account's Dashboard auto-opens the "Create Your Custom Link"
  // dialog, which overlays the whole page (including the sidebar) until
  // dismissed.
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("link", { name: "Stock & Supplies", exact: true }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("heading", { name: "Stock & Supplies", exact: true })).toBeVisible();

  // --- Add Item with an opening stock, via the "Add Item" drawer ---
  const itemName = `Basmati Rice ${suffix}`;
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(itemName);
  // Category is a dropdown now (AJ, 2026-09-30).
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  // Unit is a dropdown now, not free text (AJ, 2026-09-19).
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  // The New Inventory Item form has no Opening Stock, Cost Per Unit, Expiry Date or Supplier.
  for (const gone of ["Opening Stock", "Cost Per Unit", "Expiry Date", "Supplier"]) await expect(page.getByLabel(gone, { exact: true })).toHaveCount(0);
  // The low stock alert has to suit the unit: a weight may have decimals, a counted unit may not.
  await page.getByLabel("Low Stock Alert").fill("20");
  await page.getByLabel("Default Storage Location").fill("Dry Store A");
  await page.getByRole("button", { name: "Create item" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(itemName)).toBeVisible();
  // List view (the default) has a Status column, so the stock-status badge is visible here (AJ, 2026-09-30).
  await expect(page.getByText(itemName)).toBeVisible();
  // Creating an item adds no stock and no stock movement: it starts at 0 until a Stock In is recorded.
  await expect(page.getByText("0 kg")).toBeVisible();
  await expect(page.getByText("Out of Stock", { exact: true }).first()).toBeVisible();
  await stockIn(page, itemName, "50");
  await editInventoryItem(page, itemName, { cost: "40" });
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
  // Closing with the 1000 still typed asks first (the unsaved-edit guard).
  await page.getByRole("alertdialog", { name: "Discard your changes?" }).getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("15 kg")).toBeVisible();

  // --- Edit metadata (no stock field on this form) ---
  await page.getByRole("button", { name: `Edit ${itemName}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Item Name")).toHaveValue(itemName);
  await expect(page.getByLabel("Opening Stock")).toHaveCount(0);
  await page.getByLabel("Default Storage Location").fill("Dry Store B");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Dashboard's Inventory Overview card reflects the real data ---
  // .first() — the sidebar's own "Dashboard" link, not the page's breadcrumb
  // trail, which now also has one ("Dashboard > Inventory").
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // A full navigation to /dashboard re-opens the "Create Your Custom Link"
  // dialog every time (defaultOpen while slugChangeCount stays 0) — close
  // it again before interacting with anything else.
  await page.getByRole("button", { name: "Close" }).click();
  // Redesigned "Inventory Status" card (AJ, 2026-09-16) — Total Items/Low
  // Stock counts and the low-stock item row are its real visible content;
  // the total-₹-value calculation itself is covered by
  // getInventoryOverviewStats' own Vitest test, not duplicated here.
  await expect(page.getByText("Inventory Status")).toBeVisible();
  await expect(page.getByText(itemName)).toBeVisible();
  await expect(page.getByText("Low", { exact: true })).toBeVisible();

  // --- Delete ---
  await page.getByRole("link", { name: "Stock & Supplies", exact: true }).click();
  await page.getByRole("button", { name: `Delete ${itemName}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  // The confirm dialog's own title repeats the item name, so wait for it to close first.
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(page.getByText(itemName)).not.toBeVisible();
});

test("New Inventory Item: name, category and base stock unit are required, the low stock alert must suit the unit, and nothing is stocked or moved", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-inv-new-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const itemName = `Napkins ${Date.now().toString().slice(-6)}`;
  await signUpCaterer(page, email, { firstName: "Inv", lastName: "New", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  const dialog = page.getByRole("dialog");
  for (const field of ["Item Image", "Item Name", "Category", "Description", "Base Stock Unit", "Low Stock Alert", "Default Storage Location"]) {
    await expect(dialog.getByLabel(field, { exact: true })).toHaveCount(1); // the image picker's file input is hidden, so count rather than visibility
  }
  for (const gone of ["Opening Stock", "Cost Per Unit", "Expiry Date", "Supplier"]) await expect(dialog.getByLabel(gone, { exact: true })).toHaveCount(0);

  // Required: name, category, base stock unit
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog.getByLabel("Item Name")).toBeFocused(); // the browser stops an empty name before anything is sent
  await dialog.getByLabel("Item Name").fill(itemName);
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog.getByText("Category is required.")).toBeVisible();
  await dialog.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Packaging & Disposables" }).click();
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog.getByText("Base stock unit is required.")).toBeVisible();

  // A counted unit takes a whole-number alert only
  await dialog.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Packet" }).click();
  await dialog.getByLabel("Low Stock Alert").fill("2.5");
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog.getByLabel("Low Stock Alert")).toHaveAttribute("step", "1"); // the browser blocks 2.5 for a counted unit; the server repeats the rule
  expect(await dialog.getByLabel("Low Stock Alert").evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(false);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Low Stock Alert").fill("10");
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog).not.toBeVisible();

  // Created at zero stock, with no stock movement
  await expect(page.getByText(itemName)).toBeVisible();
  await expect(page.getByText("0 packet")).toBeVisible();
  await page.getByRole("button", { name: `Record stock movement for ${itemName}` }).click();
  await expect(page.getByRole("dialog").getByText(/Current stock:\s*0/)).toBeVisible();
});
