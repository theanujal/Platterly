import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

/**
 * Staff decide refund requests in Ops (plan slice R3, 2026-11-15): the Refunds page lists the open requests with the business, what was paid and why, a decline
 * moves one to the Decided list and emails the owner, and an approval that cannot go through (too much, or Razorpay not taking it) says why and changes nothing.
 * A real Razorpay refund is NOT proven here (the seeded payment is not a real Razorpay payment). Needs the Ops dev server on 3200.
 */
const SUFFIX = randomBytes(4).toString("hex");
const EMAIL = `e2e-refund-${SUFFIX}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const BIZ = `biz_${randomBytes(16).toString("hex")}`;
const NAME = `E2E Refund Kitchen ${SUFFIX}`;
const PAY_A = `pay_e2e${randomBytes(8).toString("hex")}`;
const PAY_B = `pay_e2e${randomBytes(8).toString("hex")}`;
const REQ_A = `rfr_e2e${randomBytes(8).toString("hex")}`;
const REQ_B = `rfr_e2e${randomBytes(8).toString("hex")}`;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(__dirname, "../.env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl().replace(/\?.*$/, "") });

async function cleanData() {
  await pool.query('delete from message_log where "businessId" = $1', [BIZ]);
  await pool.query('delete from notification where "businessId" = $1', [BIZ]);
  await pool.query('delete from refund where "paymentId" = any($1)', [[PAY_A, PAY_B]]);
  await pool.query('delete from refund_request where "paymentId" = any($1)', [[PAY_A, PAY_B]]);
  await pool.query("delete from subscription_payment where id = any($1)", [[PAY_A, PAY_B]]);
  await pool.query('delete from business_product where "businessId" = $1', [BIZ]);
  await pool.query("delete from business where id = $1", [BIZ]);
}

test.beforeAll(async () => {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Staff", EMAIL], { cwd: path.join(__dirname, ".."), env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
  await cleanData();
  const plan = (await pool.query(`select id from plan where "productKey" = 'catering' and "isTrial" = false limit 1`)).rows[0].id;
  await pool.query('insert into business (id, name, "ownerName", "ownerEmail", "updatedAt") values ($1, $2, \'Asha\', \'owner@example.test\', now())', [BIZ, NAME]);
  await pool.query('insert into business_product ("businessId", "productKey") values ($1, \'catering\')', [BIZ]);
  for (const [pay, req, reason] of [[PAY_A, REQ_A, "Closing the kitchen"], [PAY_B, REQ_B, "Bought by mistake"]]) {
    await pool.query(`insert into subscription_payment (id, "businessId", "productKey", "planId", interval, amount, "gstPercent", "gstAmount", total, status, "razorpayPaymentId", "invoiceNumber", "paidAt") values ($1, $2, 'catering', $3, 'ANNUAL', 1000, 18, 180, 1180, 'PAID', $4, $5, (now() at time zone 'utc') - interval '2 days')`, [pay, BIZ, plan, `pay_fake_${pay}`, `E2E-${pay.slice(-4)}`]);
    await pool.query('insert into refund_request (id, "paymentId", "businessId", reason) values ($1, $2, $3, $4)', [req, pay, BIZ, reason]);
  }
});
test.afterAll(async () => {
  await cleanData();
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("the Refunds page lists open requests; a decline is recorded and emailed; an approval that cannot go through changes nothing", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Refunds" }).first().click();
  await expect(page.getByRole("heading", { name: "Refunds", level: 1 })).toBeVisible();

  const a = page.getByTestId(`refund-request-${REQ_A}`);
  const b = page.getByTestId(`refund-request-${REQ_B}`);
  await expect(a).toContainText(NAME);
  await expect(a).toContainText("Closing the kitchen");
  await expect(a).toContainText("₹1,180");
  await expect(a).toContainText("2 days ago");

  // Too much is refused with the plain reason, and nothing is recorded.
  await b.getByLabel("Refund amount (with GST)").evaluate((el) => el.removeAttribute("max"));
  await b.getByLabel("Refund amount (with GST)").fill("2000");
  await b.getByLabel("End it now (the kitchen locks)").check();
  await b.getByRole("button", { name: "Approve and refund" }).click();
  await expect(b.getByRole("alert")).toContainText("most that can be refunded");

  // A good amount reaches Razorpay, which does not know this seeded payment: the page says so and nothing is recorded.
  await b.getByLabel("Refund amount (with GST)").fill("500");
  await b.getByRole("button", { name: "Approve and refund" }).click();
  await expect(b.getByRole("alert")).toContainText(/Razorpay/);
  expect((await pool.query("select count(*) from refund where \"paymentId\" = $1", [PAY_B])).rows[0].count).toBe("0");
  expect((await pool.query("select status from refund_request where id = $1", [REQ_B])).rows[0].status).toBe("PENDING");

  // Declining with a note moves it to Decided and the owner is told.
  await a.getByLabel("Note to the owner (optional)").fill("Past our refund policy");
  await a.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByTestId(`refund-request-${REQ_A}`)).toHaveCount(0);
  const decided = page.getByRole("region", { name: "Decided" });
  await expect(decided).toContainText(NAME);
  await expect(decided).toContainText("Declined");
  await expect(decided).toContainText("Past our refund policy");
  expect((await pool.query("select status, \"rejectionNote\" from refund_request where id = $1", [REQ_A])).rows[0]).toEqual({ status: "REJECTED", rejectionNote: "Past our refund policy" });
  expect((await pool.query("select count(*) from message_log where \"businessId\" = $1 and template = 'refund_declined' and channel = 'EMAIL'", [BIZ])).rows[0].count).toBe("1"); // a WhatsApp copy writes its own row
});
