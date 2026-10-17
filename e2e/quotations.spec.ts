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
 * "Next month" button as needed. A single-day date commits on one click (the Single Order picker).
 */
async function pickEventDate(page: Page, startIso: string, endIso: string) {
  // One day (Single Order): the date picker commits on one click. Several dates need a Multi Order, which this spec does not use.
  expect(startIso).toBe(endIso);
  await page.getByLabel("Event Date", { exact: true }).click();
  const popover = page.locator('[data-slot="popover-content"][data-open]');
  await expect(popover).toBeVisible();
  const targetLabel = new Date(`${startIso}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  for (let i = 0; i < 36; i++) {
    if ((await popover.locator("span.font-medium").textContent()) === targetLabel) break;
    await popover.getByRole("button", { name: "Next month" }).click();
  }
  await popover.getByRole("button", { name: String(Number(startIso.split("-")[2])), exact: true }).click();
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
  // The event type, event date, venue location and guests can't be skipped (AJ, 2026-10-18): each is asked for in turn.
  await page.getByRole("button", { name: "Create Quotation" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Event Type is required.");
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await page.getByRole("button", { name: "Create Quotation" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Event Date is required.");
  await pickEventDate(page, "2026-12-15", "2026-12-15");
  await page.getByRole("button", { name: "Create Quotation" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Venue Location is required.");
  await page.getByLabel("Venue Location").fill("Grand Ballroom");
  await page.getByRole("button", { name: "Create Quotation" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Adults: enter at least 1 guest.");

  // Guest Information sits with the customer and event on the Order Details tab.
  await page.getByLabel("Adults").fill("20");
  // The menu is built on its own tab, with the stage banner a menu approval has.
  await page.getByRole("tab", { name: "Build Menu" }).click();
  await expect(page.getByTestId("quotation-stage-banner")).toContainText("Build the menu for this quotation");
  // A menu can only be chosen once a Menu Preference is set.
  await page.getByRole("button", { name: /^Vegetarian/ }).click();

  // Build Menu — same per-meal drawer flow as Create Order.
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
  await page.getByRole("spinbutton", { name: "Discount" }).fill("20");
  await page.getByRole("spinbutton", { name: "Transportation Cost" }).fill("10");
  await page.getByRole("spinbutton", { name: "Extra / Service Cost" }).fill("7");

  // subtotal = 6000 (300/plate Menu x 20 adults; the Biryani is included); total = 6000 - 20 + 10 + 7 = 5997
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

  // Sent: the information is locked, as an order's is while its menu is with the customer (AJ, 2026-10-18). Recall to edit, then send again.
  await expect(page.getByTestId("quotation-locked-banner")).toContainText("The quotation has been sent, so it is read-only.");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expect(page.getByLabel("Venue Location")).toBeDisabled();
  await page.getByRole("tab", { name: "Build Menu" }).click();
  await expect(page.getByTestId("quotation-stage-banner")).toContainText("the menu is read-only");
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByRole("button", { name: "Recall to edit" }).click();
  await expect(page.getByTestId("quotation-locked-banner")).toHaveCount(0);
  await expect(page.getByLabel("Venue Location")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(async () => {
    const send = page.getByRole("button", { name: "Send Quotation" });
    if (await send.isVisible()) await send.click();
    await expect(page.getByTestId("quotation-locked-banner")).toBeVisible({ timeout: 4_000 });
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
  // The dishes sit in a closed meal card; "View all" lists them (same design as Review & Approve).
  await publicPage.getByRole("button", { name: /^View all \d+ items?/ }).first().click();
  await expect(publicPage.getByText(itemName, { exact: true })).toBeVisible();
  await publicPage.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(publicPage.getByTestId("approval-total")).toHaveText("₹5,997.00");
  await expect(publicPage.getByText("Viewed", { exact: true })).toBeVisible();

  // The customer asks for a change: while the team works on it they are shown nothing of the quotation, only that it is being updated.
  await publicPage.getByRole("button", { name: "Request Changes" }).click();
  await publicPage.getByLabel("What would you like changed?").fill("Please add one more starter.");
  await publicPage.getByRole("button", { name: "Send Request" }).click();
  await expect(publicPage.getByTestId("quotation-being-updated")).toContainText("We're updating your quotation");
  await expect(publicPage.getByTestId("quotation-being-updated")).toContainText("Please add one more starter.");
  await expect(publicPage.getByTestId("approval-total")).toHaveCount(0);
  // The team edits it (a quotation sent back for changes is editable) and sends it again: the same link shows the quotation once more.
  await page.reload();
  await expect(page.getByTestId("quotation-locked-banner")).toHaveCount(0);
  await expect(page.getByLabel("Venue Location")).toBeEnabled();
  await page.getByRole("button", { name: "Send Quotation" }).click();
  await expect(page.getByTestId("quotation-locked-banner")).toBeVisible();
  await publicPage.reload();
  await expect(publicPage.getByTestId("quotation-being-updated")).toHaveCount(0);
  await expect(publicPage.getByTestId("approval-total")).toHaveText("₹5,997.00");

  await publicPage.getByRole("button", { name: "Accept Quotation" }).click();
  await expect(publicPage.getByText("You've accepted this quotation")).toBeVisible();
  await publicContext.close();

  // --- Back in the admin: Convert to Order ---
  await page.reload();
  await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Convert to Order" }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);

  // The converted order shows every tab, and its Event Information card lists the venue details it still needs (AJ, 2026-10-18).
  for (const tab of ["Order Details", "Menu Approval", "Pricing & Payment", "Inventory", "Expenses", "Staffing & Logistics", "Additional Details"]) {
    await expect(page.getByRole("tab", { name: tab, exact: true }), `${tab} tab`).toBeVisible();
  }
  await page.getByRole("tab", { name: "Order Details" }).click();
  const missing = page.getByTestId("event-missing-fields");
  await expect(missing).toContainText("still needed");
  for (const field of ["Venue Type", "Complete Venue Address", "Venue Contact Person", "Contact Number"]) await expect(missing).toContainText(field);
  await expect(missing).not.toContainText("Event Type"); // the quotation had one
  await expect(page.getByText("Not set · needed").first()).toBeVisible();

  // The converted Order has a real MealPlanEntry for Lunch, not a flattened whole-order item.
  await page.getByRole("tab", { name: "Menu Approval" }).click();
  await expect(page.locator("#order-panel-approval").getByTestId("meal-slot-2026-12-15-LUNCH").getByTestId("meal-item-counts").getByText("1 Dish", { exact: true })).toBeVisible();
  // subtotal = 6000 (the meal on its Menu); transportation 10 + extra / service 7 carried across; total = 6000-20+17 = 5997
  // The total now sits in the Pricing & Payment tab, not the sidebar (AJ, 2026-10-04).
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByText("₹5997.00").first()).toBeVisible();

  // Once converted, the order is the record: the customer's profile lists it under Orders and no longer under Quotations (AJ, 2026-10-17).
  await page.goto("/customers");
  await page.getByText(customerName).first().click();
  await expect(page.getByRole("tab", { name: /^Orders/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Orders/ })).toContainText("1");
  await expect(page.getByRole("tab", { name: /^Quotations/ })).toHaveText("Quotations"); // no count: nothing open
});

test("the menu preference stays chosen when clicked again, and a Multi Order with one day and one meal asks to become Single", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-quote-kind-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Quote", lastName: "Kind", phone: "9800000084" });
  await page.goto("/quotations/new");
  await page.waitForLoadState("networkidle");

  await pickEventDate(page, "2026-12-15", "2026-12-15");
  await page.getByRole("button", { name: /^Multi Order|^Multi/ }).click();
  await page.getByRole("tab", { name: "Build Menu" }).click();

  // Clicking the chosen preference again does not unchoose it: a menu always has one.
  const veg = page.getByRole("button", { name: /^Vegetarian/ });
  await veg.click();
  await expect(veg).toHaveAttribute("aria-pressed", "true");
  await veg.click();
  await expect(veg).toHaveAttribute("aria-pressed", "true");

  // Multi by hand, one day, one meal: asks whether it is really a Single Order.
  await page.getByRole("button", { name: "Lunch", exact: true }).click();
  const ask = page.getByRole("alertdialog", { name: "Change this quotation to a Single Order?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep Multi Order" }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: /^Multi/ })).toHaveAttribute("aria-pressed", "true");

  // Two meals keep a Multi Order; removing one takes it back to one meal on one day, so it asks again.
  await page.getByRole("tab", { name: "Build Menu" }).click();
  await page.getByRole("button", { name: "Dinner", exact: true }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Dinner" }).click();
  const confirmRemove = page.getByRole("alertdialog").filter({ hasText: /Remove Dinner/ });
  if (await confirmRemove.isVisible().catch(() => false)) await confirmRemove.getByRole("button", { name: /^Remove/ }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep Multi Order" }).click();

  // A fresh form: this time accept, and it becomes a Single Order.
  await page.goto("/quotations/new");
  await page.waitForLoadState("networkidle");
  await pickEventDate(page, "2026-12-15", "2026-12-15");
  await page.getByRole("button", { name: /^Multi/ }).click();
  await page.getByRole("tab", { name: "Build Menu" }).click();
  await page.getByRole("button", { name: /^Vegetarian/ }).click();
  await page.getByRole("button", { name: "Lunch", exact: true }).click();
  await ask.getByRole("button", { name: "Change to Single Order" }).click();
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: /^Single/ })).toHaveAttribute("aria-pressed", "true");
});

test("two meal types make it a Multi Order, and removing one says it is a Single Order again", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-quote-back-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Quote", lastName: "Back", phone: "9800000086" });
  await page.goto("/quotations/new");
  await page.waitForLoadState("networkidle");

  // The two types read "Single Order" and "Multi Order", as on an order.
  await expect(page.getByRole("button", { name: /^Single Order/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Multi Order/ })).toHaveAttribute("aria-pressed", "false");

  await pickEventDate(page, "2026-12-15", "2026-12-15");
  await page.getByRole("tab", { name: "Build Menu" }).click();
  await page.getByRole("button", { name: /^Vegetarian/ }).click();
  await page.getByRole("button", { name: "Lunch", exact: true }).click();
  await page.getByRole("button", { name: "Dinner", exact: true }).click();
  const multiNotice = page.getByRole("alertdialog", { name: "Order Type changed to Multi Order" });
  await expect(multiNotice).toBeVisible();
  await multiNotice.getByRole("button", { name: "Got it" }).click();

  // Removing a meal brings it back to one meal on one day: it says so.
  await page.getByRole("button", { name: "Remove Dinner" }).click();
  const confirmRemove = page.getByRole("alertdialog").filter({ hasText: /Remove Dinner/ });
  if (await confirmRemove.isVisible().catch(() => false)) await confirmRemove.getByRole("button", { name: /^Remove/ }).click();
  const singleNotice = page.getByRole("alertdialog", { name: "Order Type changed to Single Order" });
  await expect(singleNotice).toBeVisible();
  await expect(singleNotice).toContainText("one date and one meal type");
  await singleNotice.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: /^Single Order/ })).toHaveAttribute("aria-pressed", "true");
});
