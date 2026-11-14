import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

/**
 * Staff manage coupons in Ops (plan slice C2, 2026-11-14): create a percent or fixed coupon, see it with its uses, get the plain reason when the form is wrong, pause
 * and resume it. Needs the Ops dev server on 3200.
 */
const EMAIL = `e2e-coupon-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const CODE = `E2E${randomBytes(3).toString("hex").toUpperCase()}`;
const FIXED = `E2F${randomBytes(3).toString("hex").toUpperCase()}`;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(__dirname, "../.env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl().replace(/\?.*$/, "") });

test.beforeAll(async () => {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Staff", EMAIL], { cwd: path.join(__dirname, ".."), env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
});
test.afterAll(async () => {
  await pool.query("delete from coupon where code = any($1)", [[CODE, FIXED]]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("staff create, list, pause and resume coupons, and the form says plainly what is wrong", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Coupons" }).first().click();
  await expect(page.getByRole("heading", { name: "Coupons", level: 1 })).toBeVisible();

  // A percentage outside 1 to 100 is refused with the plain reason, and nothing is saved.
  await page.getByLabel("Code").fill(CODE);
  await page.getByLabel("Type").selectOption("PERCENT");
  await page.getByLabel("Value").fill("150");
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "between 1 and 100" })).toBeVisible();
  expect((await pool.query("select count(*) from coupon where code = $1", [CODE])).rows[0].count).toBe("0");

  // A good one is saved in capitals and listed with 0 uses.
  await page.getByLabel("Code").fill(CODE.toLowerCase());
  await page.getByLabel("Value").fill("10");
  await page.getByLabel("Maximum uses").fill("5");
  await page.getByRole("button", { name: "Create coupon" }).click();
  const row = page.getByRole("row").filter({ hasText: CODE });
  await expect(row).toContainText("10%");
  await expect(row).toContainText("0 of 5");
  await expect(row).toContainText("Active");

  // A fixed coupon shows rupees; a duplicate code is refused.
  await page.getByLabel("Code").fill(FIXED);
  await page.getByLabel("Type").selectOption("FIXED");
  await page.getByLabel("Value").fill("2000");
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByRole("row").filter({ hasText: FIXED })).toContainText("₹2,000");
  await page.getByLabel("Code").fill(FIXED);
  await page.getByLabel("Value").fill("100");
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();

  // Pause, then resume.
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(row).toContainText("Paused");
  expect((await pool.query("select active from coupon where code = $1", [CODE])).rows[0].active).toBe(false);
  await row.getByRole("button", { name: "Resume" }).click();
  await expect(row).toContainText("Active");
});
