import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, connectNotificationProvider } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Settings -> Communication (AJ's reference layouts, 2026-09-30): WhatsApp and
 * Email each get a service status card, per-message switches and editable
 * templates; Push gets the switches. The provider is connected by the Platterly
 * team, so a caterer can only activate/deactivate it once that has happened.
 * Also the Platterly Link page and the Subscription invoice download.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("WhatsApp and Email settings: status, per-message switches, templates, activate once connected", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-comm-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Comm", lastName: "Tester", phone: "9800000077" });

  // --- WhatsApp: not connected yet, so the caterer can't activate it ---
  await page.goto("/settings/communication/whatsapp-settings");
  await expect(page.getByRole("heading", { name: "WhatsApp Settings" })).toBeVisible();
  await expect(page.getByText("WhatsApp Service Not Connected")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Activate WhatsApp" })).toBeDisabled();
  // The nav's active item has the same fill and ring as Menu Catalog's.
  await expect(page.getByRole("link", { name: "WhatsApp Settings" })).toHaveClass(/bg-accent.*ring-primary\/40/);

  // Per-message switches save; Coming Soon ones are disabled
  await expect(page.getByRole("switch", { name: "Order Status Updates" })).toBeDisabled();
  await page.getByRole("switch", { name: "Payment Confirmation" }).click();
  await page.getByRole("button", { name: "Save WhatsApp Settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Payment Confirmation" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Order Confirmation" })).not.toBeChecked();

  // Templates: edit and save
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Order Confirmation (Customer) text").fill("Hi {{customer_name}}, order {{order_number}} is confirmed.");
  await page.getByRole("button", { name: "Save Template" }).click();
  await expect(page.getByText("Hi {{customer_name}}, order {{order_number}} is confirmed.")).toBeVisible();

  // The platform connects the provider; then the caterer can activate and deactivate it
  await connectNotificationProvider(email, "whatsapp");
  await page.reload();
  await expect(page.getByText("WhatsApp Service Deactivated")).toBeVisible();
  await page.getByRole("switch", { name: "Activate WhatsApp" }).click();
  await expect(page.getByText("WhatsApp Service Active")).toBeVisible();
  await page.getByRole("switch", { name: "Activate WhatsApp" }).click();
  await expect(page.getByText("WhatsApp Service Deactivated")).toBeVisible();

  // --- Email: the same layout ---
  await page.goto("/settings/communication/email-settings");
  await expect(page.getByRole("heading", { name: "Email Settings" })).toBeVisible();
  await expect(page.getByText("Email Service Not Connected")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Event Reminders" })).toBeEnabled();
  await expect(page.getByRole("switch", { name: "System Alerts" })).toBeEnabled();
  await expect(page.getByText("Order Confirmation (Customer)")).toBeVisible();

  // --- Push: one master switch for the person, plus this browser's state ---
  await page.goto("/settings/communication/push-notifications");
  await expect(page.getByRole("heading", { name: "Push Notifications" }).first()).toBeVisible();
  await expect(page.getByText("Service Status")).toHaveCount(0);
  const master = page.getByRole("switch", { name: "Send me push notifications" });
  await expect(master).toBeChecked();
  // Click until it takes (under load the first click can land before the page is interactive).
  await expect(async () => {
    if (await master.isChecked()) await master.click();
    await expect(master).not.toBeChecked({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Send me push notifications" })).not.toBeChecked();
});

test("Platterly Link page and Subscription invoice download", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-link-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Link", lastName: "Tester", phone: "9800000077" });

  // Unclaimed: the share note, a form to choose the link, and how it works
  await page.goto("/settings/integration/public-menu-link");
  await expect(page.getByRole("heading", { name: "Platterly Link", exact: true })).toBeVisible();
  await expect(page.getByText("Share this unique link with customers.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Platterly Link" }).first()).toBeVisible(); // renamed in the sub-menu too

  // Subscription: trial card, billing information, and a downloadable invoice
  await page.goto("/settings/subscription");
  await expect(page.getByText("Trial Active").first()).toBeVisible();
  await expect(page.getByText("Billing Information")).toBeVisible();
  await expect(page.getByText("Payment: ₹0")).toBeVisible();
  const invoice = page.getByRole("button", { name: "Invoice" });
  const href = await invoice.getAttribute("href");
  expect(href).toMatch(/\/settings\/subscription\/invoice\/.+/);
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});
