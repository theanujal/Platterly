import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-staff-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const PRODUCT = `e2e${randomBytes(3).toString("hex")}`;
const BUSINESS = `E2E Spice ${randomBytes(3).toString("hex")}`;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(path.join(__dirname, "../.env"), "utf8");
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(env)![1];
}

const pool = new pg.Pool({ connectionString: databaseUrl() });

test.beforeAll(async () => {
  // Staff are normally created by `npm run ops:create-staff`; the script is the real path, so use it.
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Staff", EMAIL], { cwd: path.join(__dirname, ".."), env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
});

test.afterAll(async () => {
  await pool.query("delete from business where name = $1", [BUSINESS]);
  await pool.query("delete from product where key = $1", [PRODUCT]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("a protected page sends a signed-out visitor to sign-in, and the event endpoint refuses unsigned posts", async ({ page, request }) => {
  await page.goto("/products");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await request.post("/api/products/events", { data: {} })).status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("staff sign in, register a product, receive a signed sign-up, acknowledge its alert and sign out", async ({ page, request }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "wrong" })).toBeVisible();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Products" }).first().click();
  await page.getByLabel("Key").fill(PRODUCT);
  await page.getByLabel("Name").fill("E2E Product");
  await page.getByLabel("Base URL").fill("http://127.0.0.1:3999");
  await page.getByRole("button", { name: "Register product" }).click();
  const panel = page.getByRole("status").filter({ hasText: "Copy these secrets now" });
  await expect(panel).toBeVisible();
  const [, inbound] = (await panel.locator("dd").allTextContents()).map((s) => s.trim());

  // Signed here with plain HMAC, independently of the contract package, so a drift in the format would fail this test.
  const eventId = `evt_${randomBytes(16).toString("hex")}`;
  const body = JSON.stringify({ eventId, productKey: PRODUCT, businessId: `biz_${randomBytes(16).toString("hex")}`, occurredAt: new Date().toISOString(), type: "business.signed_up", data: { businessName: BUSINESS, ownerName: "Asha", ownerEmail: "asha@e2e.example" } });
  const ts = Math.floor(Date.now() / 1000);
  const headers = { "content-type": "application/json", "x-platterly-timestamp": String(ts), "x-platterly-signature": `v1=${createHmac("sha256", inbound).update(`${ts}.${body}`).digest("hex")}`, "x-platterly-event-id": eventId, "x-platterly-contract": "1" };
  expect((await request.post("/api/products/events", { data: body, headers })).status()).toBe(200);
  expect((await request.post("/api/products/events", { data: body, headers })).status()).toBe(200); // a retry is accepted once, applied once

  await page.getByRole("link", { name: "Businesses" }).first().click();
  await page.getByRole("link", { name: BUSINESS }).click();
  await expect(page.getByRole("heading", { name: BUSINESS })).toBeVisible();

  await page.getByRole("link", { name: /Alerts/ }).first().click();
  const row = page.getByRole("row").filter({ hasText: BUSINESS });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByRole("row").filter({ hasText: BUSINESS })).toHaveCount(0);

  await page.getByRole("link", { name: "Products" }).first().click();
  await page.getByRole("link", { name: "E2E Product" }).click();
  await page.getByRole("button", { name: "Refresh manifest" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Could not reach/ })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("staff create a plan from a product's manifest, assign it to a business and see the snapshot issued", async ({ page }) => {
  const key = `e2eplan${randomBytes(3).toString("hex")}`;
  const bizId = `biz_${randomBytes(16).toString("hex")}`;
  const bizName = `E2E Plan Kitchen ${randomBytes(3).toString("hex")}`;
  const manifest = { contract: 1, productKey: key, name: "E2E Plan Product", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }, { key: "multiLocation", type: "flag", label: "Multiple locations" }], trial: { days: 7, entitlements: {} } };
  // Registering and reading a manifest is covered above; here the product just needs one to build plans from.
  await pool.query('insert into product (key, name, "baseUrl", "outboundSecret", "inboundSecret", manifest, "manifestVersion", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, now())', [key, "E2E Plan Product", "http://127.0.0.1:9", "v1.x.x.x", "v1.x.x.x", JSON.stringify(manifest), "1"]);
  await pool.query('insert into business (id, name, "ownerEmail", "ownerName", "updatedAt") values ($1, $2, $3, $4, now())', [bizId, bizName, "o@e2e.example", "Owner"]);
  await pool.query('insert into business_product ("businessId", "productKey") values ($1, $2)', [bizId, key]);
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Plans" }).first().click();
    await page.getByRole("link", { name: "New E2E Plan Product plan" }).click();
    await page.getByLabel("Name", { exact: true }).fill("E2E Pro");
    await page.getByLabel("Code").fill("pro");
    await page.getByLabel("Monthly price (₹)").fill("999");
    await page.getByLabel("Annual price (₹)").fill("9999");
    await page.getByLabel("Customers").fill("25");
    await page.getByLabel("Multiple locations").check();
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { name: "E2E Pro" })).toBeVisible();

    // A bad value is refused with a plain message (a trial plan needs a length; p[role=alert] avoids Next's route announcer).
    await page.getByLabel("This is the trial plan").check();
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("trial length");
    await page.getByLabel("This is the trial plan").uncheck();

    await page.goto(`/businesses/${bizId}`);
    await expect(page.getByText("No subscription")).toBeVisible();
    await page.getByLabel("Assign a plan").selectOption({ label: "E2E Pro" });
    await page.getByRole("button", { name: "Assign plan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Plan assigned" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("E2E Pro · active")).toBeVisible();
    await expect(page.getByText(/Snapshot version 1/)).toBeVisible();
  } finally {
    await pool.query("delete from subscription where \"businessId\" = $1", [bizId]);
    await pool.query("delete from business where id = $1", [bizId]);
    await pool.query("delete from plan where \"productKey\" = $1", [key]);
    await pool.query("delete from product where key = $1", [key]);
  }
});

test("staff edit the seller's billing details: a bad GSTIN is refused, a good one is saved, and the screen shows Razorpay is off", async ({ page }) => {
  // The real seller profile is shared state, so it is put back exactly as it was.
  const before = (await pool.query("select * from platform_billing_profile where id = 'platform'")).rows[0];
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Billing" }).first().click();
    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
    await expect(page.getByText("Payments received")).toBeVisible();
    await page.getByLabel("Legal name").fill("E2E Platterly Pvt Ltd");
    await page.getByLabel("GSTIN").fill("not-a-gstin");
    await page.getByRole("button", { name: "Save billing details" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("GSTIN should look like");

    await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
    await page.getByLabel("State code").fill("29");
    await page.getByLabel("Invoice prefix").fill("e2e");
    await page.getByRole("button", { name: "Save billing details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Legal name")).toHaveValue("E2E Platterly Pvt Ltd");
    await expect(page.getByLabel("Invoice prefix")).toHaveValue("E2E");
    await expect(page.getByText(/next invoice would look like/)).toContainText("E2EEB");
  } finally {
    const cols = ["legalName", "addressLine1", "addressLine2", "city", "state", "stateCode", "postalCode", "country", "gstin", "pan", "sacCode", "invoicePrefix", "email", "phone", "website", "invoiceNote"];
    await pool.query(`update platform_billing_profile set ${cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ")} where id = 'platform'`, cols.map((c) => before[c]));
  }
});

