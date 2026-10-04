import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

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
/** Local calendar date as YYYY-MM-DD (not toISOString, which shifts by the UTC offset). */
function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
 * Menu Planning's "Event Dates" sidebar (2026-09-29) — only rendered when
 * the event spans more than one day; one date is "focused" at a time and
 * only its own meal tabs/cards are in the DOM. Label format must match
 * menu-planning-section.tsx's own `formatDay` call for the sidebar row exactly.
 */
function formatSidebarDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

async function focusDate(page: Page, iso: string) {
  await page.getByRole("navigation", { name: "Event Dates" }).getByText(formatSidebarDate(iso)).click();
}

/** Matches the Copy-to-other-dates popover's own (year-less) row label format. */
function formatCopyRowDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
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
  const dialog = page.getByRole("dialog", { name: /Select Menu Items/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: new RegExp(itemName) }).click();
  await dialog.getByRole("button", { name: "Save Items" }).click();
  await expect(dialog).not.toBeVisible();
}

test("create an order with guests/meal planning/venue/payment, then create and edit its linked Event inline", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-orders-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Orders", lastName: "Tester" });

  // --- Setup: a Customer, an Event Type, a Menu, and a Food Item assigned to that Menu ---
  const customerName = `Asha Rao ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

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
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await page.getByLabel("Adults").fill("80");
  await page.getByLabel("Children (Under 5)").fill("5");
  await page.getByLabel("Children (5–10)").fill("15");

  // Meal Planning — a custom per-meal price, plus Menu assignment + the
  // food-item dialog (the section's actual core now). Meal-type checkboxes
  // became tappable tabs (2026-09-29): clicking an unselected one both
  // selects and expands it; a single-day event has no Event Dates sidebar.
  await page.getByRole("switch", { name: /Individual Pricing/ }).click();
  await expect(page.getByText("Individual Pricing On")).toBeVisible();
  await page.getByRole("button", { name: "Lunch" }).click();
  const lunchSlot = page.getByTestId("meal-slot-2026-12-01-LUNCH");
  await expect(lunchSlot, "Lunch meal card should appear once selected").toBeVisible();

  await lunchSlot.getByLabel("Menu").click();
  await page.getByRole("option", { name: menuName }).click();
  await expect(lunchSlot.getByText("No items selected")).toBeVisible();

  await selectFoodItem(page, lunchSlot, itemName);
  await expect(lunchSlot.getByText("1 item selected")).toBeVisible();
  await expect(lunchSlot.getByText(itemName, { exact: true })).toBeVisible();

  // Individual Pricing puts each meal's own price inline on its card (2026-09-29 — no longer a separate Pricing Details list).
  await lunchSlot.getByLabel("Price").fill("300");


  // Venue & Delivery Details
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByLabel("Venue / Building Name").fill("Taj Hall");

  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  // Order Details — Taxes is gone; Extra / Service Cost replaces "Other Charges".
  await page.getByLabel("Discount").fill("100");
  await page.getByLabel("Transportation Cost").fill("30");
  await page.getByLabel("Extra / Service Cost").fill("20");

  // Payment Status — Advance Received lives here now (not Order Details).
  await page.getByLabel("Advance Received").fill("50");

  // Pricing summary live preview (one rule: a dish inside the menu is included, so the 150 Paneer adds nothing):
  // subtotal = 300 (custom meal price); total = 300-100+30+20 = 250; balance = 250-50 = 200.
  await expect(page.getByText("₹300.00").first()).toBeVisible();
  await expect(page.getByText("₹250.00").first()).toBeVisible();
  await expect(page.getByText("₹200.00")).toBeVisible();

  await page.getByRole("button", { name: "Save Order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(page.getByText(customerName)).toBeVisible();
  await expect(page.getByText("₹250", { exact: true })).toBeVisible(); // card trims whole amounts (formatAmount)

  // --- Orders Dashboard filters ---
  await page.getByLabel("Search").fill("no-such-customer-xyz");
  await expect(page.getByText(customerName)).not.toBeVisible();
  await page.getByLabel("Search").fill("");
  await expect(page.getByText(customerName)).toBeVisible();

  await page.getByLabel("Order status filter").click();
  await page.getByRole("option", { name: "Approved", exact: true }).click();
  await expect(page.getByText(customerName)).not.toBeVisible();
  await page.getByLabel("Order status filter").click();
  await page.getByRole("option", { name: "All Status" }).click();
  await expect(page.getByText(customerName)).toBeVisible();

  // --- Open the order, confirm fields round-tripped ---
  await page.getByText(customerName).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByLabel("Adults")).toHaveValue("80");
  // The detail page splits the order into tabs (AJ, 2026-09-30).
  await expect(page.getByRole("tab", { name: "Order Details" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await expect(page.getByTestId("meal-slot-2026-12-01-LUNCH").getByText(itemName)).toBeVisible();
  // The menu is edited in Menu Approvals now, so the order page shows it read-only (AJ, 2026-09-30).
  await expect(page.getByRole("button", { name: "Edit Items" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Menu" })).toBeVisible();

  // --- The Event is created automatically when the order is saved (AJ, 2026-09-27) ---
  await expect(page.getByText("Create an event for this order?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Event details" })).toHaveCount(0);
  const operations = page.getByTestId("event-operations-card");
  // A kitchen with a single location has no assigned kitchen to pick or show (AJ, 2026-10-04).
  await expect(operations).toHaveCount(0);
  await expect(page.getByText("Assigned Kitchen")).toHaveCount(0);
  await page.getByRole("tab", { name: "Inventory" }).click();
  await expect(page.getByTestId("required-inventory-card")).toBeVisible();

  // Sidebar summary carries the order number, status, kitchen and timestamps.
  await expect(page.getByRole("heading", { name: "Order Summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy order summary" })).toBeVisible();

  // Nothing has been sent to the customer yet, so there is no version history to open.
  await expect(page.getByRole("button", { name: "View History" })).toHaveCount(0);
});

/**
 * Single Order vs Multi Order — a Multi Order groups Meal Planning into a
 * separate "Event N" block per date; every meal (regardless of Order Type)
 * assigns its own Menu and picks items from it via the food-item dialog.
 * Also covers the per-tenant configurable Order Number (Business Profile
 * settings) and the Order Type list filter.
 */
test("Multi Order: different Menus per meal, grouped into separate Event blocks, a configured Order Number, and the type filter", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-multiorder-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Multi", lastName: "Tester" });

  // --- Configure Order Numbering (Business Profile settings) ---
  await page.goto("/settings/account/business-profile");
  await page.getByRole("button", { name: "Edit Profile" }).click(); // opens in view mode (AJ, 2026-09-30)
  // Onboarding was skipped, so the business name starts blank (the "Unnamed
  // Business" placeholder is never shown back in the field) — required to save.
  await page.getByLabel("Company / business name").fill(`Multi Order Test Co ${suffix}`);
  await page.getByLabel("Prefix").fill("AJ");
  await page.getByLabel("Starting number").fill("1");
  await page.getByLabel("Digits").fill("4");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Edit Profile" })).toBeVisible(); // back to the read-only view
  await expect(page.getByText("AJ-0001", { exact: true })).toBeVisible(); // Next Order Number

  // --- Customer ---
  const customerName = `Meera Shah ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone", { exact: true }).fill("9123456780");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Reception ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
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

  // --- Create a Multi Order across two days: the Event Dates sidebar focuses one date at a time (2026-09-29) ---
  await page.goto("/orders/new");
  await pickCustomer(page, customerName);
  await pickEventDate(page, "2026-12-05", "2026-12-06");
  // A date range switches the order to Multi Order by itself and says so (AJ, 2026-09-27).
  await expect(page.getByRole("alertdialog")).toContainText("more than one date");
  await page.getByRole("alertdialog").getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("button", { name: "Multi Order" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  const sidebar = page.getByRole("navigation", { name: "Event Dates" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText(formatSidebarDate("2026-12-05"))).toBeVisible();
  await expect(sidebar.getByText(formatSidebarDate("2026-12-06"))).toBeVisible();

  // Day 1 (already focused by default) gets Lunch; switching focus to Day 2 for Dinner.
  await page.getByRole("button", { name: "Lunch" }).click();
  const lunchSlot = page.getByTestId("meal-slot-2026-12-05-LUNCH");
  await expect(lunchSlot, "Lunch meal card should render for the focused date").toBeVisible();
  await lunchSlot.getByLabel("Menu").click();
  await page.getByRole("option", { name: lunchMenuName }).click();
  await selectFoodItem(page, lunchSlot, lunchItemName);
  await expect(lunchSlot.getByText(lunchItemName, { exact: true })).toBeVisible();

  await focusDate(page, "2026-12-06");
  await page.getByRole("button", { name: "Dinner" }).click();
  const dinnerSlot = page.getByTestId("meal-slot-2026-12-06-DINNER");
  await expect(dinnerSlot, "Dinner meal card should render once Day 2 is focused").toBeVisible();
  await dinnerSlot.getByLabel("Menu").click();
  await page.getByRole("option", { name: dinnerMenuName }).click();
  await selectFoodItem(page, dinnerSlot, dinnerItemName);
  await expect(dinnerSlot.getByText(dinnerItemName, { exact: true })).toBeVisible();

  // Copy to other dates (new, 2026-09-29): Day 2's Dinner selection copies onto Day 1 too, without disturbing Day 1's own Lunch.
  // Scoped to the popover content — its own checkbox-row date format has no
  // year (menu-planning-section.tsx), unlike the sidebar's own row label, and
  // the sidebar's day-1 button sits directly behind the open popover, so an
  // unscoped locator can match (or block on) the wrong, obscured element.
  await page.getByRole("button", { name: "Copy to other dates" }).click();
  const copyPopover = page.locator('[data-slot="popover-content"]');
  await expect(copyPopover).toBeVisible();
  await copyPopover.getByText(formatCopyRowDate("2026-12-05")).click();
  await copyPopover.getByRole("button", { name: /Apply to 1 date/ }).click();
  await focusDate(page, "2026-12-05");
  await expect(page.getByTestId("meal-slot-2026-12-05-LUNCH")).toBeVisible();
  await expect(page.getByTestId("meal-slot-2026-12-05-DINNER").getByText(dinnerItemName, { exact: true })).toBeVisible();
  // Remove it again so the rest of this test's totals/assertions match the original Lunch-only/Dinner-only plan.
  await page.getByTestId("meal-slot-2026-12-05-DINNER").getByRole("button", { name: "Remove Dinner", exact: true }).click();
  await expect(page.getByTestId("meal-slot-2026-12-05-DINNER")).toHaveCount(0);

  await page.getByRole("button", { name: "Save Order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  // Orders card (2026-09-26): the customer name is the card's stretched link,
  // not the whole card, so find the card by test id rather than as one link.
  const orderCard = page.getByTestId("order-card").filter({ hasText: customerName });
  await expect(orderCard).toBeVisible();
  await expect(orderCard.getByText("AJ-0001", { exact: true })).toBeVisible();
  await expect(orderCard.getByText("Multi Order", { exact: true })).toBeVisible();
  // Card structure per AJ's reference: captioned stat cells, amount + payment status with the paid/pending split.
  await expect(orderCard.getByText("Event Date", { exact: true })).toBeVisible();
  await expect(orderCard.getByText("Starts in", { exact: true })).toBeVisible(); // Dec 2026 event is in the future
  await expect(orderCard.getByText("Order Amount", { exact: true })).toBeVisible();
  await expect(orderCard.getByText("5–6 Dec 2026", { exact: true })).toBeVisible();
  await expect(orderCard.getByText(/^\d+ days$/), "a Dec 2026 event is in the future").toBeVisible();
  await expect(orderCard.getByText(eventTypeName)).toBeVisible();
  await expect(orderCard.getByText("Unpaid")).toBeVisible();

  // --- Reopen the order — per-meal Menu/items survived the round trip ---
  await page.getByText(customerName).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByRole("heading", { name: "AJ-0001" })).toBeVisible();
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  // The sidebar defaults to focusing Day 1 on a fresh page load.
  await expect(page.getByTestId("meal-slot-2026-12-05-LUNCH").getByText(lunchItemName)).toBeVisible();
  await focusDate(page, "2026-12-06");
  await expect(page.getByTestId("meal-slot-2026-12-06-DINNER").getByText(dinnerItemName)).toBeVisible();

  // --- Order Type filter ---
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await page.getByLabel("Order type filter").click();
  await page.getByRole("option", { name: "Single Order" }).click();
  await expect(page.getByText(customerName)).not.toBeVisible();
  await page.getByLabel("Order type filter").click();
  await page.getByRole("option", { name: "Multi Order" }).click();
  await expect(page.getByText(customerName)).toBeVisible();

  // --- Event Type filter (grid and list share it) ---
  await page.getByLabel("Event type filter").click();
  await page.getByRole("option", { name: "All Event Types" }).click();
  await expect(page.getByText(customerName)).toBeVisible();
  await page.getByLabel("Event type filter").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await expect(page).toHaveURL(/eventType=/);
  await expect(page.getByText(customerName)).toBeVisible();

  // --- List view (AJ, 2026-09-26/27): order #, order type, customer, event + event type, guests, amount + payment, status ---
  await page.getByRole("button", { name: "List view" }).click();
  const listRow = page.getByRole("row").filter({ hasText: customerName });
  await expect(listRow).toContainText("AJ-0001");
  await expect(listRow).toContainText("Multi Order");
  await expect(listRow).toContainText(eventTypeName);
  await expect(listRow).toContainText("Pending Review");
  // Merged columns (AJ, 2026-09-27): Amount (total + payment status text) and Event (date + event type).
  await expect(listRow).toContainText("Unpaid");
  await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Event", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Payment" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Total" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Event Type" })).toHaveCount(0);
  await expect(listRow, "the status description was dropped from the list").not.toContainText("Team to review menu & items.");
  await expect(listRow.getByRole("link", { name: customerName })).toBeVisible();
  await page.getByRole("button", { name: "Grid view" }).click();

  // --- The card's 3-dot menu: View / Edit navigates, Delete asks first and then removes the card ---
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  const card = page.getByTestId("order-card").filter({ hasText: customerName });
  await card.getByRole("button", { name: "Actions for AJ-0001" }).click();
  await page.getByRole("menuitem", { name: "View / Edit Order" }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);

  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await card.getByRole("button", { name: "Actions for AJ-0001" }).click();
  await page.getByRole("menuitem", { name: "Delete Order" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible(); // cancelling deletes nothing
  await card.getByRole("button", { name: "Actions for AJ-0001" }).click();
  await page.getByRole("menuitem", { name: "Delete Order" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
});

test("Multi Order is automatic for a second meal type on one day; past dates can't be picked", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-autokind-${Date.now()}@example.test`;
  cleanupEmails.push(email);

  await signUpCaterer(page, email, { firstName: "Auto", lastName: "Kind", phone: "9800000077" });

  await page.goto("/orders/new");

  // No backdated orders: days before today are greyed out and can't be clicked.
  await page.getByLabel("Event Date").click();
  const popover = page.locator('[data-slot="popover-content"]');
  await popover.getByRole("button", { name: "Previous month" }).click();
  await expect(popover.getByRole("button", { name: "15", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Today is allowed, as a single day: still a Single Order with one meal type.
  await pickEventDate(page, toLocalIso(new Date()), toLocalIso(new Date()));
  await expect(page.getByRole("button", { name: /Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await page.getByRole("button", { name: "Breakfast" }).click();
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: /Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();

  // A second meal type on the same day turns it into a Multi Order, with a popup —
  // but it's still one day, so no Event Dates sidebar appears (2026-09-29).
  await page.getByRole("button", { name: "Dinner" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("more than one meal type");
  await page.getByRole("alertdialog").getByRole("button", { name: "Got it" }).click();
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: /Multi Order/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("navigation", { name: "Event Dates" })).toHaveCount(0);
  // ...and it can't be turned back to Single while both meals are there.
  await expect(page.getByRole("button", { name: /Single Order/ })).toBeDisabled();

  // Removing the second meal brings it back to Single on its own (AJ, 2026-09-30).
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await page.getByRole("button", { name: "Remove Dinner", exact: true }).click();
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: /Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();

  // Total Guests is computed and read-only.
  await page.getByLabel("Adults").fill("10");
  await page.getByLabel("Children (5–10)").fill("4");
  await expect(page.getByLabel("Total Guests")).toHaveValue("14");
  await expect(page.getByLabel("Total Guests")).not.toBeEditable();
});

test("the food item drawer: category limits are compulsory, extra items are charged per guest, add-ons, and the veg preference", async ({ page }) => {
  test.setTimeout(240_000);
  const email = `e2e-drawer-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Drawer", lastName: "Tester", phone: "9800000055" });

  // --- Catalog: a Menu, a Starters category limited to 2 on it, 3 veg dishes + 1 non-veg dish, and one per-plate add-on ---
  const customerName = `Drawer Customer ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone", { exact: true }).fill("9876500055");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Reception ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const menuName = `Feast Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const startersName = `Starters ${suffix}`;
  await page.goto("/menu-catalog/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category Name").fill(startersName);
  await page.getByText(menuName).click();
  await page.getByPlaceholder("Max selection").fill("2");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.goto("/menu-catalog/items");
  const dishes = [
    { name: `Paneer Tikka ${suffix}`, price: "100", nonVeg: false },
    { name: `Hara Bhara Kebab ${suffix}`, price: "100", nonVeg: false },
    { name: `Dahi Kebab ${suffix}`, price: "150", nonVeg: false },
    { name: `Chicken Tikka ${suffix}`, price: "180", nonVeg: true },
  ];
  for (const dish of dishes) {
    await page.getByRole("button", { name: "Add Item" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Item Name").fill(dish.name);
    await page.getByLabel("Item Price Per Plate").fill(dish.price);
    if (dish.nonVeg) {
      await page.getByLabel("Veg / Non-Veg").click();
      await page.getByRole("option", { name: "Non-Vegetarian" }).click();
    }
    await page.getByRole("dialog").getByText(menuName).click();
    await page.getByRole("dialog").getByText(startersName).click();
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }

  const addOnName = `Live Chaat ${suffix}`;
  await page.goto("/menu-catalog/add-ons");
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await page.getByLabel("Name").fill(addOnName);
  await page.getByLabel("Price", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Create add-on" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- The order: 10 guests, one Lunch, Vegetarian preference ---
  await page.goto("/orders/new");
  await pickCustomer(page, customerName);
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  const tomorrow = new Date(Date.now() + 3 * 86_400_000);
  await pickEventDate(page, toLocalIso(tomorrow), toLocalIso(tomorrow));
  await page.getByRole("tab", { name: "Guests & Menu Planning" }).click();
  await page.getByLabel("Adults").fill("10");
  await page.getByRole("button", { name: /^Vegetarian/ }).click();
  await page.getByRole("button", { name: "Lunch" }).click();
  const slot = page.getByTestId(`meal-slot-${toLocalIso(tomorrow)}-LUNCH`);
  await slot.getByLabel("Menu").click();
  await page.getByRole("option", { name: menuName }).click();

  await slot.getByRole("button", { name: "Select Food Items" }).click();
  const drawer = page.getByRole("dialog", { name: /Select Menu Items/ });
  await expect(drawer).toBeVisible();

  // Vegetarian preference hides the non-veg dish; Veg badges show on the rest.
  await expect(drawer.getByText(dishes[3].name)).toHaveCount(0);
  await expect(drawer.getByText(dishes[0].name)).toBeVisible();
  await expect(drawer.getByText("Veg", { exact: true }).first()).toBeVisible();

  // The Starters limit is compulsory: 2 to pick before it can be saved.
  await expect(drawer.getByTestId("picker-shortfall")).toContainText(`Pick 2 more from ${startersName}`);
  await expect(drawer.getByRole("button", { name: "Save Items" })).toBeDisabled();
  await drawer.getByRole("button", { name: new RegExp(dishes[0].name) }).click();
  await expect(drawer.getByTestId("picker-shortfall")).toContainText("Pick 1 more");
  await drawer.getByRole("button", { name: new RegExp(dishes[1].name) }).click();
  await expect(drawer.getByTestId("picker-shortfall")).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Save Items" })).toBeEnabled();

  // A third dish is an Extra Item: it asks first, and is charged price x guests (150 x 10 = 1,500).
  await drawer.getByRole("button", { name: new RegExp(dishes[2].name) }).click();
  const extraDialog = page.getByRole("dialog", { name: "Add Extra Item?" });
  await expect(extraDialog).toContainText("₹1,500");
  await extraDialog.getByRole("button", { name: "Add as Extra Item" }).click();
  await expect(drawer.getByText("Extra · ₹1,500")).toBeVisible();

  // Add-ons are optional: 20 per plate x 10 guests. No "All Items" tab any more (AJ, 2026-09-28) —
  // categories are mutually exclusive, so Add-ons has to be selected as its own tab first.
  await drawer.getByRole("button", { name: "Add-ons" }).click();
  await drawer.getByRole("button", { name: new RegExp(addOnName) }).click();
  await drawer.getByRole("button", { name: "Save Items" }).click();
  await expect(drawer).not.toBeVisible();

  await expect(slot.getByText("3 items selected")).toBeVisible().catch(() => undefined);
  await expect(slot.getByText("Extra", { exact: true })).toBeVisible();
  await expect(slot.getByText("Add-on", { exact: true })).toBeVisible();
  // 300 x 10 adults (the Menu) + the two included dishes (0) + 150 x 10 (extra) + 20 x 10 (add-on) = 4,700.
  await expect(page.getByRole("complementary").getByText("₹4700.00").first()).toBeVisible();

  // Cancel throws away a draft.
  await slot.getByRole("button", { name: "Edit Items" }).click();
  const again = page.getByRole("dialog", { name: /Select Menu Items/ });
  await again.getByRole("button", { name: "Clear All" }).click();
  await again.getByRole("button", { name: "Cancel" }).click();
  await expect(slot.getByText("Extra", { exact: true })).toBeVisible();
});

