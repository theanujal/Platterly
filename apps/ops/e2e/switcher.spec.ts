import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-switch-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const A = `e2esa${randomBytes(2).toString("hex")}`;
const B = `e2esb${randomBytes(2).toString("hex")}`;
const NAME_A = `Switch Alpha ${A}`;
const NAME_B = `Switch Beta ${B}`;
const BIZ_A = `E2E Alpha Biz ${randomBytes(2).toString("hex")}`;
const BIZ_B = `E2E Beta Biz ${randomBytes(2).toString("hex")}`;
const root = path.join(__dirname, "..");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(root, ".env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl() });

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Switch Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
  for (const [key, name] of [[A, NAME_A], [B, NAME_B]]) {
    await pool.query("insert into product (key, name, status, \"baseUrl\", \"outboundSecret\", \"inboundSecret\", \"updatedAt\") values ($1, $2, 'ACTIVE', 'http://127.0.0.1:1', 'x', 'x', now())", [key, name]);
  }
  for (const [biz, key] of [[BIZ_A, A], [BIZ_B, B]]) {
    const id = `biz_${randomBytes(16).toString("hex")}`;
    await pool.query("insert into business (id, name, status, \"updatedAt\") values ($1, $2, 'ACTIVE', now())", [id, biz]);
    await pool.query("insert into business_product (\"businessId\", \"productKey\") values ($1, $2)", [id, key]);
  }
});
test.afterAll(async () => {
  await pool.query("delete from business where name in ($1, $2)", [BIZ_A, BIZ_B]);
  await pool.query("delete from product where key in ($1, $2)", [A, B]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("the sidebar switcher scopes Businesses to one product, offers All products, and remembers the choice", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  const switcher = page.getByRole("button", { name: /^Product: .*Change product$/ }).first();
  await expect(switcher).toContainText("All products");

  await page.goto("/businesses?q=E2E");
  await expect(page.getByText(BIZ_A)).toBeVisible();
  await expect(page.getByText(BIZ_B)).toBeVisible();

  await switcher.click();
  await expect(page.getByRole("option", { name: NAME_A })).toBeVisible();
  await expect(page.getByRole("option", { name: NAME_B })).toBeVisible();
  await page.getByRole("option", { name: NAME_A }).click();
  await expect(switcher).toContainText(NAME_A);
  await expect(page.getByText(BIZ_A)).toBeVisible();
  await expect(page.getByText(BIZ_B)).toHaveCount(0);

  // The choice sticks across pages and a reload, and the page heading says which product it is about.
  await page.goto("/");
  await expect(page.getByText(`${NAME_A}: how it is doing`)).toBeVisible();
  await page.reload();
  await expect(switcher).toContainText(NAME_A);

  await switcher.click();
  await page.getByRole("option", { name: "All products" }).click();
  await expect(switcher).toContainText("All products");
  await page.goto("/businesses?q=E2E");
  await expect(page.getByText(BIZ_B)).toBeVisible();
});
