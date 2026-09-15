import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 10 Group 10.1 — Quotation. Drives the full PRD §20 lifecycle
 * against the real dev DB and browser: create a Quotation with a line item
 * and charges, Send it (issuing a real public token link), the customer
 * views and Accepts it from a brand-new cookie-less browser context (no
 * login, matching every other public/token-based surface in this app),
 * then the caterer Converts it to a real Order and confirms the pricing
 * (with additional+delivery charges folded into taxes) and line items
 * carried over exactly as quoted.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create, send, and have a customer accept a Quotation, then convert it to an Order", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const email = `e2e-quotations-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Quotations");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Close" }).click();

  // --- Setup: a Customer, an Event Type, a Food Item ---
  const customerName = `Zoya Khan ${suffix}`;
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Name").fill(customerName);
  await page.getByLabel("Phone").fill("9222222222");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Birthday ${suffix}`;
  await page.goto("/events/new");
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/events$/);

  const itemName = `Biryani ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Create Quotation ---
  await page.goto("/quotations/new");
  await expect(page.getByRole("heading", { name: "Create Quotation" })).toBeVisible();

  await page.getByLabel("Customer").click();
  await page.getByRole("option", { name: new RegExp(customerName) }).click();
  await page.getByLabel("Event Type").click();
  await page.getByRole("option", { name: eventTypeName }).click();
  await page.getByLabel("Event Start Date").fill("2026-12-15");
  await page.getByLabel("Event End Date").fill("2026-12-15");
  await page.getByLabel("Location / Venue").fill("Grand Ballroom");

  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Food Item" }).click();
  await page.getByLabel("Item", { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(itemName) }).click();
  await page.getByLabel("Qty").fill("10");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(itemName, { exact: true })).toBeVisible();

  await page.getByLabel("Discount").fill("200");
  await page.getByLabel("Taxes").fill("100");
  await page.getByLabel("Additional Charges").fill("50");
  await page.getByLabel("Delivery Charges").fill("25");

  // subtotal = 3000 (300*10); total = 3000 - 200 + 100 + 50 + 25 = 2975
  await expect(page.getByText("₹3000.00").first()).toBeVisible();
  await expect(page.getByText("₹2975.00")).toBeVisible();

  await page.getByRole("button", { name: "Create Quotation" }).click();
  await expect(page).toHaveURL(/\/quotations$/);
  await expect(page.getByText(customerName)).toBeVisible();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  // --- Send it ---
  await page.getByText(customerName).click();
  await expect(page).toHaveURL(/\/quotations\/.+/);
  await page.getByRole("button", { name: "Send Quotation" }).click();
  await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();

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
  await expect(publicPage.getByText(itemName, { exact: true })).toBeVisible();
  await expect(publicPage.getByText("₹2975.00")).toBeVisible();
  await expect(publicPage.getByText("Viewed", { exact: true })).toBeVisible();

  await publicPage.getByRole("button", { name: "Accept Quotation" }).click();
  await expect(publicPage.getByText("You've accepted this quotation")).toBeVisible();
  await publicContext.close();

  // --- Back in the admin: Convert to Order ---
  await page.reload();
  await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Convert to Order" }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByText(itemName, { exact: true })).toBeVisible();
  // Order total = 3000 - 200 + (100 taxes + 50 additional + 25 delivery folded in) = 2975
  // (shows twice — Total and Balance both equal 2975 since advance is 0)
  await expect(page.getByText("₹2975.00").first()).toBeVisible();
});
