import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer, selectOption } from "./auth-helpers";

/**
 * 2026-10-10 - the chevron next to "Add Item" on Inventory Items: add ingredients from Platterly's catalog (each in
 * the unit the kitchen confirms, at zero stock) and import a CSV with opening stock. A new ingredient is not stock.
 */
const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("add ingredients from the Platterly catalog and import a CSV; only stocked items are in stock", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-invimport-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Stock", lastName: "Tester", closeClaimDialog: false });

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Catalog and import options" }).click();
  await page.getByRole("menuitem", { name: "Browse ingredient catalog" }).click();

  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Search ingredients").fill("Basmati Rice");
  await drawer.getByRole("checkbox", { name: "Select Basmati Rice" }).click();
  await selectOption(page, drawer.getByRole("combobox", { name: "Unit for Basmati Rice" }), "Gram (g)");
  await drawer.getByLabel("Search ingredients").fill("Paneer");
  await drawer.getByRole("checkbox", { name: "Select Paneer" }).click();
  await drawer.getByRole("button", { name: /Add selected ingredients \(2\)/ }).dispatchEvent("click"); // the dev-only Agentation widget floats over this corner
  await expect(drawer.getByRole("status")).toContainText("2 added");
  await drawer.getByRole("button", { name: "Done" }).dispatchEvent("click");
  await expect(page.getByText("Basmati Rice").first()).toBeVisible();
  // Added, but not in stock
  await expect(page.getByRole("row", { name: /Basmati Rice/ })).toContainText("Out of Stock");

  // Import: one new stocked item, one already added (case-insensitive), one bad unit
  const csv = "Item Name,Category,Unit,Purchase Price,Opening Stock,Low Stock Alert\nToor Dal,Pulses & Lentils,kg,140,30,5\nbasmati rice,Grains & Cereals,kg,95,10,\nBad Row,Dairy,bushel,1,,\n";
  await page.getByRole("button", { name: "Catalog and import options" }).click();
  await page.getByRole("menuitem", { name: "Import from Excel / CSV" }).click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({ name: "inventory.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).dispatchEvent("click");
  const result = page.getByRole("dialog").getByRole("status");
  await expect(result).toContainText("1 added");
  await expect(result).toContainText("1 skipped");
  await expect(result).toContainText("Row 4");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).dispatchEvent("click");
  await expect(page.getByRole("row", { name: /Toor Dal/ })).toContainText("In Stock");
});
