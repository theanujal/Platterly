import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 10 Group 10.1 — Quotation, rebuilt to full item-picker parity with
 * Order (2026-09-28): guest counts, veg/non-veg preference, Single/Multi
 * grouping, and the shared per-meal "Select Food Items" drawer, replacing
 * the old flat item-type/catalog/qty picker. Drives the full PRD §20
 * lifecycle against the real dev DB and browser: create a Quotation with a
 * Meal Planning entry and charges, Send it (issuing a real public token
 * link), the customer views and Accepts it from a brand-new cookie-less
 * browser context (no login, matching every other public/token-based
 * surface in this app) — confirming the public page now groups items by
 * meal rather than a flat list — then the caterer Converts it to a real
 * Order and confirms the meal-plan structure (not flattened) carried over.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

/** Quotation form's Customer field (CustomerCombobox, shared with Order since 2026-09-28) — search-autocomplete, debounces ~250ms. */
async function pickCustomer(page: Page, customerName: string) {
  const input = page.getByLabel("Customer");
  await input.click();
  await input.fill(customerName);
  await page.getByRole("button", { name: new RegExp(customerName) }).click();
}

/**
 * Quotation form's "Event Date" field (DateRangePicker, shared with Order
 * since 2026-09-28) — opens a calendar popover on click; days are picked by
 * clicking day-number buttons in a month grid, navigating months with the
 * "Next month" button as needed. A same-day range is committed by clicking
 * the same day twice. Mirrors orders.spec.ts's own helper exactly.
 */
async function pickEventDate(page: Page, startIso: string, endIso: string) {
  await page.getByLabel("Event Date").click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();

  async function gotoMonth(iso: string) {
    const target = new Date(`${iso}T00:00:00`);
    const targetLabel = target.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    for (let i = 0; i < 36; i++) {
      const currentLabel = await popover.locator("span.font-medium").textContent();
      if (currentLabel === targetLabel) return;
      await popover.getByRole("button", { name: "Next month" }).click();
    }
    throw new Error(`Could not navigate calendar to ${targetLabel}`);
  }

  const startDay = String(Number(startIso.split("-")[2]));
  const endDay = String(Number(endIso.split("-")[2]));

  await gotoMonth(startIso);
  await popover.getByRole("button", { name: startDay, exact: true }).click();
  if (startIso === endIso) {
    // Second click on the same day commits a single-day range and closes the popover.
    await popover.getByRole("button", { name: startDay, exact: true }).click();
  } else {
    await gotoMonth(endIso);
    await popover.getByRole("button", { name: endDay, exact: true }).click();
  }
}

/**
 * Meal Planning's per-meal "Select Food Items" dialog — opens from a meal
 * card once that meal has a Menu assigned, shows the Menu's own items
 * grouped by category (uncategorized items fall under "Other Items"), and a
 * plain select/remove toggle (no quantity). Mirrors orders.spec.ts's own helper.
 */
async function selectFoodItem(page: Page, mealSlot: ReturnType<Page["getByTestId"]>, itemName: string) {
  const hasItemsAlready = await mealSlot.getByRole("button", { name: "Edit Food Items" }).isVisible().catch(() => false);
  await mealSlot.getByRole("button", { name: hasItemsAlready ? "Edit Food Items" : "Select Food Items" }).click();
  const dialog = page.getByRole("dialog", { name: /Select Menu Items/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: new RegExp(itemName) }).click();
  await dialog.getByRole("button", { name: "Save Items" }).click();
  await expect(dialog).not.toBeVisible();
}

test("create a Quotation with Meal Planning, send, have a customer accept it, then convert it to an Order with the same per-meal structure", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const email = `e2e-quotations-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Quotations", lastName: "Tester" });

  // --- Setup: a Customer, an Event Type, a Menu, and a Food Item assigned to that Menu ---
  const customerName = `Zoya Khan ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone", { exact: true }).fill("9222222222");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Birthday ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const menuName = `Party Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const itemName = `Biryani ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("150");
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Create Quotation ---
  await page.goto("/quotations/new");
  await expect(page.getByRole("heading", { name: "Create Quotation" })).toBeVisible();

  await pickCustomer(page, customerName);
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await pickEventDate(page, "2026-12-15", "2026-12-15");
  await page.getByLabel("Location / Venue").fill("Grand Ballroom");

  // Guest Information
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await page.getByLabel("Adults").fill("20");

  // Menu Planning — same per-meal drawer flow as Create Order.
  // Meal-type checkboxes became tappable tabs (2026-09-29): clicking Lunch both selects and expands it.
  await page.getByRole("button", { name: "Lunch" }).click();
  const lunchSlot = page.getByTestId("quote-meal-slot-2026-12-15-LUNCH");
  await expect(lunchSlot, "Lunch meal card should appear once selected").toBeVisible();

  await lunchSlot.getByLabel("Menu").click();
  await page.getByRole("option", { name: menuName }).click();
  await expect(lunchSlot.getByText("No items selected")).toBeVisible();

  await selectFoodItem(page, lunchSlot, itemName);
  await expect(lunchSlot.getByText("1 item selected")).toBeVisible();
  await expect(lunchSlot.getByTestId("meal-item-counts").getByText("1 Dish", { exact: true })).toBeVisible(); // counts, not names (AJ, 2026-10-10)

  // Charges
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByLabel("Discount").fill("20");
  await page.getByLabel("Taxes").fill("10");
  await page.getByLabel("Additional Charges").fill("5");
  await page.getByLabel("Delivery Charges").fill("2");

  // subtotal = 6000 (300/plate Menu x 20 adults; the Biryani is included); total = 6000 - 20 + 10 + 5 + 2 = 5997
  await expect(page.getByText("₹6000.00").first()).toBeVisible();
  await expect(page.getByText("₹5997.00").first()).toBeVisible();

  await page.getByRole("button", { name: "Create Quotation" }).click();
  await expect(page).toHaveURL(/\/quotations$/);
  await expect(page.getByText(customerName)).toBeVisible();

  // --- Send it ---
  await page.getByText(customerName).click();
  await expect(page).toHaveURL(/\/quotations\/.+/);
  // Under load the button can be on screen before its click handler is attached (the page is still
  // hydrating), so the first click does nothing. Retry until the status changes; once it has, the
  // button is gone, so a retry can never send twice.
  await expect(async () => {
    const send = page.getByRole("button", { name: "Send Quotation" });
    if (await send.isVisible()) await send.click();
    await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 40_000 });

  const linkLocator = page.getByRole("link", { name: /\/quote\// });
  await expect(linkLocator).toBeVisible();
  const shareableLink = await linkLocator.getAttribute("href");
  expect(shareableLink).toContain("/quote/");

  // --- Customer views and accepts it from a brand-new cookie-less browser context (no login) ---
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const response = await publicPage.goto(shareableLink!);
  expect(response?.status()).toBe(200);

  await expect(publicPage.getByText(`Quotation for ${customerName}`)).toBeVisible();
  // Items now group by meal (item-picker parity, 2026-09-28) — the meal
  // heading and the item both render, not a flat undifferentiated list.
  await expect(publicPage.getByText("Lunch", { exact: false }).first()).toBeVisible();
  await expect(publicPage.getByText(itemName, { exact: true })).toBeVisible();
  await expect(publicPage.getByText("₹5997.00")).toBeVisible();
  await expect(publicPage.getByText("Viewed", { exact: true })).toBeVisible();

  await publicPage.getByRole("button", { name: "Accept Quotation" }).click();
  await expect(publicPage.getByText("You've accepted this quotation")).toBeVisible();
  await publicContext.close();

  // --- Back in the admin: Convert to Order ---
  await page.reload();
  await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Convert to Order" }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);

  // The converted Order has a real MealPlanEntry for Lunch, not a flattened whole-order item.
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await expect(page.getByTestId("meal-slot-2026-12-15-LUNCH").getByTestId("meal-item-counts").getByText("1 Dish", { exact: true })).toBeVisible();
  // subtotal = 6000 (the meal on its Menu); otherCharges = 10+5+2 = 17; total = 6000-20+17 = 5997
  // The total now sits in the Pricing & Payment tab, not the sidebar (AJ, 2026-10-04).
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByText("₹5997.00").first()).toBeVisible();
});
