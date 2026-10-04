import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { selectOption, signUpCaterer } from "./auth-helpers";

/**
 * Chunk 9 — CRM Core. Drives the full Lead -> Customer -> Event lifecycle
 * against the real dev DB and browser: Add a Lead on the merged Customers
 * page (with "Is this an enquiry?" Lead Information) -> create an Order for
 * that person, which automatically flips their status from Lead to Customer
 * (no separate Convert action, no second record) -> from the Order detail
 * page, create + fully edit its linked Event (name, status,
 * required-inventory link) -> verify the Customer's timeline shows both the
 * Order and the Event.
 *
 * Updated 2026-09-17 (Merge Leads, Enquiries & Customers, AJ): the
 * standalone `/enquiries` module was removed — Leads and Customers are one
 * record/page now, and status (Lead vs Customer) is derived from Order
 * ownership rather than an explicit Convert action.
 *
 * Updated 2026-09-16: the standalone `/menu-catalog/event-types` Dashboard and `/menu-catalog/event-types/new`
 * (Customer-only Event creation) were removed once every Event started
 * coming from an Order (AJ's decision) — Event creation/editing now happens
 * entirely from the Order detail page's inline editor, which folded in
 * everything the old standalone `/menu-catalog/event-types/[id]` page used to expose (status,
 * required inventory, name/dates/notes, delete). `/menu-catalog/event-types` now serves Event
 * Types instead (see e2e/events.spec.ts).
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("Lead -> Customer (auto, via Order) -> Event, with required inventory and timeline", async ({ page }) => {
  // Bumped from 90s (AJ, 2026-09-20): the Create Order redesign's Event Date
  // range-picker (open popover, navigate months, two clicks) and its extra
  // sections take noticeably longer per step than the old plain date inputs
  // did, especially headed with this repo's standing slowMo: 350.
  test.setTimeout(120_000);
  const email = `e2e-crm-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "CRM", lastName: "Tester" });

  // --- Setup: an Inventory item and an Event Type, both needed for Event creation ---
  const inventoryName = `Rice ${suffix}`;
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(inventoryName);
  // Category is a dropdown now (AJ, 2026-09-30).
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  // Unit is a dropdown now, not free text (AJ, 2026-09-19).
  await page.getByLabel("Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByLabel("Opening Stock").fill("100");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Add a Lead on the merged Customers page, with Lead Information ---
  const leadName = `Asha Rao ${suffix}`;
  const leadPhone = "9876543210";
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Name").fill(leadName);
  await page.getByLabel("Phone", { exact: true }).fill(leadPhone);
  await page.getByRole("checkbox", { name: "Is this an enquiry?" }).check();
  await page.getByLabel("Lead Source").click();
  await page.getByRole("option", { name: "Referral" }).click();
  await page.getByPlaceholder("Add any notes about this lead...").fill("Met at a wedding expo.");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(leadName)).toBeVisible();
  await expect(page.getByText("Lead", { exact: true }).first()).toBeVisible();

  // --- List view: the whole row is a link, but the buttons inside it (and dialogs they open) aren't ---
  await page.getByRole("button", { name: /list/i }).first().click();
  await page.getByRole("button", { name: `Edit ${leadName}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByLabel("Name").click();
  await expect(page).toHaveURL(/\/customers$/);
  await page.keyboard.press("Escape");
  await page.getByRole("cell").getByText("Lead", { exact: true }).click();
  await expect(page).toHaveURL(/\/customers\/.+/);
  await page.goBack();
  await page.getByRole("button", { name: /grid/i }).first().click();

  // --- Leads-only filter shows this person; Customers-only filter doesn't (yet) ---
  await selectOption(page, page.getByLabel("Filter by All"), "Leads");
  await expect(page.getByText(leadName)).toBeVisible();
  await selectOption(page, page.getByLabel("Filter by All"), "Customers");
  await expect(page.getByText(leadName)).not.toBeVisible();
  await selectOption(page, page.getByLabel("Filter by All"), "All");

  await page.getByRole("button", { name: `View ${leadName}` }).click();
  await expect(page).toHaveURL(/\/customers\/.+/);
  await expect(page.getByRole("heading", { name: leadName })).toBeVisible();
  await expect(page.getByText("Lead", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Referral")).toBeVisible();
  const customerUrl = page.url();
  const customerId = customerUrl.split("/customers/")[1];

  // --- Create an Order for this Customer, which automatically flips their
  // status from Lead to Customer (no separate Convert action) -- then
  // create + fully edit its linked Event (name, required inventory, status)
  // from the Order page ---
  await page.goto("/orders/new");
  // Customer is a search-autocomplete (CustomerCombobox), not a plain <Select>.
  const customerInput = page.getByLabel("Customer");
  await customerInput.click();
  await customerInput.fill(leadName);
  await page.getByRole("button", { name: new RegExp(leadName) }).click();
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  // Event Date is a single range-picker (DateRangePicker), defaulting to the
  // current month — navigate to December 2026 before picking, then click
  // the two end days to commit a two-day range.
  await page.getByLabel("Event Date").click();
  const datePopover = page.locator('[data-slot="popover-content"]');
  await expect(datePopover).toBeVisible();
  while ((await datePopover.locator("span.font-medium").textContent()) !== "December 2026") {
    await datePopover.getByRole("button", { name: "Next month" }).click();
  }
  await datePopover.getByRole("button", { name: "1", exact: true }).click();
  await datePopover.getByRole("button", { name: "2", exact: true }).click();
  // A multi-day range switches the order to Multi Order by itself and says so
  // (AJ, 2026-09-27). This test isn't about Order Type, so just acknowledge it.
  await page.getByRole("alertdialog").getByRole("button", { name: "Got it" }).click();
  await page.getByLabel("Venue / Building Name").fill("Taj Hall");
  await page.getByRole("button", { name: "Save Order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);

  await page.goto(`/customers/${customerId}`);
  await expect(page.getByText("Customer", { exact: true }).first()).toBeVisible();

  await page.goto("/orders");
  await page.getByText(leadName).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  // The Event was created when the order was saved; there is nothing to create here (AJ, 2026-09-27).
  await expect(page.getByText("Create an event for this order?")).toHaveCount(0);

  // A kitchen with a single location has no assigned-kitchen card (AJ, 2026-10-04); the picker shows once locations are on.
  await expect(page.getByTestId("event-operations-card")).toHaveCount(0);

  await page.getByRole("tab", { name: "Inventory" }).click();
  const inventoryCard = page.getByTestId("required-inventory-card");
  await inventoryCard.getByRole("checkbox", { name: new RegExp(inventoryName) }).check();
  await expect(inventoryCard.getByText("Saved", { exact: true })).toBeVisible();
  await inventoryCard.getByLabel(new RegExp(`Quantity of ${inventoryName}`)).fill("20");
  await inventoryCard.getByLabel(new RegExp(`Quantity of ${inventoryName}`)).blur();
  await expect(inventoryCard.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Inventory" }).click();
  await expect(page.getByTestId("required-inventory-card").getByRole("checkbox", { name: new RegExp(inventoryName) })).toBeChecked();
  await expect(page.getByTestId("required-inventory-card").getByLabel(new RegExp(`Quantity of ${inventoryName}`))).toHaveValue("20");

  // --- Profile: the order is under Orders, the tabs replaced the old Events timeline, and delete is refused ---
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByRole("tab", { name: /^Orders/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Events" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Abandoned Orders/ })).toBeVisible();
  await expect(page.getByText(eventTypeName).first()).toBeVisible();
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByRole("tabpanel").getByText("Customer added")).toBeVisible();

  // Header actions: WhatsApp, then Edit (opens the edit popup), then Delete; no Customer Details box any more.
  await expect(page.getByRole("heading", { name: "Customer Details" })).toHaveCount(0);
  await page.getByRole("button", { name: `Edit ${leadName}` }).first().click();
  await expect(page.getByRole("dialog").getByLabel("Name")).toHaveValue(leadName);
  await expect(page.getByRole("dialog").getByRole("note")).toContainText("everywhere in Platterly");
  await page.keyboard.press("Escape");

  // Notes are dated entries: the note typed on the create form is the first one, and the team can add, edit and delete more.
  const side = page.getByTestId("side-notes-list");
  await expect(side.getByTestId("customer-note")).toHaveCount(1);
  await expect(side).toContainText("Met at a wedding expo.");
  await expect(side).toContainText("CRM Tester"); // who wrote it, with the date and time beside it
  await page.locator("#side-note-new").fill("Prefers a live dosa counter.");
  await page.getByRole("button", { name: "Add Note" }).first().click();
  await expect(side.getByTestId("customer-note")).toHaveCount(2);
  await expect(side.getByTestId("customer-note").first()).toContainText("Prefers a live dosa counter.");
  await page.reload();
  await expect(page.getByTestId("side-notes-list").getByTestId("customer-note")).toHaveCount(2);
  // Edit one, then delete it
  await page.getByTestId("side-notes-list").getByTestId("customer-note").first().getByRole("button", { name: "Edit note" }).click();
  await page.getByRole("textbox", { name: "Edit note" }).fill("Prefers a live dosa and chaat counter.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("side-notes-list")).toContainText("live dosa and chaat counter");
  await expect(page.getByTestId("side-notes-list")).toContainText("edited");
  await page.getByTestId("side-notes-list").getByTestId("customer-note").first().getByRole("button", { name: "Delete note" }).click();
  await expect(page.getByTestId("side-notes-list").getByTestId("customer-note")).toHaveCount(1);
  // Each note also shows in the Activity tab
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByRole("tabpanel").getByText(/added a note/)).toBeVisible();

  await page.getByRole("button", { name: `Delete ${leadName}` }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm.getByRole("alert")).toContainText("1 order");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(new RegExp(`/customers/${customerId}$`));

  // --- A customer with no history can be deleted from their profile ---
  const throwawayName = `Delete Me ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(throwawayName);
  await page.getByLabel("Phone", { exact: true }).fill("9123456780");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: `View ${throwawayName}` }).click();
  await page.getByRole("button", { name: `Delete ${throwawayName}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByText(throwawayName)).toHaveCount(0);
});
