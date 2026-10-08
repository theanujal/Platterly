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

/** Picks a product in the sidebar switcher (Plans and Sidebar notice are about one product). */
async function chooseProduct(page: import("@playwright/test").Page, name: string) {
  const switcher = page.getByRole("button", { name: /Change product$/ }).first();
  await switcher.click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(switcher).toContainText(name);
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
  await page.goto("/settings/products");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await request.post("/api/products/events", { data: {} })).status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("staff sign in, register a product, receive a signed sign-up, read its notification and sign out", async ({ page, request }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "wrong" })).toBeVisible();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).first().click();
  await page.getByRole("link", { name: /Products/ }).click();
  await page.getByText("Advanced").first().click();
  await page.getByLabel("Key").fill(PRODUCT);
  await page.getByLabel("Name").fill("E2E Product");
  await page.getByLabel("Address").fill("http://127.0.0.1:3999");
  await page.getByRole("button", { name: "Add product" }).click();
  const panel = page.getByRole("status").filter({ hasText: "Copy these connection settings now" });
  await expect(panel).toBeVisible();
  const inbound = /OPS_EVENT_SECRET=(\S+)/.exec((await panel.locator("pre").textContent()) ?? "")![1];

  // Signed here with plain HMAC, independently of the contract package, so a drift in the format would fail this test.
  const eventId = `evt_${randomBytes(16).toString("hex")}`;
  const body = JSON.stringify({ eventId, productKey: PRODUCT, businessId: `biz_${randomBytes(16).toString("hex")}`, occurredAt: new Date().toISOString(), type: "business.signed_up", data: { businessName: BUSINESS, ownerName: "Asha", ownerEmail: "asha@e2e.example" } });
  const ts = Math.floor(Date.now() / 1000);
  const headers = { "content-type": "application/json", "x-platterly-timestamp": String(ts), "x-platterly-signature": `v1=${createHmac("sha256", inbound).update(`${ts}.${body}`).digest("hex")}`, "x-platterly-event-id": eventId, "x-platterly-contract": "1" };
  expect((await request.post("/api/products/events", { data: body, headers })).status()).toBe(200);
  expect((await request.post("/api/products/events", { data: body, headers })).status()).toBe(200); // a retry is accepted once, applied once

  await page.getByRole("link", { name: "Businesses" }).first().click();
  await page.getByRole("link", { name: BUSINESS, exact: true }).click();
  await expect(page.getByRole("heading", { name: BUSINESS })).toBeVisible();

  await page.getByRole("link", { name: /Notifications/ }).first().click();
  await page.getByRole("link", { name: "Unread" }).click();
  const item = page.getByRole("listitem").filter({ hasText: BUSINESS });
  await expect(item).toHaveCount(1);
  await item.getByRole("button", { name: "Mark read" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: BUSINESS })).toHaveCount(0);

  await page.goto("/settings/products");
  await page.getByRole("link", { name: "E2E Product" }).click();
  await page.getByRole("button", { name: "Check connection now" }).click();
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

    await chooseProduct(page, "E2E Plan Product");
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

    await page.goto(`/businesses/${bizId}?tab=subscription`);
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
    await page.getByRole("button", { name: "Save billing details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Legal name")).toHaveValue("E2E Platterly Pvt Ltd");
    // Numbering follows the product: the preview uses each product's own prefix (catering keeps FP), not the fallback just saved.
    await expect(page.getByText(/Catering: next invoice/)).toContainText("FPEB");
  } finally {
    const cols = ["legalName", "addressLine1", "addressLine2", "city", "state", "stateCode", "postalCode", "country", "gstin", "pan", "sacCode", "invoicePrefix", "email", "phone", "website", "invoiceNote"];
    await pool.query(`update platform_billing_profile set ${cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ")} where id = 'platform'`, cols.map((c) => before[c]));
  }
});


test("staff set a sidebar notice: a bad link is refused, a good one is saved and queued for the product's business", async ({ page }) => {
  const key = `e2enotice${randomBytes(3).toString("hex")}`;
  const bizId = `biz_${randomBytes(16).toString("hex")}`;
  await pool.query('insert into product (key, name, "baseUrl", "outboundSecret", "inboundSecret", "updatedAt") values ($1, $2, $3, $4, $5, now())', [key, "E2E Notice Product", "http://127.0.0.1:9", "v1.x.x.x", "v1.x.x.x"]);
  await pool.query('insert into business (id, name, "updatedAt") values ($1, $2, now())', [bizId, `E2E Notice Kitchen ${randomBytes(3).toString("hex")}`]);
  await pool.query('insert into business_product ("businessId", "productKey") values ($1, $2)', [bizId, key]);
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await chooseProduct(page, "E2E Notice Product");
    await page.getByRole("link", { name: "Sidebar notice" }).first().click();
    const form = page.locator("form").filter({ hasText: "E2E Notice Product sidebar notice" });
    await form.getByLabel("Show the notice").check();
    await form.getByLabel("Title").fill("Diwali offer");
    await form.getByLabel("Button label").fill("See plans");
    await form.getByLabel("Button link").fill("javascript:alert(1)");
    await form.getByRole("button", { name: "Save and send to every business" }).click();
    await expect(form.locator("p[role=alert]")).toContainText("must start with /");

    await form.getByLabel("Button link").fill("/subscribe");
    await form.getByRole("button", { name: "Save and send to every business" }).click();
    await expect(form.getByRole("status")).toContainText("Saved and sent to 1 of 1 business");
    // This test product has placeholder secrets and no server, so delivery cannot succeed; the screen must say so rather than hide it.
    await expect(page.getByText("1 failed")).toBeVisible();
    const queued = await pool.query("select payload from outbound_command where \"productKey\" = $1 and type = 'notice.set'", [key]);
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0].payload).toMatchObject({ businessId: bizId, payload: { enabled: true, title: "Diwali offer", buttonUrl: "/subscribe" } });
  } finally {
    await pool.query("delete from business where id = $1", [bizId]);
    await pool.query("delete from product where key = $1", [key]);
  }
});

test("staff create a business and manage its status: input is checked, and what the product refuses is shown", async ({ page }) => {
  const key = `e2elife${randomBytes(3).toString("hex")}`;
  const bizId = `biz_${randomBytes(16).toString("hex")}`;
  const bizName = `E2E Life Kitchen ${randomBytes(3).toString("hex")}`;
  const manifest = { contract: 1, productKey: key, name: "E2E Life Product", version: "1", baseUrl: "https://x.example", entitlements: [], trial: { days: 7, entitlements: {} }, actions: ["slug", "provider"] };
  await pool.query('insert into product (key, name, "baseUrl", "outboundSecret", "inboundSecret", manifest, "manifestVersion", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, now())', [key, "E2E Life Product", "http://127.0.0.1:9", "v1.x.x.x", "v1.x.x.x", JSON.stringify(manifest), "1"]);
  await pool.query('insert into business (id, name, "ownerEmail", "ownerName", "updatedAt") values ($1, $2, $3, $4, now())', [bizId, bizName, "o@e2e.example", "Owner"]);
  await pool.query('insert into business_product ("businessId", "productKey") values ($1, $2)', [bizId, key]);
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    // A product with no trial plan cannot start a business.
    await page.goto("/businesses/new");
    await page.getByLabel("Product", { exact: true }).selectOption(key);
    await page.getByLabel("Business name").fill("Nobody Kitchen");
    await page.getByLabel("Owner's name").fill("Nobody");
    await page.getByLabel("Owner's email").fill("nobody@e2e.example");
    await page.getByRole("button", { name: "Create business" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("no active trial plan");

    await page.goto(`/businesses/${bizId}`);
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
    // Deleting needs the exact business name; a wrong one is refused before anything is sent.
    await page.getByLabel("Delete", { exact: true }).fill("not the name");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Type the business name exactly");
    // A product that cannot be reached with these placeholder secrets: the reason is shown, not swallowed.
    await page.getByLabel("Suspend").fill("non-payment");
    await page.getByRole("button", { name: "Suspend" }).click();
    await expect(page.locator("p[role=alert]").last()).toBeVisible();
    expect((await pool.query('select status from business where id = $1', [bizId])).rows[0].status).toBe("ACTIVE");
    // The change-details panel is there, with the product's own link and provider controls.
    await page.getByText("Change details and message providers").click();
    await expect(page.getByLabel("Public link")).toBeVisible();
    await expect(page.getByLabel("Message provider")).toBeVisible();
  } finally {
    await pool.query("delete from business where id = $1 or name = 'Nobody Kitchen'", [bizId]);
    await pool.query("delete from product where key = $1", [key]);
  }
});

test("staff open Reports: Subscriptions and Sign-ups come from ops, a product's own report shows why it could not load", async ({ page }) => {
  const key = `e2erep${randomBytes(3).toString("hex")}`;
  const manifest = { contract: 1, productKey: key, name: "E2E Report Product", version: "1", baseUrl: "http://127.0.0.1:9", entitlements: [], trial: { days: 7, entitlements: {} }, reports: [{ key: "sales", label: "Sales" }] };
  await pool.query('insert into product (key, name, "baseUrl", "outboundSecret", "inboundSecret", manifest, "manifestVersion", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, now())', [key, "E2E Report Product", "http://127.0.0.1:9", "v1.x.x.x", "v1.x.x.x", JSON.stringify(manifest), "1"]);
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Reports" }).first().click();
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    // The gallery groups what Ops can say about itself; with no product picked there is no product-report section.
    for (const group of ["Revenue", "Customers", "Compliance", "Operations"]) await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /E2E Report Product reports/ })).toHaveCount(0); // no product picked yet

    await page.getByRole("link", { name: /^Subscriptions/ }).click();
    await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();
    await expect(page.getByText("MRR (monthly recurring revenue)")).toBeVisible();
    // The report on screen downloads as a file (a signed-in request: the page's own cookies).
    const file = await page.request.get((await page.getByRole("link", { name: "Download as CSV" }).getAttribute("href"))!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toContain("text/csv");
    expect(await file.text()).toContain("MRR by plan");

    // A chart report draws a chart and still downloads.
    await page.goto("/reports/revenue-trend");
    await expect(page.getByRole("img", { name: "MRR at the end of each month" })).toBeVisible();
    const trend = await page.request.get((await page.getByRole("link", { name: "Download as CSV" }).getAttribute("href"))!);
    expect(await trend.text()).toContain("MRR at the end of each month");
    await page.goto("/reports/no-such-report");
    await expect(page.getByText("This page could not be found")).toBeVisible();

    // A product's own reports show once the product is picked; this one cannot be reached, and the page says so instead of failing.
    await chooseProduct(page, "E2E Report Product");
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "E2E Report Product reports" })).toBeVisible();
    await page.getByRole("link", { name: /^Sales/ }).click();
    await expect(page.locator("p[role=alert]")).toContainText(/signing secret|Could not reach/);
  } finally {
    await pool.query("delete from product where key = $1", [key]);
  }
});
