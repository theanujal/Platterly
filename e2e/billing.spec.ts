import { test, expect } from "@playwright/test";
import { activatePaidPlan, cleanupOnboardingTestUser, expireSubscription, seedPaidPlanPayment } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 20: a kitchen whose trial has run out can sign in but reaches only the payment page. The page shows the
 * Super Admin's price with GST, and once a payment lands the whole account opens again.
 * Razorpay itself is not called here (Platterly's own keys are not set in dev), so a landed payment is simulated in the DB.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("an ended trial lands on the payment page only; paying opens the account again", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-billing-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Bill", lastName: "Payer", phone: "9800000077" });

  // Fresh trial: the app is open and the paywall is not forced.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);

  await expireSubscription(email);
  for (const path of ["/dashboard", "/orders", "/settings/subscription", "/inventory"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/subscribe$/);
  }
  await expect(page.getByTestId("subscribe-title")).toHaveText("Your free trial has ended");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // The Premium plan's price comes from the Super Admin's plan: monthly first, then yearly, GST on top.
  const breakdown = page.getByTestId("price-breakdown");
  await expect(breakdown).toContainText("₹3,000");
  await expect(breakdown).toContainText("GST (18%)");
  await expect(breakdown).toContainText("₹540");
  await expect(page.getByRole("button", { name: "Pay ₹3,540" })).toBeVisible();
  await page.getByRole("switch", { name: "Pay yearly" }).click();
  await expect(breakdown).toContainText("₹33,000");
  await expect(breakdown).toContainText("₹5,940");
  await expect(page.getByRole("button", { name: "Pay ₹38,940" })).toBeVisible();

  // Razorpay keys are not set in dev: the page says so plainly and the button stays off.
  await expect(page.getByText("Online payment is not switched on yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay ₹38,940" })).toBeDisabled();

  // A payment lands: everything opens again.
  await activatePaidPlan(email, "premium", 30);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/settings/subscription");
  await expect(page.getByText("Premium").first()).toBeVisible();

  // A paid period that has run out locks it again.
  await activatePaidPlan(email, "premium", -1);
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/subscribe$/);
  await expect(page.getByTestId("subscribe-title")).toHaveText("Your plan has ended");
});

test("a paid plan payment lists with its invoice, and the invoice downloads as a PDF", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-billinv-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Inv", lastName: "Payer", phone: "9800000079" });
  await activatePaidPlan(email, "premium", 30);
  const paymentId = await seedPaidPlanPayment(email, "FPAC-26-10-1");

  await page.goto("/settings/subscription");
  const list = page.getByTestId("payments-list");
  await expect(list).toContainText("FPAC-26-10-1");
  await expect(list).toContainText("includes GST");

  const download = await page.request.get(`/settings/subscription/payment-invoice/${paymentId}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  expect(download.headers()["content-disposition"]).toContain("FPAC-26-10-1.pdf");
  const bytes = await download.body();
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  await (await import("node:fs/promises")).writeFile(process.env.INVOICE_PDF_OUT ?? "test-results/plan-invoice.pdf", bytes).catch(() => {});

  // Someone else's payment id is the same plain 404.
  expect((await page.request.get("/settings/subscription/payment-invoice/not-mine")).status()).toBe(404);
});
