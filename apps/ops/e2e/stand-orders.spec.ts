import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-stand-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const KEY = `e2es${randomBytes(3).toString("hex")}`;
const BIZ = `biz_${randomBytes(16).toString("hex")}`;
const ORDER = `stand_${randomBytes(16).toString("hex")}`;
const root = path.join(__dirname, "..");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(root, ".env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl() });

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Stand Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
  await pool.query("insert into product (key, name, status, \"baseUrl\", \"outboundSecret\", \"inboundSecret\", \"updatedAt\") values ($1, $2, 'ACTIVE', 'http://127.0.0.1:1', 'x', 'x', now())", [KEY, `E2E Stand Product ${KEY}`]);
  await pool.query("insert into business (id, name, \"ownerEmail\", \"ownerName\", \"updatedAt\") values ($1, 'E2E Stand Kitchen', 'owner@example.test', 'Owner', now())", [BIZ]);
  await pool.query("insert into business_product (\"businessId\", \"productKey\") values ($1, $2)", [BIZ, KEY]);
  const shipTo = JSON.stringify({ name: "Asha Rao", phone: "+919876543210", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" });
  await pool.query(
    `insert into stand_order (id, "businessId", "productKey", quantity, "unitAmount", amount, "gstPercent", "gstAmount", total, "paymentStatus", "razorpayOrderId", "invoiceNumber", "paidAt", "shipTo", buyer, "kitchenName", "linkUrl")
     values ($1, $2, $3, 2, 500, 1000, 18, 180, 1180, 'PAID', $4, $5, now(), $6, '{}'::jsonb, 'E2E Stand Kitchen', 'https://catering.platterly.in/e2e-kitchen')`,
    [ORDER, BIZ, KEY, `order_${randomBytes(6).toString("hex")}`, `E2E-${randomBytes(3).toString("hex")}`, shipTo],
  );
});
test.afterAll(async () => {
  await pool.query("delete from message_log where \"businessId\" = $1", [BIZ]);
  await pool.query("delete from notification where \"productKey\" = $1", [KEY]);
  await pool.query("delete from stand_order where \"businessId\" = $1", [BIZ]);
  await pool.query("delete from business where id = $1", [BIZ]);
  await pool.query("delete from product where key = $1", [KEY]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("Stand orders: set the price, find the paid order, download the A6 print file, and move it Placed to Delivered", async ({ page, context }) => {
  await context.addCookies([{ name: "ops_product", value: KEY, url: "http://ops.localhost:3200" }]);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Stand orders" }).click();
  await expect(page.getByRole("heading", { name: "Stand orders" })).toBeVisible();
  await expect(page.getByText("1 to do")).toBeVisible();

  // The price of one stand (before GST) is set here.
  await page.getByLabel("Price per stand (₹, before GST)").fill("450");
  await page.getByLabel("GST (%)").fill("18");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const price = await pool.query("select \"standPrice\", \"standGstPercent\" from product where key = $1", [KEY]);
  expect(Number(price.rows[0].standPrice)).toBe(450);

  await expect(page.getByRole("row", { name: /E2E Stand Kitchen/ })).toContainText("₹1,180.00");
  await page.getByRole("link", { name: /E2E-/ }).click();
  await expect(page.getByText("1 Main Rd, Bengaluru, Karnataka, 560001, India")).toBeVisible();
  await expect(page.getByText("QR to https://catering.platterly.in/e2e-kitchen")).toBeVisible();

  // The print file: an A6 PDF.
  const download = await page.request.get(`${page.url()}/print`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("application/pdf");
  expect(Buffer.from(await download.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Forward only: Printing, Shipped (with a delivery note), Delivered.
  await page.getByRole("button", { name: "Start printing" }).click();
  await expect(page.getByRole("button", { name: "Mark as shipped" })).toBeVisible();
  await page.getByLabel(/Delivery note/).fill("Courier ABC 123");
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.getByText("Delivery note: Courier ABC 123")).toBeVisible();
  await page.getByRole("button", { name: "Mark as delivered" }).click();
  await expect(page.getByText("Delivered.")).toBeVisible();
  const row = await pool.query("select fulfilment, \"trackingNote\" from stand_order where id = $1", [ORDER]);
  expect(row.rows[0]).toMatchObject({ fulfilment: "DELIVERED", trackingNote: "Courier ABC 123" });
  // The owner was emailed once when it shipped (logged; no real address is mailed in a test).
  const mails = await pool.query("select template from message_log where \"businessId\" = $1 order by \"createdAt\"", [BIZ]);
  expect(mails.rows.map((r: { template: string }) => r.template)).toEqual(["stand_shipped"]);
});
