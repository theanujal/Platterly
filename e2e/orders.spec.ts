import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 10 — Sales Pipeline: Order. Create Order redesign (2026-09-20)
 * rebuilt this page around Meal Planning as the core: every meal assigns
 * its own Menu (required for every Order Type now, not Multi-only) and food
 * items are picked ONLY from a per-meal "Select Food Items" dialog — the
 * old standalone "Products & Menu Items" section and per-meal Taxes field
 * were removed outright. Drives Order creation end to end against the real
 * dev DB and browser: Customer/Event Information, Guests Information, Meal
 * Planning (menu assignment + the food-item dialog + individual per-meal
 * pricing), Venue & Delivery Details, Order Details/Payment Status, the
 * live pricing summary, the Orders Dashboard's search/status/type filters,
 * the Group 10.6 Event Creation Prompt (inline, not a popup), and inline
 * editing of the linked Event's operational fields from the Order detail
 * page itself.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

/** Order form's Customer field (CustomerCombobox) — search-autocomplete, debounces ~250ms. */
async function pickCustomer(page: Page, customerName: string) {
  const input = page.getByLabel("Customer");
  await input.click();
  await input.fill(customerName);
  await page.getByRole("button", { name: new RegExp(customerName) }).click();
}

/**
 * Order form's "Event Date" field (DateRangePicker) — opens a calendar
 * popover on click; days are picked by clicking day-number buttons in a
 * month grid, navigating months with the "Next month" button as needed.
 * A same-day range is committed by clicking the same day twice.
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
 * grouped by category (uncategorized items fall under "Other Items"),
 * search/category tabs, and a plain select/remove toggle (no quantity).
 */
async function selectFoodItem(page: Page, mealSlot: ReturnType<Page["getByTestId"]>, itemName: string) {
  const hasItemsAlready = await mealSlot.getByRole("button", { name: "Edit Food Items" }).isVisible().catch(() => false);
  await mealSlot.getByRole("button", { name: hasItemsAlready ? "Edit Food Items" : "Select Food Items" }).click();
  const dialog = page.getByRole("dialog", { name: /Select Food Items/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: new RegExp(itemName) }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).not.toBeVisible();
}

test("create an order with guests/meal planning/venue/payment, then create and edit its linked Event inline", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-orders-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Orders");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("9800000099");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Close" }).click();

  // --- Setup: a Customer, an Event Type, a Menu, and a Food Item assigned to that Menu ---
  const customerName = `Asha Rao ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/events/new");
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/events$/);

  const menuName = `Wedding Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("150");
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Create Order ---
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();

  await pickCustomer(page, customerName);
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await pickEventDate(page, "2026-12-01", "2026-12-01");

  // Guests Information
  await page.getByLabel("Adults").fill("80");
  await page.getByLabel("Children (Under 5)").fill("5");
  await page.getByLabel("Children (5–10)").fill("15");

  // Meal Planning — a custom per-meal price, plus Menu assignment + the
  // food-item dialog (the section's actual core now).
  await page.getByRole("checkbox", { name: "Set a custom price per meal" }).check();
  await page.getByRole("button", { name: "All Lunch" }).click();
  const lunchSlot = page.getByTestId("meal-slot-2026-12-01-LUNCH");
  await expect(lunchSlot, "Lunch meal card should appear once checked").toBeVisible();
  await expect(lunchSlot.getByText("Menu not assigned")).toBeVisible();

  await lunchSlot.getByLabel("Menu").click();
  await page.getByRole("option", { name: menuName }).click();
  await expect(lunchSlot.getByText("Food selection required")).toBeVisible();

  await selectFoodItem(page, lunchSlot, itemName);
  await expect(lunchSlot.getByText("1 item selected")).toBeVisible();
  await expect(lunchSlot.getByText(itemName, { exact: true })).toBeVisible();

  await lunchSlot.getByLabel("Price for this meal").fill("300");

  // Venue & Delivery Details
  await page.getByLabel("Venue / Building Name").fill("Taj Hall");

  // Order Details — Taxes is gone; Extra / Service Cost replaces "Other Charges".
  await page.getByLabel("Discount").fill("100");
  await page.getByLabel("Transportation Cost").fill("30");
  await page.getByLabel("Extra / Service Cost").fill("20");

  // Payment Status — Advance Received lives here now (not Order Details).
  await page.getByLabel("Advance Received").fill("50");

  // Pricing summary live preview: subtotal = 150 (item) + 300 (custom meal
  // price) = 450; total = 450-100+30+20 = 400; balance = 400-50 = 350.
  await expect(page.getByText("₹450.00")).toBeVisible();
  await expect(page.getByText("₹400.00")).toBeVisible();
  await expect(page.getByText("₹350.00")).toBeVisible();

  await page.getByRole("button", { name: "Create Order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByText(customerName)).toBeVisible();
  await expect(page.getByText("₹400.00")).toBeVisible();

  // --- Orders Dashboard filters ---
  await page.getByLabel("Search").fill("no-such-customer-xyz");
  await expect(page.getByText(customerName)).not.toBeVisible();
  await page.getByLabel("Search").fill("");
  await expect(page.getByText(customerName)).toBeVisible();

  await page.getByLabel("Order status filter").click();
  await page.getByRole("option", { name: "Confirmed" }).click();
  await expect(page.getByText(customerName)).not.toBeVisible();
  await page.getByLabel("Order status filter").click();
  await page.getByRole("option", { name: "All Status" }).click();
  await expect(page.getByText(customerName)).toBeVisible();

  // --- Open the order, confirm fields round-tripped ---
  await page.getByText(customerName).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByLabel("Adults")).toHaveValue("80");
  await expect(page.getByTestId("meal-slot-2026-12-01-LUNCH").getByText(itemName)).toBeVisible();

  // --- Group 10.6: inline Event Creation Prompt (not a popup) ---
  await expect(page.getByText("Create an event for this order?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, create event" }).click();
  await expect(page.getByText("Event details", { exact: true })).toBeVisible();

  // --- Inline Event editing from the Order page itself (the Order/Event judgment call) ---
  await page.getByLabel("Guest Count").fill("100");
  await page.getByLabel("Venue", { exact: true }).fill("Taj Hall - Grand Ballroom");
  await page.getByRole("button", { name: "Save Event details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // --- "What does this mean?" explainer ---
  await page.getByRole("button", { name: "What does this mean?" }).click();
  await expect(page.getByText(/Order.*is the commercial/)).toBeVisible();
});

/**
 * Single Order vs Multi Order — a Multi Order groups Meal Planning into a
 * separate "Event N" block per date; every meal (regardless of Order Type)
 * assigns its own Menu and picks items from it via the food-item dialog.
 * Also covers the per-tenant configurable Order Number (Business Profile
 * settings) and the Order Type list filter.
 */
test("Multi Order: different Menus per meal, grouped into separate Event blocks, a configured Order Number, and the type filter", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-multiorder-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Multi");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("9800000099");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Close" }).click();

  // --- Configure Order Numbering (Business Profile settings) ---
  await page.goto("/settings/account/business-profile");
  // Onboarding was skipped, so the business name starts blank (the "Unnamed
  // Business" placeholder is never shown back in the field) — required to save.
  await page.getByLabel("Company / business name").fill(`Multi Order Test Co ${suffix}`);
  await page.getByLabel("Prefix").fill("AJ");
  await page.getByLabel("Starting number").fill("1");
  await page.getByLabel("Digits").fill("4");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // --- Customer ---
  const customerName = `Meera Shah ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone", { exact: true }).fill("9123456780");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Two Menus, each with its own Food Item assigned to it ---
  const lunchMenuName = `Lunch Menu ${suffix}`;
  const dinnerMenuName = `Dinner Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  for (const menuName of [lunchMenuName, dinnerMenuName]) {
    await page.getByRole("button", { name: "Add Menu Type" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Menu Name").fill(menuName);
    await page.getByLabel("Price Per Plate").fill("300");
    await page.getByRole("button", { name: "Create menu" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }

  const lunchItemName = `Lunch Special ${suffix}`;
  const dinnerItemName = `Dinner Special ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(lunchItemName);
  await page.getByLabel("Item Price Per Plate").fill("120");
  await page.getByRole("checkbox", { name: lunchMenuName }).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Item Name").fill(dinnerItemName);
  await page.getByLabel("Item Price Per Plate").fill("450");
  await page.getByRole("checkbox", { name: dinnerMenuName }).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Create a Multi Order across two days: each day is its own "Event" block ---
  await page.goto("/orders/new");
  await pickCustomer(page, customerName);
  await pickEventDate(page, "2026-12-05", "2026-12-06");

  // A multi-day range while untouched auto-prompts the Single -> Multi confirmation.
  await page.getByRole("alertdialog").getByRole("button", { name: "Switch to Multi Order" }).click();
  await expect(page.getByRole("button", { name: "Multi Order" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Event 1")).toBeVisible();
  await expect(page.getByText("Event 2")).toBeVisible();

  // "All Lunch"/"All Dinner" above are global bulk-select buttons (every day
  // at once) — picking a *different* meal per day means checking each
  // Event block's own meal checkbox directly instead.
  const event1 = page.getByText("Event 1").locator("..").locator("..");
  const event2 = page.getByText("Event 2").locator("..").locator("..");
  await event1.getByRole("checkbox", { name: "Lunch" }).check();
  await event2.getByRole("checkbox", { name: "Dinner" }).check();

  const lunchSlot = page.getByTestId("meal-slot-2026-12-05-LUNCH");
  await expect(lunchSlot, "Lunch meal card should render in Event 1").toBeVisible();
  await lunchSlot.getByLabel("Menu").click();
  await page.getByRole("option", { name: lunchMenuName }).click();
  await selectFoodItem(page, lunchSlot, lunchItemName);
  await expect(lunchSlot.getByText(lunchItemName, { exact: true })).toBeVisible();

  const dinnerSlot = page.getByTestId("meal-slot-2026-12-06-DINNER");
  await expect(dinnerSlot, "Dinner meal card should render in Event 2").toBeVisible();
  await dinnerSlot.getByLabel("Menu").click();
  await page.getByRole("option", { name: dinnerMenuName }).click();
  await selectFoodItem(page, dinnerSlot, dinnerItemName);
  await expect(dinnerSlot.getByText(dinnerItemName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create Order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  const orderCard = page.getByRole("link", { name: new RegExp(`AJ-0001.*${customerName}`) });
  await expect(orderCard).toBeVisible();
  await expect(orderCard.getByText("Multi Order", { exact: true })).toBeVisible();

  // --- Reopen the order — per-meal Menu/items survived the round trip ---
  await page.getByText(customerName).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByText("AJ-0001")).toBeVisible();
  await expect(page.getByTestId("meal-slot-2026-12-05-LUNCH").getByText(lunchItemName)).toBeVisible();
  await expect(page.getByTestId("meal-slot-2026-12-06-DINNER").getByText(dinnerItemName)).toBeVisible();

  // --- Order Type filter ---
  await page.goto("/orders");
  await page.getByLabel("Order type filter").click();
  await page.getByRole("option", { name: "Single Order" }).click();
  await expect(page.getByText(customerName)).not.toBeVisible();
  await page.getByLabel("Order type filter").click();
  await page.getByRole("option", { name: "Multi Order" }).click();
  await expect(page.getByText(customerName)).toBeVisible();
});
