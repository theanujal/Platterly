import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, confirmOrderPayment, seedApprovedOrderForShare, seedOrderPayment } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * The Confirmation page keeps a payment record (AJ, 2026-10-17): a UPI payment the customer reported shows at once as awaiting the
 * kitchen, turns Received on its own once the kitchen confirms it (no reload), and the balance follows. The order number is large
 * under the title and in the browser tab.
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("a UPI payment waits for the kitchen, then shows as received without a reload", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = `e2e-cps-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Pay", lastName: "Status", phone: "9800000081" });
  const { approvalToken, orderId } = await seedApprovedOrderForShare(email, { stage: "CONFIRMATION" });
  const paymentId = await seedOrderPayment(orderId, { amount: 500, status: "PENDING", reference: "UTR998877" });

  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await expect(customer.getByTestId("order-number-badge")).toContainText("ORD-");
  await expect(customer).toHaveTitle(/^Order ORD-\d+ – /);
  await expect(customer.getByText(/until \d+ \w+ \d{4}/)).toBeVisible(); // how long the link works

  const card = customer.getByTestId("payment-status");
  await expect(card.getByTestId("payment-headline")).toHaveText("Payment awaiting confirmation");
  await expect(card.getByTestId("payment-awaiting")).toHaveText("₹500.00");
  await expect(card.getByTestId("payment-received")).toHaveText("₹0.00");
  await expect(card.getByTestId("payment-waiting")).toBeVisible();
  const row = card.getByTestId("payment-row");
  await expect(row).toContainText("Awaiting confirmation");
  await expect(row).toContainText("Ref UTR998877");

  // The kitchen accepts it; the open page picks that up when the customer comes back to the tab.
  await confirmOrderPayment(paymentId);
  await customer.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(card.getByTestId("payment-received")).toHaveText("₹500.00", { timeout: 20_000 });
  await expect(card.getByTestId("payment-due")).toHaveText("₹500.00");
  await expect(card.getByTestId("payment-waiting")).toHaveCount(0);
  await expect(card.getByTestId("payment-row")).toContainText("Received");
  await expect(card.getByTestId("payment-headline")).toHaveText("Part payment received");
});

test("a fully paid order says so", async ({ page, browser }) => {
  const email = `e2e-cps2-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Paid", lastName: "Full", phone: "9800000082" });
  const { approvalToken, orderId } = await seedApprovedOrderForShare(email, { stage: "CONFIRMATION" });
  await seedOrderPayment(orderId, { amount: 1000, status: "CONFIRMED" });
  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await expect(customer.getByTestId("payment-headline")).toHaveText("Paid in full");
  await expect(customer.getByTestId("payment-due")).toHaveText("₹0.00");
  await expect(customer.getByTestId("payment-row")).toContainText("Received");
});
