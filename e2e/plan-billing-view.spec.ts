import "dotenv/config";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { signUpCaterer } from "./auth-helpers";
import { cleanupOnboardingTestUser, setMemberRole, setSensitiveGrants } from "./db";

/**
 * Caterly's read-only Subscription page (docs/caterly-billing-view-plan.md, AJ 2026-11-15). The owner sees the plan, price, what it includes, payments, invoice and credit
 * note downloads and the button to the Store; a role sees the page only after the owner gives it "Billing and Plan" (planBilling), without the button; a role without it, and
 * the Old Admin, are sent away and cannot download. The data is Platterly Ops's: a paid payment and an approved refund are seeded there. Needs the Platform, identity and Ops on
 * THROWAWAY databases, Caterly started with Ops billing on, the mail sink, PLATFORM_SSO_E2E=1, IDENTITY_DATABASE_URL and OPS_THROWAWAY_DATABASE_URL (each containing "throwaway").
 */
test.skip(
  process.env.PLATFORM_SSO_E2E !== "1" || process.env.OPS_BILLING === "0" || ![process.env.IDENTITY_DATABASE_URL, process.env.OPS_THROWAWAY_DATABASE_URL].every((u) => /throwaway/.test(u ?? "")),
  "needs throwaway Platform, identity and Ops databases, Caterly with Ops billing on, and the mail sink",
);

const caterly = new Pool({ connectionString: process.env.DATABASE_URL });
const ops = new Pool({ connectionString: process.env.OPS_THROWAWAY_DATABASE_URL });
const emails: string[] = [];
let businessId = "";
const PAY = "pay_e2eplanview000000000000000000001";
const REQ = "rfr_e2eplanview00000000000000000001";
const REF = "rf_e2eplanview000000000000000000001";
const hex = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

async function cleanOps() {
  await ops.query('delete from refund where "paymentId" = $1', [PAY]);
  await ops.query('delete from refund_request where "paymentId" = $1', [PAY]);
  await ops.query("delete from subscription_payment where id = $1", [PAY]);
}
test.afterEach(async () => {
  await cleanOps();
  for (const email of emails.splice(0)) await cleanupOnboardingTestUser(email);
  if (businessId) {
    await caterly.query(`delete from platform_outbox where "businessId" = $1`, [businessId]);
    await caterly.query(`delete from ops_outbox where "businessId" = $1`, [businessId]);
    await caterly.query(`delete from subscription where "organizationId" in (select id from organization where "businessId" = $1)`, [businessId]);
    await caterly.query(`delete from organization where "businessId" = $1`, [businessId]);
  }
});
test.afterAll(async () => {
  await Promise.all([caterly.end(), ops.end()]);
});

test("owner sees the page and downloads; a granted role sees it without the button; others are sent away", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-planview-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email, { firstName: "Plan", lastName: "View", phone: "9800000081" });
  businessId = (await caterly.query<{ businessId: string }>('select o."businessId" from organization o join member m on m."organizationId" = o.id join "user" u on u.id = m."userId" where u.email = $1 limit 1', [email])).rows[0].businessId;

  // Ops learns about the business from the sign-up; wait for it, then give it a paid yearly plan, a paid payment and an approved refund with its credit note.
  await expect.poll(async () => (await ops.query("select 1 from business where id = $1", [businessId])).rowCount, { timeout: 60_000 }).toBe(1);
  const plan = (await ops.query(`select id from plan where "productKey" = 'catering' and name = 'Cross Platform'`)).rows[0].id;
  const updated = await ops.query(`update subscription set "planId" = $2, status = 'ACTIVE', "billingInterval" = 'ANNUAL', "trialEndsAt" = null, "currentPeriodEnd" = (now() at time zone 'utc') + interval '300 days', "razorpaySubscriptionId" = null, "autoPay" = null where "businessId" = $1 and "endDate" is null`, [businessId, plan]);
  if (updated.rowCount === 0) await ops.query(`insert into subscription (id, "businessId", "productKey", "planId", status, "billingInterval", "currentPeriodEnd", "updatedAt") values ($1, $2, 'catering', $3, 'ACTIVE', 'ANNUAL', (now() at time zone 'utc') + interval '300 days', now())`, [`sub_${hex()}`, businessId, plan]);
  const snapshot = JSON.stringify({ seller: { legalName: "Platterly Pvt Ltd", addressLine1: null, addressLine2: null, city: "Bengaluru", state: "Karnataka", stateCode: "29", postalCode: null, country: "India", gstin: "29AAAAA0000A1Z5", pan: null, sacCode: "998314", email: null, phone: null, website: null, note: null }, buyer: { name: "Plan View Kitchen", addressLine1: "1 Main", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: null }, gst: { kind: "INTER", lines: [{ label: "IGST (18%)", amount: 7199.82 }] }, highlights: ["everything upcoming"] });
  await ops.query(`insert into subscription_payment (id, "businessId", "productKey", "planId", interval, amount, "gstPercent", "gstAmount", total, status, "razorpayPaymentId", "invoiceNumber", "paidAt", "periodStart", "periodEnd", "invoiceSnapshot") values ($1, $2, 'catering', $3, 'ANNUAL', 39999, 18, 7199.82, 47198.82, 'PAID', 'pay_rzp_e2eplanview', 'E2E-PLANVIEW-1', (now() at time zone 'utc') - interval '1 day', now() at time zone 'utc', (now() at time zone 'utc') + interval '364 days', $4::jsonb)`, [PAY, businessId, plan, snapshot]);
  await ops.query(`insert into refund_request (id, "paymentId", "businessId", reason, status, "decidedAt") values ($1, $2, $3, 'Closing', 'APPROVED', now() at time zone 'utc')`, [REQ, PAY, businessId]);
  await ops.query(`insert into refund (id, "requestId", "paymentId", amount, "gstAmount", total, "endMode", "razorpayRefundId", "creditNoteNumber") values ($1, $2, $3, 500, 90, 590, 'KEEP_TO_PERIOD_END', 'rfnd_e2e_planview', 'E2ECN-PV-1')`, [REF, REQ, PAY]);

  // The owner: the page, the price and what the plan includes, the payment with its refund state, both downloads, and the way to the Store.
  await page.goto("/settings/subscription");
  await expect(page.getByRole("heading", { name: "Subscription", level: 1 })).toBeVisible();
  await expect(page.getByTestId("plan-name")).toHaveText("Cross Platform");
  await expect(page.getByTestId("plan-status")).toHaveText("Active");
  await expect(page.getByText("₹47,198.82 a year, GST included")).toBeVisible();
  await expect(page.getByTestId("plan-includes")).toContainText("everything upcoming");
  const payment = page.getByTestId(`payment-${PAY}`);
  await expect(payment).toContainText("invoice E2E-PLANVIEW-1");
  await expect(payment).toContainText("Partly refunded");
  await expect(page.getByTestId("manage-in-store")).toHaveAttribute("href", /store\.localhost:3300\/manage\/caterly/);
  const invoice = await page.request.get(`/settings/subscription/invoice/${PAY}`);
  expect(invoice.status()).toBe(200);
  expect((await invoice.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const note = await page.request.get(`/settings/subscription/credit-note/${REF}`);
  expect(note.status()).toBe(200);
  expect(note.headers()["content-disposition"]).toContain("E2ECN-PV-1.pdf");
  // The Settings menu offers it.
  await expect(page.getByRole("link", { name: "Subscription" }).first()).toBeVisible();
  // Nothing on the page changes anything: no pay, cancel, refund or auto-pay control.
  await expect(page.getByRole("button", { name: /pay|cancel|refund|renew|pause/i })).toHaveCount(0);

  // A manager has no "Billing and Plan": sent away, no menu entry, no downloads.
  await setMemberRole(email, "manager");
  await page.goto("/settings/subscription");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/settings/account/business-profile");
  await expect(page.getByRole("link", { name: "Subscription" })).toHaveCount(0);
  expect((await page.request.get(`/settings/subscription/invoice/${PAY}`)).status()).toBe(404);
  expect((await page.request.get(`/settings/subscription/credit-note/${REF}`)).status()).toBe(404);

  // The owner gives the manager "Billing and Plan": the page opens, with no button to the Store, and the downloads work.
  await setSensitiveGrants(email, "manager", ["planBilling"]);
  await page.goto("/settings/subscription");
  await expect(page.getByTestId("plan-name")).toHaveText("Cross Platform");
  await expect(page.getByTestId("manage-in-store")).toHaveCount(0);
  await expect(page.getByText("Plan changes and payments are made by your Business Admin.")).toBeVisible();
  expect((await page.request.get(`/settings/subscription/invoice/${PAY}`)).status()).toBe(200);

  // Taking it away closes the page again, and the Old Admin never has it.
  await setSensitiveGrants(email, "manager", []);
  await page.goto("/settings/subscription");
  await expect(page).toHaveURL(/\/dashboard$/);
  await setMemberRole(email, "oldAdmin");
  await page.goto("/settings/subscription");
  await expect(page).toHaveURL(/\/dashboard$/);
});
