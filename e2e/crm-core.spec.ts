import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

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
 * Updated 2026-09-16: the standalone `/events` Dashboard and `/events/new`
 * (Customer-only Event creation) were removed once every Event started
 * coming from an Order (AJ's decision) — Event creation/editing now happens
 * entirely from the Order detail page's inline editor, which folded in
 * everything the old standalone `/events/[id]` page used to expose (status,
 * required inventory, name/dates/notes, delete). `/events` now serves Event
 * Types instead (see e2e/events.spec.ts).
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("Lead -> Customer (auto, via Order) -> Event, with required inventory and timeline", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-crm-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("CRM");
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

  // --- Setup: an Inventory item and an Event Type, both needed for Event creation ---
  const inventoryName = `Rice ${suffix}`;
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(inventoryName);
  await page.getByLabel("Category", { exact: true }).fill("Grains");
  await page.getByLabel("Unit", { exact: true }).fill("kg");
  await page.getByLabel("Opening Stock").fill("100");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/events/new");
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/events$/);

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

  // --- Leads-only filter shows this person; Customers-only filter doesn't (yet) ---
  await page.getByLabel("Filter by All").click();
  await page.getByRole("option", { name: "Leads" }).click();
  await expect(page.getByText(leadName)).toBeVisible();
  await page.getByLabel("Filter by All").click();
  await page.getByRole("option", { name: "Customers" }).click();
  await expect(page.getByText(leadName)).not.toBeVisible();
  await page.getByLabel("Filter by All").click();
  await page.getByRole("option", { name: "All" }).click();

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
  await page.getByLabel("Customer").click();
  await page.getByRole("option", { name: new RegExp(leadName) }).click();
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await page.getByLabel("Event Start Date").fill("2026-12-01");
  await page.getByLabel("Event End Date").fill("2026-12-02");
  await page.getByLabel("Location / Venue").fill("Taj Hall");
  await page.getByRole("button", { name: "Create Order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);

  await page.goto(`/customers/${customerId}`);
  await expect(page.getByText("Customer", { exact: true }).first()).toBeVisible();

  await page.goto("/orders");
  await page.getByText(leadName).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByText("Create an event for this order?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, create event" }).click();
  await expect(page.getByText("Event details", { exact: true })).toBeVisible();

  // The inline editor shares field labels ("Status", "Event Type", ...) with
  // the Order form on the same page — scope every interaction to it.
  const eventEditor = page.getByTestId("order-event-editor");
  await eventEditor.getByLabel("Event Name").fill(`${leadName}'s Wedding`);
  await eventEditor.getByRole("checkbox", { name: new RegExp(inventoryName) }).check();
  await eventEditor.getByPlaceholder("Quantity").fill("20");
  await eventEditor.getByLabel("Status").click();
  await page.getByRole("option", { name: "Processing" }).click();
  await eventEditor.getByRole("button", { name: "Save Event details" }).click();
  await expect(eventEditor.getByText("Saved.")).toBeVisible();

  await page.reload();
  const reloadedEventEditor = page.getByTestId("order-event-editor");
  await expect(reloadedEventEditor.getByLabel("Event Name")).toHaveValue(`${leadName}'s Wedding`);
  await expect(reloadedEventEditor.getByRole("checkbox", { name: new RegExp(inventoryName) })).toBeChecked();

  // --- Customer timeline now shows both the Order and the Event ---
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByText(`${leadName}'s Wedding`)).toBeVisible();
  await expect(page.getByText("Processing", { exact: true })).toBeVisible();
});
