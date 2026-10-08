import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-biz-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const KEY = `e2eb${randomBytes(3).toString("hex")}`;
const NAME = `E2E Biz Kitchen ${randomBytes(2).toString("hex")}`;
const PEER = `E2E Biz Peer ${randomBytes(2).toString("hex")}`;
const root = path.join(__dirname, "..");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(root, ".env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl() });
const bizId = `biz_${randomBytes(16).toString("hex")}`;
const peerId = `biz_${randomBytes(16).toString("hex")}`;

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Biz Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
  await pool.query("insert into product (key, name, status, \"baseUrl\", \"outboundSecret\", \"inboundSecret\", \"updatedAt\") values ($1, $2, 'ACTIVE', 'http://127.0.0.1:1', 'x', 'x', now())", [KEY, `E2E Biz Product ${KEY}`]);
  const plan = (await pool.query("insert into plan (id, \"productKey\", code, name, \"isTrial\", \"trialDurationDays\", \"updatedAt\") values ($1, $2, 'trial', 'Trial', true, 7, now()) returning id", [`plan_${randomBytes(8).toString("hex")}`, KEY])).rows[0].id;
  for (const [id, name, email] of [[bizId, NAME, "owner@e2e.example"], [peerId, PEER, "peer@e2e.example"]]) {
    await pool.query("insert into business (id, name, \"ownerName\", \"ownerEmail\", \"updatedAt\") values ($1, $2, 'Owner', $3, now())", [id, name, email]);
    await pool.query("insert into business_product (\"businessId\", \"productKey\") values ($1, $2)", [id, KEY]);
  }
  await pool.query("insert into subscription (id, \"businessId\", \"productKey\", \"planId\", status, \"trialEndsAt\", \"updatedAt\") values ($1, $2, $3, $4, 'TRIALING', now() + interval '3 days', now())", [`sub_${randomBytes(16).toString("hex")}`, bizId, KEY, plan]);
});
test.afterAll(async () => {
  await pool.query("delete from subscription where \"productKey\" = $1", [KEY]);
  await pool.query("delete from business where id in ($1, $2)", [bizId, peerId]);
  await pool.query("delete from plan where \"productKey\" = $1", [KEY]);
  await pool.query("delete from product where key = $1", [KEY]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("Businesses: full-width cards and list, filters, and a detail page with tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // The page uses the width it is given instead of stopping at a narrow column.
  const main = await page.locator("main").boundingBox();
  expect(main!.width).toBeGreaterThan(1300);

  await page.goto("/businesses?q=E2E+Biz");
  await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
  await expect(page.getByText(/Trial · \dd left/)).toBeVisible();
  await expect(page.getByRole("link", { name: PEER, exact: true })).toBeVisible();
  // The list is the default view; the card view is one click away and back.
  await expect(page.getByRole("columnheader", { name: "Plan" })).toBeVisible();
  await page.getByRole("link", { name: "Card view" }).click();
  await expect(page.getByRole("columnheader", { name: "Plan" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "List view" }).click();

  // Plan filter: only the one on trial.
  await page.getByLabel("Plan", { exact: true }).selectOption("trialing");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("link", { name: NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: PEER, exact: true })).toHaveCount(0);

  // List view shows the same business in a table with its columns.
  await page.getByRole("link", { name: "List view" }).click();
  await expect(page.getByRole("columnheader", { name: "Plan" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: NAME })).toHaveCount(1);

  // The 3-dot menu offers the details and an email link.
  await page.getByRole("button", { name: `Actions for ${NAME}` }).click();
  await expect(page.getByRole("menuitem", { name: "Email owner" })).toHaveAttribute("href", "mailto:owner@e2e.example");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: NAME, exact: true }).click();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Sections" });
  for (const tab of ["Subscription", "Usage", "Activity", "Messages", "Overview"]) {
    await tabs.getByRole("link", { name: new RegExp(`^${tab}`) }).click();
    await expect(tabs.getByRole("link", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-current", "page");
  }
});
