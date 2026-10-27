import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Add-ons Management (2026-09-14, AJ's own field-level spec) — a standalone
 * catalog of Live Counters and Special Add-ons, each priced Per Plate or
 * Fixed. Lives in the Menu Catalog sub-nav (moved there 2026-09-30).
 *
 * Reworked again 2026-09-14 (UI/UX redesign round): Add and Edit are now
 * popup dialogs (a top-right "Add Add-on" button, a pencil icon per card) —
 * there is no more /new or /[id] page route. Signs up a fresh throwaway
 * account, skips onboarding, then drives the Add-ons flow.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create a Live Counter (Per Plate) and a Special Add-on (Fixed), then edit one", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-addons-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Addon", lastName: "Tester", closeClaimDialog: false });

  // A fresh account's Dashboard auto-opens the "Create Your Custom Link"
  // dialog, which overlays the whole page (including the sidebar) until
  // dismissed — close it before interacting with anything else.
  await page.getByRole("button", { name: "Close" }).click();

  // --- Add-ons lives in the Menu Catalog sub-nav (AJ, 2026-09-30), alongside Event Types. ---
  await page.getByRole("link", { name: "Menu Catalog", exact: true }).first().click();
  await page.getByRole("link", { name: "Add-ons" }).click();
  await expect(page).toHaveURL(/\/menu-catalog\/add-ons$/);
  await expect(page.getByRole("heading", { name: "Add-ons" })).toBeVisible();

  // --- Live Counter, priced Per Plate, via the "Add Add-on" popup ---
  const liveCounterName = `Live Chaat Counter ${suffix}`;
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Name").fill(liveCounterName);
  await page.getByLabel("Description").fill("Fresh chaat made to order");
  // Type defaults to Live Counter, Price Type defaults to Per Plate.
  await page.getByLabel("Price", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Create add-on" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(liveCounterName)).toBeVisible();
  await expect(page.getByText("Live Counter").first()).toBeVisible();
  await expect(page.getByText("₹150.00 / plate")).toBeVisible();

  // --- Special Add-on, priced Fixed ---
  const specialAddonName = `Custom Cake Topper ${suffix}`;
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Name").fill(specialAddonName);
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Special Add-on" }).click();
  await page.getByLabel("Price Type").click();
  await page.getByRole("option", { name: "Fixed" }).click();
  await page.getByLabel("Price", { exact: true }).fill("5000");
  // A 3.5MB WebP: over Next's default 1MB Server Action body limit and not a PNG/JPG, both of
  // which used to reject an image upload (AJ, 2026-09-30).
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({
    name: "topper.webp",
    mimeType: "image/webp",
    // A real picture (uploads are checked by content and converted): random noise, so it stays about 3.4MB.
    buffer: await sharp({ create: { width: 1100, height: 1100, channels: 3, background: "#000", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).webp({ lossless: true }).toBuffer(),
  });
  await page.getByRole("button", { name: "Create add-on" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator('img[src$=".webp"]')).toBeVisible();
  await expect(page.getByText(specialAddonName)).toBeVisible();
  await expect(page.getByText("Special Add-on").first()).toBeVisible();
  await expect(page.getByText("₹5,000.00 flat")).toBeVisible();

  // --- Search + grid/list toggle (shared CatalogBrowser) ---
  await page.getByLabel("Search").fill("no-such-addon-xyz");
  await expect(page.getByText(liveCounterName)).not.toBeVisible();
  await page.getByLabel("Search").fill("");
  await expect(page.getByText(liveCounterName)).toBeVisible();
  await page.getByLabel("List view").click();
  await expect(page.getByRole("cell", { name: new RegExp(`^${liveCounterName}`) })).toBeVisible();
  await page.getByLabel("Grid view").click();

  // --- Edit via the pencil-icon popup: confirm fields persisted, then update and verify ---
  await page.getByRole("button", { name: `Actions for ${liveCounterName}` }).click();
  await page.getByRole("menuitem", { name: "Edit Add-on" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(liveCounterName);
  await expect(page.getByLabel("Price", { exact: true })).toHaveValue("150");

  await page.getByLabel("Name").fill(`${liveCounterName} Updated`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(`${liveCounterName} Updated`)).toBeVisible();

  // --- The 3-dot menu also duplicates, deactivates and deletes (AJ, 2026-09-30) ---
  const updatedName = `${liveCounterName} Updated`;
  await page.getByRole("button", { name: `Actions for ${updatedName}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  // Duplicate asks first (Cancel makes nothing), then says what it created.
  const duplicateAsk = page.getByRole("alertdialog");
  await expect(duplicateAsk.getByText(`Duplicate "${updatedName}"?`)).toBeVisible();
  await duplicateAsk.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(`${updatedName} (Copy)`, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `Actions for ${updatedName}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("alertdialog").getByText(`Created "${updatedName} (Copy)".`)).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "OK" }).click();
  await expect(page.getByText(`${updatedName} (Copy)`, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Actions for ${updatedName} (Copy)` }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await expect(page.getByText("Inactive").first()).toBeVisible();

  await page.getByRole("button", { name: `Actions for ${updatedName} (Copy)` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(`${updatedName} (Copy)`, { exact: true })).toHaveCount(0);
});

test("an add-on applies to all menus by default, needs a menu once All menus is off, and hides the price when included", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-addon-menus-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const name = `Welcome Drink ${Date.now().toString().slice(-6)}`;

  await signUpCaterer(page, email, { firstName: "Addon", lastName: "Menus", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();
  await page.goto("/menu-catalog/add-ons");

  await page.getByRole("button", { name: "Add Add-on" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { name: "All menus" })).toBeChecked();

  // Turning All menus off with no menu chosen is refused.
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Price", { exact: true }).fill("80");
  await dialog.getByRole("checkbox", { name: "All menus" }).uncheck();
  await dialog.getByRole("button", { name: "Create add-on" }).click();
  await expect(dialog.getByText("Choose at least one menu, or tick All menus.")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "All menus" }).check();

  // In the package: no price to enter, and the card says Included with the menus it applies to.
  await dialog.getByRole("checkbox", { name: "Included in the package" }).check();
  await expect(dialog.getByLabel("Price", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Create add-on" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText("Included", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("All menus").first()).toBeVisible();
});

test("pick the menus an add-on applies to in the multi-select: chips, count, search, clear all, and it shows on the card", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-addon-multi-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const menus = [`Gold Menu ${suffix}`, `Silver Menu ${suffix}`, `Bronze Menu ${suffix}`];

  await signUpCaterer(page, email, { firstName: "Addon", lastName: "Multi", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();
  await page.goto("/menu-catalog/menus");
  for (const n of menus) {
    await page.getByRole("button", { name: "Add Menu Type" }).click();
    await page.getByLabel("Menu Name").fill(n);
    await page.getByLabel("Price Per Plate").fill("400");
    await page.getByRole("button", { name: "Create menu" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }

  await page.goto("/menu-catalog/add-ons");
  await page.getByRole("button", { name: "Add Add-on" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(`Chaat ${suffix}`);
  await dialog.getByLabel("Price", { exact: true }).fill("90");
  await dialog.getByRole("checkbox", { name: "All menus" }).uncheck();

  await dialog.getByRole("combobox", { name: "Menus" }).click();
  await page.getByRole("option", { name: menus[0] }).click();
  await page.getByRole("option", { name: menus[1] }).click();
  await page.getByLabel("Search menus").fill("bronze");
  await expect(page.getByRole("option", { name: menus[0] })).toHaveCount(0);
  await expect(page.getByRole("option", { name: menus[2] })).toBeVisible();
  await dialog.getByText("Applies to menus").click(); // outside press closes the list
  await expect(dialog.getByTestId("multi-select-count")).toHaveText("2");
  await expect(page.getByRole("option")).toHaveCount(0); // the list closed
  await expect(dialog.getByRole("combobox", { name: "Menus" }).getByText(menus[0])).toBeVisible();

  // A chip's x removes one; Clear all empties the field.
  await dialog.getByRole("button", { name: `Remove ${menus[1]}` }).click();
  await expect(dialog.getByTestId("multi-select-count")).toHaveText("1");
  await dialog.getByRole("button", { name: "Clear all" }).click();
  await expect(dialog.getByTestId("multi-select-count")).toHaveCount(0);

  await dialog.getByRole("combobox", { name: "Menus" }).click();
  await page.getByRole("option", { name: menus[1] }).click();
  await dialog.getByText("Applies to menus").click(); // outside press closes the list
  await dialog.getByRole("button", { name: "Create add-on" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(menus[1])).toBeVisible();
  await expect(page.getByText(menus[0])).toHaveCount(0);
});
