import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";

/**
 * Chunk 6 — Menu & Product Catalog. Signs up a fresh throwaway account (same
 * convention as e2e/kitchenlogin.spec.ts), skips onboarding (nothing here
 * depends on the business profile), then drives a full category -> item ->
 * menu -> package flow through the real browser against the real dev DB.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create a category, a dietary-tagged item, a menu, and a priced package", async ({ page }) => {
  const email = `e2e-catalog-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Catalog Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();

  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Category ---
  await page.goto("/menu-catalog/categories");
  const categoryName = `Starters ${suffix}`;
  await page.getByRole("button", { name: "New Category" }).click();
  await page.getByLabel("Name").fill(categoryName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("cell", { name: categoryName })).toBeVisible();

  // --- Item ---
  await page.goto("/menu-catalog/items/new");
  const itemName = `Paneer Tikka ${suffix}`;
  await page.getByLabel("Name").fill(itemName);
  await page.getByLabel("Price").fill("250");
  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: categoryName }).click();
  await page.getByLabel("Veg / Non-Veg").click();
  await page.getByRole("option", { name: "Vegetarian", exact: true }).click();
  await page.getByLabel("Dietary type").click();
  await page.getByRole("option", { name: "Jain" }).click();
  await page.getByLabel("Egg information").click();
  await page.getByRole("option", { name: "No egg" }).click();
  await page.getByRole("button", { name: "Create item" }).click();

  await expect(page).toHaveURL(/\/menu-catalog\/items$/);
  const itemRow = page.getByRole("row", { name: new RegExp(itemName) });
  await expect(itemRow).toBeVisible();
  await expect(itemRow.getByText("Veg")).toBeVisible();

  // --- Menu (groups the item) ---
  await page.goto("/menu-catalog/menus/new");
  const menuName = `Wedding Menu ${suffix}`;
  await page.getByLabel("Name").fill(menuName);
  await page.getByText(itemName).click();
  await page.getByRole("button", { name: "Create menu" }).click();

  await expect(page).toHaveURL(/\/menu-catalog\/menus$/);
  await expect(page.getByRole("cell", { name: menuName })).toBeVisible();

  // --- Package (prices the item) ---
  await page.goto("/menu-catalog/packages/new");
  const packageName = `Gold Package ${suffix}`;
  await page.getByLabel("Name").fill(packageName);
  await page.getByLabel("Price per person").fill("500");
  await page.getByLabel("Min guests").fill("20");
  await page.getByLabel("Max guests").fill("200");

  const itemRowInPicker = page.locator("div").filter({ hasText: itemName }).last();
  await itemRowInPicker.getByRole("combobox").click();
  await page.getByRole("option", { name: "Included" }).click();

  // Default preview guest count (10) is below this package's minGuests (20)
  // — the live preview correctly refuses to price it instead of showing a
  // number, proving calculatePackagePrice's guest-range guardrail is wired
  // all the way into the UI, not just covered by the module's own tests.
  await expect(page.getByText("Guest count must be at least 20.")).toBeVisible();

  // 50 guests * ₹500/guest = ₹25000, once within [20, 200].
  await page.getByLabel("Preview price for").fill("50");
  await expect(page.getByText("₹25000.00")).toBeVisible();

  await page.getByRole("button", { name: "Create package" }).click();
  await expect(page).toHaveURL(/\/menu-catalog\/packages$/);
  await expect(page.getByRole("cell", { name: packageName })).toBeVisible();
  await expect(page.getByText("₹500.00/guest")).toBeVisible();
});
