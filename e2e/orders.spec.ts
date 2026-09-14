import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";

/**
 * Chunk 10 — Sales Pipeline: Order (Quotation, Group 10.1, deferred to a
 * later pass per AJ). Drives Order creation end to end against the real dev
 * DB and browser: Customer/Event Information, Participant Information,
 * Meal Planning (individual pricing), Products & Menu Items, the live
 * pricing summary, the Orders Dashboard's search/status filters, the
 * Group 10.6 Event Creation Prompt (inline, not a popup — the Order/Event
 * judgment call, dev plans/index.md #14), and inline editing of the linked
 * Event's operational fields from the Order detail page itself.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create an order with participants/meal planning/products, then create and edit its linked Event inline", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-orders-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Orders");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Close" }).click();

  // --- Setup: a Customer, an Event Type, and a Food Item to order ---
  const customerName = `Asha Rao ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/events/types/new");
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/events\/types$/);

  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("150");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Create Order ---
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Create Order" })).toBeVisible();

  await page.getByLabel("Customer").click();
  await page.getByRole("option", { name: new RegExp(customerName) }).click();
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await page.getByLabel("Event Start Date").fill("2026-12-01");
  await page.getByLabel("Event End Date").fill("2026-12-01");
  await page.getByLabel("Location / Venue").fill("Taj Hall");

  // Participant Information
  await page.getByLabel("Adults").fill("80");
  await page.getByLabel("Children").fill("20");
  await page.getByLabel("Adult Non-Veg").fill("50");
  await page.getByLabel("Adult Veg").fill("30");

  // Meal Planning — individual pricing on, one meal with a price
  await page.getByRole("checkbox", { name: "Individual pricing" }).check();
  await page.getByRole("button", { name: "All Lunch" }).click();
  await expect(page.getByText("1 meal selected")).toBeVisible();
  await page.locator('input[placeholder="Price"]').fill("300");

  // Products & Menu Items
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Food Item" }).click();
  await page.getByLabel("Item", { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(itemName) }).click();
  await page.getByLabel("Qty").fill("10");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(itemName, { exact: true })).toBeVisible();
  await expect(page.getByText("₹1500.00")).toBeVisible(); // 150 * 10

  // Additional Details
  await page.getByLabel("Discount").fill("100");
  await page.getByLabel("Taxes").fill("50");
  await page.getByLabel("Advance Received").fill("500");

  // Pricing summary live preview: subtotal = 1500 (item) + 300 (meal) = 1800; total = 1800-100+50 = 1750; balance = 1750-500 = 1250
  await expect(page.getByText("₹1800.00")).toBeVisible();
  await expect(page.getByText("₹1750.00")).toBeVisible();
  await expect(page.getByText("₹1250.00")).toBeVisible();

  await page.getByRole("button", { name: "Create Order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByText(customerName)).toBeVisible();
  await expect(page.getByText("₹1750.00")).toBeVisible();

  // --- Orders Dashboard filters ---
  await page.getByLabel("Search orders").fill("no-such-customer-xyz");
  await page.getByLabel("Search orders").press("Enter");
  await expect(page.getByText(customerName)).not.toBeVisible();
  await page.getByLabel("Search orders").fill("");
  await page.getByLabel("Search orders").press("Enter");
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
  await expect(page.getByText(itemName)).toBeVisible();

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
