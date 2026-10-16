import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderWithEvent } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Order page round (AJ, 2026-10-16): Guest Information reads as details until Edit; the Payment summary follows the Grand Total as it is
 * typed; Discount and Extra / Service Cost can be a rupee amount or a percentage.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test.use({ viewport: { width: 1600, height: 1000 } });

test("guest information needs Edit; the payment summary follows the pricing; discount and service cost take a percentage", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-details-round-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Round", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();
  const { orderId } = await seedOrderWithEvent(email);
  await page.goto(`/orders/${orderId}`);

  // Guest Information: plain details first (Customer Details and Order Type are single rows), Edit reveals the counts.
  await page.getByRole("tab", { name: "Guests & Event Info" }).click();
  await expect(page.locator("#order-adults")).toHaveCount(0);
  await expect(page.getByText("Total Guests", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit guest information" }).click();
  await expect(page.locator("#order-adults")).toBeVisible();
  await page.locator("#order-adults").fill("120");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#order-adults")).toHaveCount(0);
  await expect(page.getByText("120").first()).toBeVisible();
  await page.getByRole("button", { name: "Edit guest information" }).click();
  await page.locator("#order-adults").fill("500");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("500")).toHaveCount(0);

  // Event Information: details first; Edit reveals the one Order Type (AJ, 2026-10-16) that decides single or multiple dates.
  await expect(page.getByLabel("Venue / Building Name")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit event information" }).click();
  await expect(page.getByLabel("Event end date", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Multi Order/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Change type" }).click(); // a booked order asks first
  await expect(page.getByLabel("Event start date", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Event end date", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Single Order/ }).click(); // back to the saved type: no question, just the notice
  await page.getByRole("alertdialog").getByRole("button", { name: "Got it" }).click();
  await expect(page.getByLabel("Event end date", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Venue / Building Name")).toHaveCount(0);

  // The Payment summary total follows the Grand Total before Save.
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await page.getByRole("spinbutton", { name: "Transportation Cost" }).fill("500");
  await expect(page.getByTestId("payments-panel")).toContainText("₹500.00");
  await page.getByRole("spinbutton", { name: "Transportation Cost" }).fill("750");
  await expect(page.getByTestId("payments-panel")).toContainText("₹750.00");
  // The Payment summary lists the priced lines above the totals.
  await expect(page.getByTestId("payment-summary-lines")).toContainText("Transportation Cost");

  // Discount and Extra / Service Cost: a ₹ / % choice; a percentage is capped at 100.
  const discountType = page.getByRole("combobox", { name: "Discount type" });
  await expect(discountType).toContainText("₹");
  await discountType.click();
  await page.locator("[role=option]:visible", { hasText: "%" }).click();
  await expect(page.getByRole("spinbutton", { name: "Discount" })).toHaveAttribute("max", "100");
  const serviceType = page.getByRole("combobox", { name: "Extra / Service Cost type" });
  await serviceType.click();
  await expect(serviceType).toHaveAttribute("aria-expanded", "true");
  await page.locator("[role=option][aria-selected=false]:visible", { hasText: "%" }).click();
  await page.getByRole("spinbutton", { name: "Extra / Service Cost" }).fill("10");
  await page.getByRole("spinbutton", { name: "Discount" }).fill("5");
  await expect(page.getByRole("combobox", { name: "Discount type" })).toContainText("%");

  // Saved, the percentage mode and rate come back as typed.
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")), page.getByTestId("order-save-card").getByRole("button", { name: "Save changes" }).click()]);
  await page.reload();
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByRole("combobox", { name: "Discount type" })).toContainText("%");
  await expect(page.getByRole("spinbutton", { name: "Discount" })).toHaveValue("5");
  await expect(page.getByRole("combobox", { name: "Extra / Service Cost type" })).toContainText("%");
  await expect(page.getByRole("spinbutton", { name: "Extra / Service Cost" })).toHaveValue("10");

  // The Transportation Cost is what the customer is charged, so it is not an expense.
  await page.getByRole("tab", { name: "Expenses" }).click();
  await expect(page.getByTestId("breakdown-TRANSPORT")).toHaveText("₹0.00");

  // Transportation Cost and each added charge also take a ₹ / %.
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  const transportType = page.getByRole("combobox", { name: "Transportation Cost type" });
  await transportType.click();
  await page.locator("[role=option][aria-selected=false]:visible", { hasText: "%" }).click();
  await expect(page.getByRole("spinbutton", { name: "Transportation Cost" })).toHaveAttribute("max", "100");
  await page.getByRole("spinbutton", { name: "Transportation Cost" }).fill("5");
  await page.getByRole("button", { name: "Add charge" }).click();
  await page.getByLabel("Charge 1 label").fill("Generator");
  const chargeType = page.getByRole("combobox", { name: "Charge 1 type" });
  await chargeType.click();
  await page.locator("[role=option][aria-selected=false]:visible", { hasText: "%" }).click();
  await page.getByLabel("Charge 1 amount").fill("2");
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")), page.getByTestId("order-save-card").getByRole("button", { name: "Save changes" }).click()]);
  await page.reload();
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByRole("combobox", { name: "Transportation Cost type" })).toContainText("%");
  await expect(page.getByRole("combobox", { name: "Charge 1 type" })).toContainText("%");
  await expect(page.getByLabel("Charge 1 amount")).toHaveValue("2");
});
