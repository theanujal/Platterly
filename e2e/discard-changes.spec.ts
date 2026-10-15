import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Esc, a click on the dimmed area, the X and Cancel used to close an Add/Edit drawer and throw away everything typed
 * (AJ, 2026-10-14). While the form differs from how it started, closing asks "Discard your changes?"; a clean drawer
 * closes at once; saving closes without a question.
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

const drawer = (page: Page) => page.getByRole("dialog").first();
const question = (page: Page) => page.getByRole("alertdialog", { name: "Discard your changes?" });

test("closing a drawer with unsaved edits asks first, from Esc, the dimmed area, the X and Cancel", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-discard-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Discard", lastName: "Tester" });

  await page.goto("/menu-catalog/add-ons");
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await expect(drawer(page)).toBeVisible();

  // Untouched: Esc closes straight away, no question.
  await page.keyboard.press("Escape");
  await expect(drawer(page)).not.toBeVisible();
  await expect(question(page)).toHaveCount(0);

  // Typed something: Esc asks. "Keep editing" keeps the drawer and the text.
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await page.getByLabel("Name").fill("Welcome Drink");
  await page.keyboard.press("Escape");
  await expect(question(page)).toBeVisible();
  await question(page).getByRole("button", { name: "Keep editing" }).click();
  await expect(question(page)).toHaveCount(0);
  await expect(page.getByLabel("Name")).toHaveValue("Welcome Drink");

  // Clicking the dimmed area asks too.
  await page.mouse.click(5, 300);
  await expect(question(page)).toBeVisible();
  await question(page).getByRole("button", { name: "Keep editing" }).click();

  // Cancel asks as well.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(question(page)).toBeVisible();
  await question(page).getByRole("button", { name: "Keep editing" }).click();

  // The X in the corner asks as well; confirming discards, and the next drawer starts empty.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(question(page)).toBeVisible();
  await question(page).getByRole("button", { name: "Discard changes" }).click();
  await expect(drawer(page)).not.toBeVisible();
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("");

  await page.getByLabel("Name").fill("Welcome Drink");
  await page.getByLabel("Price", { exact: true }).fill("80");
  await page.getByRole("button", { name: "Create add-on" }).click();
  await expect(drawer(page)).not.toBeVisible(); // saving never asks
  await expect(question(page)).toHaveCount(0);
  await expect(page.getByText("Welcome Drink")).toBeVisible();

  // Editing an existing add-on: untouched closes, a change asks.
  await page.getByLabel("Grid view").click();
  await page.getByRole("button", { name: "Actions for Welcome Drink" }).click();
  await page.getByRole("menuitem", { name: "Edit Add-on" }).click();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).not.toBeVisible();
  await page.getByRole("button", { name: "Actions for Welcome Drink" }).click();
  await page.getByRole("menuitem", { name: "Edit Add-on" }).click();
  await page.getByLabel("Price", { exact: true }).fill("95");
  await page.keyboard.press("Escape");
  await expect(question(page)).toBeVisible();
  await question(page).getByRole("button", { name: "Discard changes" }).click();
  await expect(drawer(page)).not.toBeVisible();
});

test("the same guard works on the customer and inventory drawers", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-discard2-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Discard", lastName: "Two" });

  for (const [url, button, field] of [
    ["/customers", "Add Customer", "Name"],
    ["/inventory", "Add Item", "Name"],
  ] as const) {
    await page.goto(url);
    await page.getByRole("button", { name: button }).first().click();
    await expect(drawer(page)).toBeVisible();
    await page.getByLabel(field).first().fill("Something typed");
    await page.keyboard.press("Escape");
    await expect(question(page)).toBeVisible();
    await question(page).getByRole("button", { name: "Discard changes" }).click();
    await expect(drawer(page)).not.toBeVisible();
  }
});

test("the Add Expense popup asks before discarding what was typed, and not when nothing was typed", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-discard3-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Discard", lastName: "Three" });

  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).not.toBeVisible();

  await page.getByRole("button", { name: "Add Expense" }).first().click();
  await page.getByLabel("Amount").first().fill("1200");
  await page.keyboard.press("Escape");
  await expect(question(page)).toBeVisible();
  await question(page).getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Amount").first()).toHaveValue("1200");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await question(page).getByRole("button", { name: "Discard changes" }).click();
  await expect(drawer(page)).not.toBeVisible();
});

test("the import drawer asks before dropping a chosen file", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-discard4-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Discard", lastName: "Four" });

  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Bulk add options" }).click();
  await page.getByRole("menuitem", { name: "Import from Excel / CSV" }).click();
  await expect(drawer(page)).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "dishes.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Price\nDosa,50\n") });
  await page.keyboard.press("Escape");
  await expect(question(page)).toBeVisible();
  await question(page).getByRole("button", { name: "Discard changes" }).click();
  await expect(drawer(page)).not.toBeVisible();
});

test("every Add drawer in the Menu Catalog, Suppliers and Staff asks before discarding, and an untouched one closes at once", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-discard5-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Discard", lastName: "Five" });

  for (const [url, button, field] of [
    ["/menu-catalog/event-types", "Add Event Type", "Event Name"],
    ["/menu-catalog/menus", "Add Menu Type", "Menu Name"],
    ["/menu-catalog/categories", "Add Category", "Category Name"],
    ["/menu-catalog/items", "Add Item", "Item Name"],
    ["/suppliers", "Add Supplier", null],
    ["/staff", "Add Staff", null],
  ] as const) {
    await page.goto(url);
    await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
    await expect(drawer(page), `${url} opens`).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer(page), `${url} untouched closes`).not.toBeVisible();

    await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
    await (field ? drawer(page).getByLabel(field) : drawer(page).getByRole("textbox").first()).fill("Typed by mistake");
    await page.keyboard.press("Escape");
    await expect(question(page), `${url} asks`).toBeVisible();
    await question(page).getByRole("button", { name: "Discard changes" }).click();
    await expect(drawer(page), `${url} discarded`).not.toBeVisible();
  }
});

test("the Edit drawers (Event Type, Menu Type) ask before discarding a change", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-discard6-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Discard", lastName: "Six" });
  const suffix = Date.now().toString().slice(-6);

  for (const [url, add, field, entity, name, extra] of [
    ["/menu-catalog/event-types", "Add Event Type", "Event Name", "Event Type", `Wedding ${suffix}`, null],
    ["/menu-catalog/menus", "Add Menu Type", "Menu Name", "Menu Type", `Gold ${suffix}`, ["Price Per Plate", "400"]],
  ] as const) {
    await page.goto(url);
    await page.getByRole("button", { name: new RegExp(`^${add}`) }).first().click();
    await drawer(page).getByLabel(field).fill(name);
    if (extra) await drawer(page).getByLabel(extra[0]).fill(extra[1]);
    await drawer(page).getByRole("button", { name: /^Create/ }).click();
    await expect(drawer(page)).not.toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    const grid = page.getByLabel("Grid view");
    if (await grid.count()) await grid.click();

    const openEdit = async () => {
      await page.getByRole("button", { name: `Actions for ${name}` }).first().click();
      await page.getByRole("menuitem", { name: new RegExp(`^Edit ${entity}`) }).click();
      await expect(drawer(page), `${entity} edit opens`).toBeVisible();
    };
    await openEdit();
    await page.keyboard.press("Escape");
    await expect(drawer(page), `${entity} untouched edit closes`).not.toBeVisible();

    await openEdit();
    await drawer(page).getByLabel(field).fill(`${name} changed`);
    await page.keyboard.press("Escape");
    await expect(question(page), `${entity} edit asks`).toBeVisible();
    await question(page).getByRole("button", { name: "Keep editing" }).click();
    await expect(drawer(page).getByLabel(field)).toHaveValue(`${name} changed`);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await question(page).getByRole("button", { name: "Discard changes" }).click();
    await expect(drawer(page)).not.toBeVisible();
    await expect(page.getByText(`${name} changed`)).toHaveCount(0);
  }
});

test("an order form with unsaved edits: Back to orders becomes Discard changes and asks, the sidebar asks, Save stays beside the form", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-discard-order-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Discard", lastName: "Orders" });

  await page.goto("/orders/new");
  const asking = page.getByRole("alertdialog", { name: "Discard your changes to this order?" });
  // Untouched: the button is "Back to orders" (never "Cancel") and goes straight back.
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("unsaved-note")).toHaveCount(0);
  await page.getByRole("tab", { name: "Guests & Event Info" }).click();
  await page.getByLabel("Adults").fill("40");

  // Edited: the note shows in the Save card, the button now reads Discard changes and asks first.
  await expect(page.getByTestId("unsaved-note")).toBeVisible();
  await expect(page.getByTestId("order-save-card").getByRole("button", { name: "Save Order" })).toBeVisible();
  // The Save card is the last thing in the summary column and stays in view.
  const saveCard = page.getByTestId("order-save-card");
  await expect(saveCard).toBeInViewport();
  const summaryBox = await page.getByRole("heading", { name: "Order Summary" }).boundingBox();
  const saveBox = await saveCard.boundingBox();
  expect(saveBox!.y).toBeGreaterThan(summaryBox!.y);
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(asking).toBeVisible();
  await asking.getByRole("button", { name: "Keep editing" }).click();
  await expect(asking).toHaveCount(0);
  await expect(page.getByLabel("Adults")).toHaveValue("40");

  // A sidebar link asks too; Discard leaves.
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(asking).toBeVisible();
  await asking.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
