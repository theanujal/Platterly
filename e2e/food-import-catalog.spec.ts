import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * 2026-10-10 - the chevron next to "Add Item" on Food Items: add dishes from Platterly's catalog, and import from a
 * CSV. Names are unique per business, so a second import of the same file adds nothing.
 */
const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("add dishes from the Platterly catalog and import a CSV", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-foodimport-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Import", lastName: "Tester", closeClaimDialog: false });

  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Bulk add options" }).click();
  await page.getByRole("menuitem", { name: "Add from Platterly catalog" }).click();

  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Search dishes").fill("Paneer Butter Masala");
  await drawer.getByText("Paneer Butter Masala", { exact: true }).click();
  await drawer.getByLabel("Search dishes").fill("Gulab Jamun");
  await drawer.getByText("Gulab Jamun", { exact: true }).click();
  await drawer.getByRole("button", { name: /Add selected items \(2\)/ }).dispatchEvent("click");
  await expect(drawer.getByRole("status")).toContainText("2 added");
  await drawer.getByRole("button", { name: "Done" }).dispatchEvent("click"); // the dev-only Agentation widget floats over this corner
  await expect(page.getByText("Paneer Butter Masala").first()).toBeVisible();

  // Import: one new dish, one already added (case-insensitive), one bad row.
  const csv = "Item Name,Category,Veg / Non-Veg,Price,Description\nTest Tikka,Starters,Veg,180,Smoky\ngulab jamun,Desserts,Veg,60,\nBad Row,Mains,Fish,10,\n";
  await page.getByRole("button", { name: "Bulk add options" }).click();
  await page.getByRole("menuitem", { name: "Import from Excel / CSV" }).click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({ name: "items.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).dispatchEvent("click");
  const result = page.getByRole("dialog").getByRole("status");
  await expect(result).toContainText("1 added");
  await expect(result).toContainText("1 skipped");
  await expect(result).toContainText("Row 4");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).dispatchEvent("click"); // the dev-only Agentation widget floats over this corner
  await expect(page.getByText("Test Tikka").first()).toBeVisible();
});

test("a food item name must be unique when adding by hand", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-foodunique-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Unique", lastName: "Tester", closeClaimDialog: false });
  await page.goto("/menu-catalog/items");

  for (const [i, name] of ["Dal Fry", "dal fry"].entries()) {
    await page.getByRole("button", { name: "Add Item", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Item Name").fill(name);
    await drawer.getByLabel("Item Price Per Plate").fill("90");
    await drawer.getByRole("button", { name: "Create item" }).click();
    if (i === 1) await expect(drawer.getByRole("alert")).toContainText("already exists");
  }
});
