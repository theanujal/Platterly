import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { cleanupOnboardingTestUser, getLatestInvoiceLink, getOrderMoney, getPaymentsForOrder, seedOrderForBilling, seedPendingRazorpayPayment } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 14: billing and payments. A kitchen sets its own UPI and Razorpay (never Platterly's), creates an
 * invoice from an order, records payments with and without a receipt, shares a payment link whose page
 * shows a UPI QR, confirms a customer's "I have paid" claim, and Razorpay's webhook confirms a payment once.
 */

const cleanupEmails: string[] = [];

/** No page may scroll sideways, on a phone or a tablet (the design system's rule). */
async function expectNoSideScroll(page: Page, label: string) {
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${label} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("settings, invoice, recording payments, payment link with UPI QR, pending confirmation and customer invoice", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `e2e-billing-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Billing", lastName: "Tester", phone: "9800000066" });
  const { orderId, organizationId } = await seedOrderForBilling(email, 20000);

  // ===== Settings -> Payments: the kitchen's own UPI, Razorpay and advance % =====
  await page.goto("/settings/integration/payments");
  await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Payments" })).toHaveClass(/bg-accent.*ring-primary\/40/);
  await expect(page.getByText(`/api/webhooks/razorpay/${organizationId}`)).toBeVisible();

  await page.getByLabel("UPI ID").fill("not-a-upi-id");
  await page.getByLabel("Name shown in the UPI app").fill("Billing Kitchen");
  await page.getByRole("button", { name: "Save UPI" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "UPI ID should look like" })).toBeVisible();
  await page.getByLabel("UPI ID").fill("billing@okhdfc");
  await page.getByRole("button", { name: "Save UPI" }).click();
  await expect(page.getByText("UPI saved.")).toBeVisible();

  await page.getByLabel("Advance (% of the order)").fill("30");
  await page.getByRole("button", { name: "Save Advance" }).click();
  await expect(page.getByText("Advance saved.")).toBeVisible();

  // GST lives here now (AJ, 2026-10-10): the number, the switch, and the default rate and type for new invoices.
  await page.getByLabel("GST number (optional)").fill("not valid");
  await page.getByRole("button", { name: "Save GST" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "15 letters and digits" })).toBeVisible();
  await page.getByLabel("GST number (optional)").fill("29ABCDE1234F1Z5");
  await page.getByRole("switch", { name: "Show GST details on invoices" }).click();
  await page.getByLabel("GST rate (%)").fill("12");
  await page.getByLabel("GST type").click();
  await page.getByRole("option", { name: "IGST" }).click();
  await page.getByRole("button", { name: "Save GST" }).click();
  await expect(page.getByText("GST settings saved.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Create the invoice automatically" })).toHaveAttribute("aria-checked", "true");

  // Business Profile no longer edits GST: it shows the number read-only and points to Payments.
  await page.goto("/settings/account/business-profile");
  await expect(page.getByText("29ABCDE1234F1Z5")).toBeVisible();
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await expect(page.getByLabel("GST number (optional)")).toHaveCount(0);
  await page.goto("/settings/integration/payments");

  await page.getByLabel("Key ID").fill("rzp_test_ABCDEF123456");
  await page.getByLabel("Key Secret").fill("test-key-secret");
  await page.getByLabel("Webhook Secret").fill("test-webhook-secret");
  await page.getByRole("button", { name: "Save Razorpay" }).click();
  await expect(page.getByText("Razorpay saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("rzp_test_••••••3456")).toBeVisible();
  // The secret is never sent back to the browser.
  await expect(page.locator("body")).not.toContainText("test-key-secret");
  await expect(page.getByLabel("Advance (% of the order)")).toHaveValue("30");

  // ===== Order page: create the invoice =====
  await page.goto(`/orders/${orderId}`);
  // Invoice and payments sit in the Pricing & Payment tab, not the sidebar (AJ, 2026-10-04).
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByTestId("order-billing")).toBeVisible();
  await expect(page.getByTestId("balance-amount")).toHaveText("₹20,000.00");
  await page.getByRole("button", { name: "Create Invoice" }).click();
  // The dialog starts from the saved GST defaults.
  await expect(page.getByRole("dialog").getByLabel("GST rate (%)")).toHaveValue("12");
  await expect(page.getByRole("dialog").getByLabel("GST type")).toContainText("IGST");
  await page.getByRole("dialog").getByRole("button", { name: "Create Invoice" }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: /INV-0001/ })).toBeVisible();
  await expect(page.getByTestId("invoice-total")).toHaveText("₹20,000.00");
  await expect(page.getByTestId("invoice-paper")).toContainText("Billing Customer");
  // Laid out like the sample bill (AJ, 2026-10-10): information cards, payment summary, and Platterly branding at the foot.
  await expect(page.getByTestId("invoice-paper")).toContainText("Invoice Information");
  await expect(page.getByTestId("invoice-paper")).toContainText("Customer Information");
  await expect(page.getByTestId("invoice-status")).toHaveText("UNPAID");
  await expect(page.getByTestId("invoice-payment-summary")).toContainText("Total After Discount");
  await expect(page.getByTestId("invoice-balance")).toContainText("₹20,000.00");
  await expect(page.getByTestId("invoice-powered-by")).toContainText("Powered by Platterly");
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  const invoiceUrl = page.url();
  await expectNoSideScroll(page, "the invoice page");

  // Back on the order, the sidebar offers Download invoice (the PDF) on the Pricing & Payment tab only (AJ, 2026-10-10).
  await page.goBack();
  await expect(page.getByRole("button", { name: "Download invoice" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByRole("button", { name: "Download invoice" })).toHaveAttribute("href", /\/invoices\/[a-z0-9]+\/pdf$/);
  await expect(page.getByRole("link", { name: "View INV-0001" })).toBeVisible();
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByRole("button", { name: "Download invoice" })).toHaveCount(0);
  await page.goto(invoiceUrl);

  // Send invoice: marks it Sent. Email isn't connected yet, so the message says so.
  await page.getByRole("button", { name: "Send Invoice" }).click();
  await expect(page.getByRole("status").filter({ hasText: /email is not connected yet|Sent by email/i })).toBeVisible();
  await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();

  // PDF downloads as a real PDF.
  const pdf = await page.request.get(`${invoiceUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // ===== Record a payment: "Record Only" =====
  await page.getByRole("button", { name: "Record Payment" }).click();
  await page.getByLabel("Amount").fill("5000");
  await page.getByRole("button", { name: "Record Only" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByTestId("paid-amount")).toHaveText("₹5,000.00");
  await expect(page.getByTestId("balance-amount")).toHaveText("₹15,000.00");
  await expect(page.getByText("Partially Paid").first()).toBeVisible();

  // ===== Record & Send Receipt =====
  await page.getByRole("button", { name: "Record Payment" }).click();
  await page.getByLabel("Amount").fill("2500");
  await page.getByRole("button", { name: "Record & Send Receipt" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByTestId("paid-amount")).toHaveText("₹7,500.00");
  await expect(page.getByRole("status").filter({ hasText: /Payment recorded/ })).toBeVisible();

  // More than the balance is refused
  await page.getByRole("button", { name: "Record Payment" }).click();
  await page.getByLabel("Amount").fill("999999");
  await page.getByRole("button", { name: "Record Only" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "more than the balance" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // The Order's own fields now follow the confirmed payments
  const money = await getOrderMoney(orderId);
  expect(Number(money.advance)).toBe(7500);
  expect(Number(money.balance)).toBe(12500);
  expect(money.paymentStatus).toBe("PARTIALLY_PAID");

  // ===== Payment link: balance, with the QR page =====
  await page.getByRole("button", { name: "Create Payment Link" }).click();
  await page.getByRole("radio", { name: /Balance/ }).click();
  await page.getByRole("button", { name: "Copy Link" }).click();
  const linkText = await page.getByTestId("payment-link-url").innerText();
  const payPath = new URL(linkText.trim()).pathname;
  await page.keyboard.press("Escape");

  const customerContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  const customerPage = await customerContext.newPage();
  await customerPage.goto(payPath);
  await expect(customerPage.getByTestId("pay-amount")).toHaveText("Pay ₹12,500.00");
  await expect(customerPage.getByTestId("upi-qr")).toBeVisible();
  await expect(customerPage.getByRole("button", { name: "Pay with Card, UPI or Net Banking" })).toBeVisible(); // Razorpay is set up
  await expect(customerPage.locator("a[href^=\"upi://\"]")).toHaveAttribute("href", /^upi:\/\/pay\?pa=billing%40okhdfc.*am=12500\.00/);

  await expectNoSideScroll(customerPage, "the payment page");

  // ===== The kitchen chooses what customers are offered: each method alone, or both =====
  await page.goto("/settings/integration/payments");
  await expect(page.getByTestId("offered-methods")).toContainText("Customers see: Razorpay and UPI QR");
  await page.getByRole("switch", { name: "Offer Razorpay to customers" }).click();
  await expect(page.getByTestId("offered-methods")).toContainText("Customers see: UPI QR.");
  await customerPage.reload();
  await expect(customerPage.getByTestId("upi-qr")).toBeVisible();
  await expect(customerPage.getByRole("button", { name: "Pay with Card, UPI or Net Banking" })).toHaveCount(0);
  await page.getByRole("switch", { name: "Offer UPI QR to customers" }).click();
  await expect(page.getByTestId("offered-methods")).toContainText("Nothing yet");
  await customerPage.reload();
  await expect(customerPage.getByText("The kitchen will share payment details with you directly.")).toBeVisible();
  await page.getByRole("switch", { name: "Offer Razorpay to customers" }).click();
  await page.getByRole("switch", { name: "Offer UPI QR to customers" }).click();
  await expect(page.getByTestId("offered-methods")).toContainText("Both are offered side by side");
  await customerPage.reload();
  await expect(customerPage.getByTestId("upi-qr")).toBeVisible();
  await expect(customerPage.getByRole("button", { name: "Pay with Card, UPI or Net Banking" })).toBeVisible();
  await page.goto(invoiceUrl);

  // "I have paid" waits for the kitchen: nothing changes on the order yet
  await customerPage.getByRole("button", { name: "I have paid" }).click();
  await expect(customerPage.getByTestId("pay-done")).toContainText("we have noted your payment");
  expect(Number((await getOrderMoney(orderId)).advance)).toBe(7500);

  await page.reload();
  await expect(page.getByText("Awaiting confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByTestId("paid-amount")).toHaveText("₹20,000.00");
  await expect(page.getByTestId("balance-amount")).toHaveText("₹0.00");
  expect((await getOrderMoney(orderId)).paymentStatus).toBe("PAID");

  // Paid in full: the link now reads as no longer active
  await customerPage.goto(payPath);
  await expect(customerPage.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();

  // ===== Customer invoice page: a no-login secure link =====
  await page.goto("/invoices");
  await expect(page.getByText("INV-0001")).toBeVisible();
  await expect(page.getByText("RCT-0001")).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  const invoiceLink = await getLatestInvoiceLink(organizationId, "invoice.sent");
  expect(invoiceLink).toContain("/invoice/");
  const customerInvoicePath = new URL(invoiceLink!).pathname;
  await customerPage.goto(customerInvoicePath);
  await expect(customerPage.getByRole("heading", { name: "Your Invoice" })).toBeVisible();
  await expect(customerPage.getByTestId("invoice-paper")).toContainText("Billing Customer");
  await expect(customerPage.getByTestId("invoice-total")).toHaveText("₹20,000.00");
  await expectNoSideScroll(customerPage, "the customer invoice page");
  const customerPdf = await customerPage.request.get(`${customerInvoicePath}/pdf`);
  expect(customerPdf.status()).toBe(200);
  // "Record & Send Receipt" sent the customer a receipt link for that one payment
  await customerPage.goto(new URL((await getLatestInvoiceLink(organizationId, "receipt.sent"))!).pathname);
  await expect(customerPage.getByRole("heading", { name: "Your Receipt" })).toBeVisible();
  await expect(customerPage.getByTestId("invoice-total")).toHaveText("₹2,500.00");
  // A wrong token reads as a neutral inactive page
  await customerPage.goto("/invoice/not-a-real-token");
  await expect(customerPage.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();
  await customerContext.close();
});

test("Razorpay webhook: bad signature refused, a good one confirms the payment once, a second delivery changes nothing", async ({ page, request }) => {
  test.setTimeout(180_000);
  const email = `e2e-webhook-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Hook", lastName: "Tester", phone: "9800000055" });
  const { orderId, organizationId } = await seedOrderForBilling(email, 10000);

  await page.goto("/settings/integration/payments");
  await page.getByLabel("Key ID").fill("rzp_test_HOOK123456");
  await page.getByLabel("Key Secret").fill("hook-key-secret");
  await page.getByLabel("Webhook Secret").fill("hook-webhook-secret");
  await page.getByRole("button", { name: "Save Razorpay" }).click();
  await expect(page.getByText("Razorpay saved.")).toBeVisible();

  const razorpayOrderId = `order_${Date.now()}`;
  await seedPendingRazorpayPayment(organizationId, orderId, razorpayOrderId, 4000);

  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_${Date.now()}`, order_id: razorpayOrderId, method: "card" } } } });
  const sign = (secret: string) => createHmac("sha256", secret).update(body).digest("hex");
  const url = `/api/webhooks/razorpay/${organizationId}`;

  const forged = await request.post(url, { data: body, headers: { "x-razorpay-signature": sign("wrong-secret"), "content-type": "application/json" } });
  expect(forged.status()).toBe(401);
  const unknownKitchen = await request.post("/api/webhooks/razorpay/no-such-kitchen", { data: body, headers: { "x-razorpay-signature": sign("hook-webhook-secret"), "content-type": "application/json" } });
  expect(unknownKitchen.status()).toBe(401);
  expect((await getPaymentsForOrder(orderId))[0].status).toBe("PENDING");

  const good = await request.post(url, { data: body, headers: { "x-razorpay-signature": sign("hook-webhook-secret"), "content-type": "application/json" } });
  expect(good.status()).toBe(200);
  const second = await request.post(url, { data: body, headers: { "x-razorpay-signature": sign("hook-webhook-secret"), "content-type": "application/json" } });
  expect(second.status()).toBe(200);

  const payments = await getPaymentsForOrder(orderId);
  expect(payments).toHaveLength(1);
  expect(payments[0].status).toBe("CONFIRMED");
  expect(Number(payments[0].amount)).toBe(4000);
  const money = await getOrderMoney(orderId);
  expect(Number(money.advance)).toBe(4000);
  expect(money.paymentStatus).toBe("PARTIALLY_PAID");

  await page.goto("/invoices");
  await expect(page.getByText("RCT-0001")).toBeVisible(); // the receipt was made on confirmation
});
