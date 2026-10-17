import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, connectNotificationProvider } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Settings -> Communication (AJ's reference layouts, 2026-09-30): WhatsApp gets
 * a service status card (WhatsApp goes only to the kitchen's own team, so no
 * per-message switches), Email a status card and per-message switches, Push
 * the switches. Message templates were removed (AJ, 2026-10-13). The provider is connected by the Platterly
 * team, so a caterer can only activate/deactivate it once that has happened.
 * Also the Platterly Link page and the Subscription invoice download.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("WhatsApp and Email settings: status, email switches, activate once connected", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-comm-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Comm", lastName: "Tester", phone: "9800000077" });

  // --- WhatsApp: on for every kitchen by default, Active / Inactive like Email ---
  await page.goto("/settings/communication/whatsapp-settings");
  await expect(page.getByRole("heading", { name: "WhatsApp Settings" })).toBeVisible();
  await expect(page.getByText("WhatsApp Service Active")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Activate WhatsApp" })).toBeEnabled();
  await expect(page.getByRole("switch", { name: "Activate WhatsApp" })).toBeChecked();
  // The nav's active item has the same fill and ring as Menu Catalog's.
  await expect(page.getByRole("link", { name: "WhatsApp Settings" })).toHaveClass(/bg-accent.*ring-primary\/40/);

  // Notification Preferences list the messages sent to the KITCHEN (never customers), all on by default, no templates
  await expect(page.getByText("Choose which WhatsApp messages to send to your kitchen")).toBeVisible();
  await expect(page.getByText("Choose which WhatsApp messages to send to your customers")).toHaveCount(0);
  for (const name of ["New Order", "Order Sent to Kitchen", "Menu Sent for Approval", "Menu Approved", "Payment Received", "Events Tomorrow", "Overdue Payments"]) {
    await expect(page.getByRole("switch", { name, exact: true })).toBeChecked();
  }
  await expect(page.getByText("Message Templates")).toHaveCount(0);
  await page.getByRole("switch", { name: "Payment Received", exact: true }).click();
  await page.getByRole("button", { name: "Save WhatsApp Settings" }).click();
  await expect(page.getByText("Message settings saved.")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Payment Received", exact: true })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "New Order", exact: true })).toBeChecked();

  // The kitchen can switch it off and on
  await page.getByRole("switch", { name: "Activate WhatsApp" }).click();
  await expect(page.getByText("WhatsApp Service Deactivated")).toBeVisible();
  await page.getByRole("switch", { name: "Activate WhatsApp" }).click();
  await expect(page.getByText("WhatsApp Service Active")).toBeVisible();

  // If the Platterly team disconnects it, the kitchen can't turn it on
  await connectNotificationProvider(email, "whatsapp", false);
  await page.reload();
  await expect(page.getByText("WhatsApp Service Not Connected")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Activate WhatsApp" })).toBeDisabled();

  // --- Email: the same layout ---
  await page.goto("/settings/communication/email-settings");
  await expect(page.getByRole("heading", { name: "Email Settings" })).toBeVisible();
  // Email is connected and on for every kitchen by default, and only lists the emails sent to customers, each on.
  await expect(page.getByText("Email Service Active")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Activate Email" })).toBeEnabled();
  for (const name of ["Order Received", "Order Accepted", "Order Confirmed", "Order Completed", "Quotation", "Menu & Order Review", "Food Dispatched", "Invoice", "Payment Receipt", "Payment Link", "Payment Reminder", "Event Reminder"]) {
    await expect(page.getByRole("switch", { name, exact: true })).toBeChecked();
  }
  await expect(page.getByRole("switch", { name: "System Alerts" })).toHaveCount(0);
  await expect(page.getByText("Message Templates")).toHaveCount(0);
  // Switch one off, save, and it stays off after a reload while the rest stay on.
  await page.getByRole("switch", { name: "Food Dispatched", exact: true }).click();
  await page.getByRole("button", { name: "Save Email Settings" }).click();
  await expect(page.getByText("Message settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Food Dispatched", exact: true })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Quotation", exact: true })).toBeChecked();
  // Deactivating the service turns every email off and locks the switches; activating turns them all back on.
  await page.getByRole("switch", { name: "Activate Email" }).click();
  await expect(page.getByText("Email Service Deactivated")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Quotation", exact: true })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Quotation", exact: true })).toBeDisabled();
  await page.getByRole("switch", { name: "Activate Email" }).click();
  await expect(page.getByText("Email Service Active")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Quotation", exact: true })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Food Dispatched", exact: true })).toBeChecked();

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
