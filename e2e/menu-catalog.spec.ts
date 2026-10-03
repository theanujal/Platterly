import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

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

  await signUpCaterer(page, email, { firstName: "Catalog", lastName: "Tester", closeClaimDialog: false });

  // --- Renamed + reordered Menu Catalog sub-nav: Menu Types, Menu
  // Categories, Food Items — display labels only, routes unchanged. ---
  await page.goto("/menu-catalog/menus");
  await expect(page.getByRole("link", { name: "Menu Types" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Menu Categories" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Food Items" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menu Types" })).toBeVisible();

  // --- Menu Type first, via the top-right button (List view is the default; the dashed "Add New" tile is Grid-only) ---
  const menuName = `Wedding Menu ${suffix}`;
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await expect(page.getByText("No categories yet. Add some from the list below.")).toBeVisible();
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
  await expect(page.getByRole("columnheader", { name: "Menu Category" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await page.getByLabel("Grid view").click();

  // --- Back on the Menu: both categories now show up, read-only, with their max-selection, in assignment order ---
  await page.goto("/menu-catalog/menus");
  await page.getByLabel("Grid view").click(); // catalog pages open in List view by default (AJ, 2026-09-30)
  await page.getByRole("button", { name: `Actions for ${menuName}` }).click();
  await page.getByRole("menuitem", { name: "Edit Menu Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel(`Max selection for ${startersName}`)).toHaveValue("2");
  await expect(page.getByLabel(`Max selection for ${mainsName}`)).toHaveValue("3");

  // The drawer's right column now owns picking and ordering the menu's categories (AJ, 2026-09-30).
  // Move Mains up (no drag — buttons only) and confirm the new order persists after reopening.
  const selectedCategories = page.getByTestId("menu-selected-categories");
  await page.getByRole("button", { name: `Move ${mainsName} up` }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // The list refreshes just after the save, so under load the drawer can reopen on the old order
  // for a moment. Close and reopen until it shows the saved one.
  await expect(async () => {
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    }
    await page.getByRole("button", { name: `Actions for ${menuName}` }).click();
    await page.getByRole("menuitem", { name: "Edit Menu Type" }).click();
    await expect(selectedCategories.locator("> div").first()).toContainText(mainsName, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // Remove a category, add it back with a new limit: it lands at the end.
  await page.getByRole("button", { name: `Remove ${startersName}` }).click();
  await page.getByRole("button", { name: `Add ${startersName}` }).click();
  await page.getByLabel(`Max selection for ${startersName}`).fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // Same as above: right after the save the drawer can reopen on the old values, so close and reopen until the new ones show.
  await expect(async () => {
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    }
    await page.getByRole("button", { name: `Actions for ${menuName}` }).click();
    await page.getByRole("menuitem", { name: "Edit Menu Type" }).click();
    await expect(selectedCategories.locator("> div").last()).toContainText(startersName, { timeout: 3_000 });
    await expect(page.getByLabel(`Max selection for ${startersName}`)).toHaveValue("5", { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // --- Active/Inactive switch round-trip (Menu Type) ---
  await expect(page.getByRole("switch", { name: "Active" })).toBeChecked();
  await page.getByRole("switch", { name: "Active" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Inactive").first()).toBeVisible();

  // --- Food Item: tag it with a category, assign it to the menu, via the restored dashed tile on Food Items ---
  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("250");
  // Highlight tags are plain checkboxes.
  await page.getByRole("checkbox", { name: "Live Counter" }).check();
  await page.getByRole("checkbox", { name: "Chef's Special" }).check();
  await page.getByText(menuName).click();
  await page.getByText(startersName).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(itemName)).toBeVisible();
  await expect(page.getByText("Veg", { exact: true }).first()).toBeVisible();
  // The tags show on the item (list view here), and only the ones that were ticked.
  await expect(page.getByRole("row", { name: new RegExp(itemName) }).getByTestId("item-highlights")).toContainText("Live Counter");
  await expect(page.getByRole("row", { name: new RegExp(itemName) }).getByTestId("item-highlights")).toContainText("Chef's Special");
  await expect(page.getByRole("row", { name: new RegExp(itemName) }).getByTestId("item-highlights")).not.toContainText("Popular");

  // --- Active/Inactive switch round-trip (Food Item) ---
  await page.getByLabel("Grid view").click(); // catalog pages open in List view by default (AJ, 2026-09-30)
  await page.getByRole("button", { name: `Actions for ${itemName}` }).click();
  await page.getByRole("menuitem", { name: "Edit Food Item" }).click();
  await expect(page.getByRole("switch", { name: "Active" })).toBeChecked();
  await page.getByRole("switch", { name: "Active" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Inactive").first()).toBeVisible();

  await page.getByRole("button", { name: `Actions for ${itemName}` }).click();
  await page.getByRole("menuitem", { name: "Edit Food Item" }).click();
  await expect(page.getByRole("switch", { name: "Active" })).not.toBeChecked();
  await page.getByRole("switch", { name: "Active" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Search + grid/list toggle (CatalogBrowser, shared across all catalog sections) ---
  await page.getByLabel("Search").fill("no-such-item-xyz");
  await expect(page.getByText(itemName)).not.toBeVisible();
  await page.getByLabel("Search").fill("");
  await expect(page.getByText(itemName)).toBeVisible();
});
