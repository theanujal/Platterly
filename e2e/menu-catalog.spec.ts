import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 6, reworked 2026-09-14 per AJ's field-level spec, then redesigned
 * again the same day (popup forms, restored Add tiles, visible list
 * headings), then corrected once more the same day: Category is now the
 * *only* place a Category gets assigned to a Menu (with its max-selection),
 * and the Menu Type popup only displays + reorders (Move Up/Down, no drag)
 * its already-assigned categories — it can no longer add/remove them or
 * pick Food Items directly. Signs up a fresh throwaway account, skips
 * onboarding, then drives menu -> category (incl. assigning it to that
 * menu) -> item through the real browser against the real dev DB.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create a menu, a category assigned to it (max selection + reorder), and an item", async ({ page }) => {
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
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();

  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Renamed + reordered Menu Catalog sub-nav: Menu Types, Menu
  // Categories, Food Items — display labels only, routes unchanged. ---
  await page.goto("/menu-catalog/menus");
  await expect(page.getByRole("link", { name: "Menu Types" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Menu Categories" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Food Items" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menu Types" })).toBeVisible();

  // --- Menu Type first, via the restored dashed "Add New" tile (not the top-right button, to prove it opens the same popup) ---
  const menuName = `Wedding Menu ${suffix}`;
  await page.getByRole("button", { name: "Add New Menu Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await expect(page.getByText("No categories assigned yet")).toBeVisible();
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(menuName)).toBeVisible();

  // --- Two Categories, each assigned to that Menu with a different max-selection — Category owns this relationship now, not the Menu. ---
  await page.goto("/menu-catalog/categories");
  const startersName = `Starters ${suffix}`;
  await page.getByRole("button", { name: "Add Category" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Category Name").fill(startersName);
  await page.getByText(menuName).click();
  await page.getByPlaceholder("Max selection").fill("2");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(startersName)).toBeVisible();

  const mainsName = `Mains ${suffix}`;
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category Name").fill(mainsName);
  await page.getByText(menuName).click();
  await page.getByPlaceholder("Max selection").fill("3");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- List view headings are visible (not screen-reader-only) ---
  await page.getByLabel("List view").click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await page.getByLabel("Grid view").click();

  // --- Back on the Menu: both categories now show up, read-only, with their max-selection, in assignment order ---
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: `Edit ${menuName}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(`${startersName} (max 2)`)).toBeVisible();
  await expect(page.getByText(`${mainsName} (max 3)`)).toBeVisible();

  // Move Mains up (no drag — buttons only) and confirm the new order persists after reopening.
  await page.getByRole("button", { name: `Move ${mainsName} up` }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.getByRole("button", { name: `Edit ${menuName}` }).click();
  const categoryRows = page.locator("form div.flex.items-center.justify-between").filter({ hasText: /max \d/ });
  await expect(categoryRows.first()).toContainText(mainsName);

  // --- Active/Inactive checkbox round-trip (Menu Type) ---
  await expect(page.getByRole("checkbox", { name: "Active" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Active" }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Inactive").first()).toBeVisible();

  // --- Food Item: tag it with a category, assign it to the menu, via the restored dashed tile on Food Items ---
  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add New Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("250");
  await page.getByText(menuName).click();
  await page.getByText(startersName).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(itemName)).toBeVisible();
  await expect(page.getByText("Veg", { exact: true }).first()).toBeVisible();

  // --- Active/Inactive checkbox round-trip (Food Item) ---
  await page.getByRole("button", { name: `Edit ${itemName}` }).click();
  await expect(page.getByRole("checkbox", { name: "Active" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Active" }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Inactive").first()).toBeVisible();

  await page.getByRole("button", { name: `Edit ${itemName}` }).click();
  await expect(page.getByRole("checkbox", { name: "Active" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Active" }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Search + grid/list toggle (CatalogBrowser, shared across all catalog sections) ---
  await page.getByLabel("Search").fill("no-such-item-xyz");
  await expect(page.getByText(itemName)).not.toBeVisible();
  await page.getByLabel("Search").fill("");
  await expect(page.getByText(itemName)).toBeVisible();
});
