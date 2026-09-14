import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";

/**
 * Chunk 6, reworked 2026-09-14 per AJ's field-level spec — Menu is now the
 * top-level priced object, Category is assigned to Menu(s) with a
 * per-assignment max-selection/display-order, and MenuItem's category tags
 * and menu assignments are independent of each other. Signs up a fresh
 * throwaway account (same convention as e2e/kitchenlogin.spec.ts), skips
 * onboarding, then drives category -> item -> menu (incl. the category
 * assignment) through the real browser against the real dev DB.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create a category, an item, and a menu with a category assignment (max selection + order)", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-catalog-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Catalog");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();

  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Category ---
  const categoryName = `Starters ${suffix}`;
  await page.goto("/menu-catalog/categories/new");
  await page.getByLabel("Category Name").fill(categoryName);
  await page.getByLabel("Category Description").fill("Small plates to start");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page).toHaveURL(/\/menu-catalog\/categories$/);
  await expect(page.getByText(categoryName)).toBeVisible();

  // --- Item (Menu Type defaults to Vegetarian; tag it with the category) ---
  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items/new");
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("250");
  await page.getByText(categoryName).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/menu-catalog\/items$/);
  await expect(page.getByText(itemName)).toBeVisible();
  await expect(page.getByText("Veg", { exact: true }).first()).toBeVisible();

  // --- Search + grid/list toggle (CatalogBrowser, shared across all 4 sections) ---
  await page.getByLabel("Search").fill("no-such-item-xyz");
  await expect(page.getByText(itemName)).not.toBeVisible();
  await page.getByLabel("Search").fill("");
  await expect(page.getByText(itemName)).toBeVisible();
  await page.getByLabel("List view").click();
  await expect(page.getByRole("cell", { name: itemName })).toBeVisible();
  await page.getByLabel("Grid view").click();

  // --- Menu: assign the category (max selection 2, order 0) and the item ---
  const menuName = `Wedding Menu ${suffix}`;
  await page.goto("/menu-catalog/menus/new");
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByText(categoryName).click();
  await page.getByPlaceholder("Max selection").fill("2");
  await page.getByPlaceholder("Display order").fill("0");
  await page.getByText(itemName).click();
  await page.getByRole("button", { name: "Create menu" }).click();

  await expect(page).toHaveURL(/\/menu-catalog\/menus$/);
  await expect(page.getByText(menuName)).toBeVisible();
  await expect(page.getByText("₹300.00 / plate")).toBeVisible();

  // Round-trip: reopening the menu's edit page shows the category assignment persisted.
  await page.getByText(menuName).click();
  await expect(page).toHaveURL(/\/menu-catalog\/menus\/.+/);
  await expect(page.getByPlaceholder("Max selection")).toHaveValue("2");
  await expect(page.getByPlaceholder("Display order")).toHaveValue("0");

  // The category's own edit page shows the read-only reverse view.
  await page.goto("/menu-catalog/categories");
  await page.getByText(categoryName).click();
  await expect(page.getByText(menuName)).toBeVisible();
  await expect(page.getByText(/max 2/)).toBeVisible();
});
