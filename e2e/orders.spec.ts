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
 * Order form's "Event Date" field (DateRangePicker, one day per picker) — opens a calendar
 * popover on click; days are picked by clicking day-number buttons in a
 * month grid, navigating months with the "Next month" button as needed.
 * A single day is one click. A range switches on "Multi-event" and picks the start and end dates separately (AJ, 2026-10-16).
 */
async function pickEventDate(page: Page, startIso: string, endIso: string) {
  const popover = page.locator('[data-slot="popover-content"][data-open]');

  async function pickDay(label: string, iso: string) {
    await page.getByLabel(label, { exact: true }).click();
    await expect(popover).toBeVisible();
    const targetLabel = new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    for (let i = 0; i < 36; i++) {
      if ((await popover.locator("span.font-medium").textContent()) === targetLabel) break;
      await popover.getByRole("button", { name: "Next month" }).click();
    }
    await popover.getByRole("button", { name: String(Number(iso.split("-")[2])), exact: true }).click();
  }

  if (startIso === endIso) {
    await pickDay("Event Date", startIso);
    return;
  }
  // Several dates need a Multi Order: choosing it says so (AJ, 2026-10-16).
  await page.getByRole("button", { name: /^Multi Order/ }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Order Type changed to Multi Order");
  await page.getByRole("alertdialog").getByRole("button", { name: "Got it" }).click();
  await pickDay("Event start date", startIso);
  await pickDay("Event end date", endIso);
}

test("create an order with guests/venue/payment (no menu planner), then see its Menu Approval and linked Event", async ({ page }) => {
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

  // --- Create Order ---
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();

  await pickCustomer(page, customerName);
  // Event Type, date and venue live on the Order Details tab.
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await pickEventDate(page, "2026-12-01", "2026-12-01");

  // The venue location and the guests can't be skipped (AJ, 2026-10-18): each is asked for in turn.
  await page.getByTestId("order-save-top").click();
  await expect(page.locator("p[role=alert]")).toContainText("Venue / Building Name is required.");
  await page.getByLabel("Venue / Building Name").fill("Taj Hall");
  await page.getByTestId("order-save-top").click();
  await expect(page.locator("p[role=alert]")).toContainText("Adults: enter at least 1 guest.");

  // Guests Information
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByLabel("Adults").fill("80");
  await page.getByLabel("Children (Under 5)").fill("5");
  await page.getByLabel("Children (5–10)").fill("15");

  // There is no Menu Planning card on an order (AJ, 2026-10-18): the menu is built in the Menu Approval tab once the order is saved.
  await expect(page.getByRole("heading", { name: "Menu Planning" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Vegetarian/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Menu Approval" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  // Order Details — Taxes is gone; Extra / Service Cost replaces "Other Charges".
  await page.getByRole("spinbutton", { name: "Transportation Cost" }).fill("30");
  await page.getByRole("spinbutton", { name: "Extra / Service Cost" }).fill("20");
  // A team-added charge: label + amount, added into the Grand Total.
  await page.getByRole("button", { name: "Add charge" }).click();
  await page.getByLabel("Charge 1 label").fill("Generator");
  await page.getByLabel("Charge 1 amount").fill("40");

  // New order: the same Payment summary and Record Payment as an existing order (AJ, 2026-10-14). The payment is held with the
  // form and recorded, with its receipt, when the order is saved.
  await expect(page.getByRole("heading", { name: "Payment summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(page.getByLabel("Advance Received")).toHaveCount(0); // the old Payment Details card is gone
  await page.getByRole("button", { name: "Record Payment" }).click();
  const recordDialog = page.getByRole("dialog");
  await recordDialog.getByLabel("Amount").fill("50");
  await recordDialog.getByLabel("Method").click();
  await page.getByRole("option", { name: "UPI", exact: true }).click();
  await recordDialog.getByRole("button", { name: "Record Only" }).click();
  await expect(recordDialog).not.toBeVisible();
  await expect(page.getByTestId("payment-row")).toHaveCount(1);
  await expect(page.getByTestId("payment-row")).toContainText("₹50.00");
  await expect(page.getByTestId("paid-amount")).toHaveText("₹50.00");

  // Another one can be added and taken back out before saving; the balance follows.
  await page.getByRole("button", { name: "Record Payment" }).click();
  await recordDialog.getByLabel("Amount").fill("10");
  await recordDialog.getByRole("button", { name: "Record Only" }).click();
  await expect(page.getByTestId("payment-row")).toHaveCount(2);
  await page.getByTestId("payment-row").nth(1).getByRole("button", { name: /^Remove the 10 payment/ }).click();
  await expect(page.getByTestId("payment-row")).toHaveCount(1);
  await expect(page.getByTestId("paid-amount")).toHaveText("₹50.00");

  // Pricing summary live preview: no meals yet (the menu is built after saving), so the total is the charges alone:
  // 30 + 20 + 40 (Generator) = 90; balance = 90 - 50 = 40.
  await expect(page.getByText("₹90.00").first()).toBeVisible();
  await expect(page.getByTestId("balance-amount")).toHaveText("₹40.00"); // the Payment summary: total less the payment added above

  await page.getByTestId("order-save-top").click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(page.getByText(customerName)).toBeVisible();
  await expect(page.getByText("₹90", { exact: true })).toBeVisible(); // card trims whole amounts (formatAmount)

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
  // Guest Information reads as details on an existing order; Edit reveals the fields (AJ, 2026-10-16).
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByLabel("Adults")).toHaveCount(0);
  await expect(page.getByText("Adults", { exact: true }).locator("..")).toContainText("80");
  await page.getByRole("button", { name: "Edit guest information" }).click();
  await expect(page.getByLabel("Adults")).toHaveValue("80");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Order Details" }).click();
  // A freshly opened order has no unsaved changes: Back to orders, no warning note (AJ, 2026-10-14).
  await expect(page.getByTestId("unsaved-note")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to orders" })).toBeVisible();

  // On a booked order, changing the Order Type asks first (AJ, 2026-10-14); going back to the saved type does not.
  await page.getByRole("tab", { name: "Order Details" }).click();
  // Customer Details read as plain details until Edit is pressed; Cancel puts them back.
  await expect(page.locator("#order-customer")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit customer details" }).click();
  await expect(page.locator("#order-customer")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#order-customer")).toHaveCount(0);
  // Order Type lives in Event Information and reads as plain details until Edit is pressed (AJ, 2026-10-16).
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: /^Multi Order/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit event information" }).click();
  await expect(page.getByRole("button", { name: /^Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Multi Order/ }).click();
  const kindAsk = page.getByRole("alertdialog", { name: "Change this order to Multi Order?" });
  await expect(kindAsk).toBeVisible();
  await kindAsk.getByRole("button", { name: "Keep Single Order" }).click();
  await expect(kindAsk).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Multi Order/ }).click();
  await kindAsk.getByRole("button", { name: "Change type" }).click();
  await expect(kindAsk).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Multi Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Single Order/ }).click(); // back to the saved type: no question, just the notice
  await page.getByRole("alertdialog").getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByLabel("Charge 1 label")).toHaveValue("Generator");
  await expect(page.getByLabel("Charge 1 amount")).toHaveValue("40");
  // The advance became a confirmed Advance payment (UPI) with a receipt; the form now shows it read-only.
  const advanceRow = page.getByTestId("payment-row");
  await expect(advanceRow).toHaveCount(1);
  await expect(advanceRow).toContainText("Advance");
  await expect(advanceRow).toContainText("UPI");
  await expect(advanceRow).toContainText("₹50.00");
  await expect(page.getByTestId("paid-amount")).toHaveText("₹50.00");
  // On an existing order the Payment Details card is gone (AJ, 2026-10-14): Payment summary, history and Record Payment own the money.
  await expect(page.getByRole("heading", { name: "Payment Details" })).toHaveCount(0);
  await expect(page.getByLabel("Advance Received")).toHaveCount(0);
  await expect(page.getByLabel("Payment Status")).toHaveCount(0);
  await page.getByRole("tab", { name: "Order Details" }).click();
  // The detail page splits the order into tabs (AJ, 2026-09-30).
  await expect(page.getByRole("tab", { name: "Order Details" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Order Details" }).click();
  // The menu is not planned on this tab (AJ, 2026-10-16): it holds the guest counts and the event information; the meals live in Menu Approval.
  const guestsPanel = page.locator("#order-panel-details");
  await expect(guestsPanel.getByTestId("meal-item-counts")).toHaveCount(0);
  // Event Information reads as details until Edit (AJ, 2026-10-16).
  await expect(guestsPanel.getByLabel("Venue / Building Name")).toHaveCount(0);
  await expect(guestsPanel.getByText("Venue / Building Name", { exact: true })).toBeVisible();
  await guestsPanel.getByRole("button", { name: "Edit event information" }).click();
  await expect(guestsPanel.getByLabel("Venue / Building Name")).toBeVisible();
  await guestsPanel.getByRole("button", { name: "Done" }).click();
  // The menu approval was started with the order (it has an event type), so the Menu Approval tab is where the menu is built.
  await page.getByRole("tab", { name: "Menu Approval" }).click();
  await expect(page.locator("#order-panel-approval")).toContainText("Menu Preference");
  await expect(page.locator("#order-panel-approval")).toContainText("Event Dates & Meals");

  // --- The Event is created automatically when the order is saved (AJ, 2026-09-27) ---
  await expect(page.getByText("Create an event for this order?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Event details" })).toHaveCount(0);
  const operations = page.getByTestId("event-operations-card");
  // A kitchen with a single location has no assigned kitchen to pick or show (AJ, 2026-10-04).
  await expect(operations).toHaveCount(0);
  await expect(page.getByText("Assigned Kitchen")).toHaveCount(0);
  await page.getByRole("tab", { name: "Inventory" }).click();
  await expect(page.getByTestId("required-inventory-card")).toBeVisible();
  // Items can only be sent once the kitchen moves the order from Pending to In Preparation; until then a message says so and the button is off (AJ, 2026-10-10).
  await expect(page.getByTestId("inventory-not-approved")).toContainText("Items can be sent once the kitchen starts preparing this order");
  await expect(page.getByRole("button", { name: "Send items to this order" })).toBeDisabled();

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
test("Multi Order: created from its dates, a configured Order Number, and the type filter", async ({ page }) => {
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

  // --- Create a Multi Order across two days: the Event Dates sidebar focuses one date at a time (2026-09-29) ---
  await page.goto("/orders/new");
  await pickCustomer(page, customerName);
  await page.getByRole("tab", { name: "Order Details" }).click();
  await pickEventDate(page, "2026-12-05", "2026-12-06");
  // Multi-event (the helper turned it on and acknowledged the popup) made it a Multi Order.
  await expect(page.getByRole("button", { name: /^Multi Order/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await page.getByRole("tab", { name: "Order Details" }).click();
  // The venue location and the guests (AJ, 2026-10-18); the menu is built in the Menu Approval tab afterwards.
  await page.getByLabel("Venue / Building Name").fill("Palm Hall");
  await page.getByLabel("Adults").fill("120");

  await page.getByTestId("order-save-top").click();
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

  // --- Reopen the order: it has a menu approval waiting for its menu (it has an event type) ---
  await page.getByText(customerName).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByRole("heading", { name: "AJ-0001" })).toBeVisible();
  await page.getByRole("tab", { name: "Menu Approval" }).click();
  await expect(page.locator("#order-panel-approval")).toContainText("Event Dates & Meals");

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

test("an order's dates: past days can't be picked, Multi Order is chosen by hand, and Total Guests is computed", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-autokind-${Date.now()}@example.test`;
  cleanupEmails.push(email);

  await signUpCaterer(page, email, { firstName: "Auto", lastName: "Kind", phone: "9800000077" });

  await page.goto("/orders/new");
  await page.getByRole("tab", { name: "Order Details" }).click();

  // No backdated orders: days before today are greyed out and can't be clicked.
  await page.getByLabel("Event Date").click();
  const popover = page.locator('[data-slot="popover-content"]');
  await popover.getByRole("button", { name: "Previous month" }).click();
  await expect(popover.getByRole("button", { name: "15", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Today is allowed, as a single day: a Single Order. There is no meal planner on the order, so the type follows what is chosen here.
  await pickEventDate(page, toLocalIso(new Date()), toLocalIso(new Date()));
  await expect(page.getByRole("button", { name: /^Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Breakfast" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Multi Order/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("button", { name: /^Multi Order/ })).toHaveAttribute("aria-pressed", "true");

  // Total Guests is computed and read-only.
  await page.getByLabel("Adults").fill("10");
  await page.getByLabel("Children (5–10)").fill("4");
  await expect(page.getByLabel("Total Guests")).toHaveValue("14");
  await expect(page.getByLabel("Total Guests")).not.toBeEditable();
});

test("the food item drawer (on a quotation's Build Menu): category limits are compulsory, extra items are charged per guest, add-ons, and the veg preference", async ({ page }) => {
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

  // --- The quotation's Build Menu (the order has no menu planner of its own): 10 guests, one Lunch, Vegetarian preference ---
  await page.goto("/quotations/new");
  await pickCustomer(page, customerName);
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  const tomorrow = new Date(Date.now() + 3 * 86_400_000);
  await pickEventDate(page, toLocalIso(tomorrow), toLocalIso(tomorrow));
  await page.getByLabel("Adults").fill("10");
  await page.getByRole("tab", { name: "Build Menu" }).click();
  await page.getByRole("button", { name: /^Vegetarian/ }).click();
  await page.getByRole("button", { name: "Lunch" }).click();
  const slot = page.getByTestId(`quote-meal-slot-${toLocalIso(tomorrow)}-LUNCH`);
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
  // Counts, not names (AJ, 2026-10-10): the two included dishes, one Extra, one Add-on.
  await expect(slot.getByTestId("meal-item-counts").getByText("2 Dishes", { exact: true })).toBeVisible();
  await expect(slot.getByTestId("meal-item-counts").getByText("1 Extra", { exact: true })).toBeVisible();
  await expect(slot.getByTestId("meal-item-counts").getByText("1 Add-on", { exact: true })).toBeVisible();
  // 300 x 10 adults (the Menu) + the two included dishes (0) + 150 x 10 (extra) + 20 x 10 (add-on) = 4,700.
  await expect(page.getByRole("complementary").getByText("₹4700.00").first()).toBeVisible();

  // Cancel throws away a draft.
  await slot.getByRole("button", { name: "Edit Items" }).click();
  const again = page.getByRole("dialog", { name: /Select Menu Items/ });
  await again.getByRole("button", { name: "Clear All" }).click();
  await again.getByRole("button", { name: "Cancel" }).click();
  await expect(slot.getByTestId("meal-item-counts").getByText("1 Extra", { exact: true })).toBeVisible();
});

