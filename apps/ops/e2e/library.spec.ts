import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-lib-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const KEY = `e2el${randomBytes(3).toString("hex")}`;
const DISH = `E2E Bhel Platter ${randomBytes(2).toString("hex")}`;
const SPICE = `E2E Rare Spice ${randomBytes(2).toString("hex")}`;
const root = path.join(__dirname, "..");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(root, ".env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl() });

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Library Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
  // The product is unreachable on purpose: the happy path (a signed answer from a real product) is covered by the module tests.
  await pool.query("insert into product (key, name, status, \"baseUrl\", \"outboundSecret\", \"inboundSecret\", \"updatedAt\") values ($1, $2, 'ACTIVE', 'http://127.0.0.1:1', 'x', 'x', now())", [KEY, `E2E Library Product ${KEY}`]);
  await pool.query("insert into library_candidate (id, \"productKey\", \"remoteId\", kind, name, \"categoryName\", \"foodType\", \"kitchenCount\", \"suggestedMatchId\", \"suggestedMatchName\", \"updatedAt\") values ($1, $2, 'r1', 'FOOD_ITEM', $3, 'Starters', 'VEGETARIAN', 4, 'lib-1', 'Bhel Puri', now())", [`lc_${randomBytes(8).toString("hex")}`, KEY, DISH]);
  await pool.query("insert into library_candidate (id, \"productKey\", \"remoteId\", kind, name, \"categoryName\", unit, \"kitchenCount\", \"updatedAt\") values ($1, $2, 'r2', 'INGREDIENT', $3, 'Spices & Masalas', 'g', 2, now())", [`lc_${randomBytes(8).toString("hex")}`, KEY, SPICE]);
});
test.afterAll(async () => {
  await pool.query("delete from notification where \"productKey\" = $1", [KEY]);
  await pool.query("delete from product where key = $1", [KEY]); // candidates cascade
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("Library review: candidates by kind with their count and hint, fields to correct, and a refused send keeps the item pending", async ({ page, context }) => {
  await context.addCookies([{ name: "ops_product", value: KEY, url: "http://ops.localhost:3200" }]);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Library review" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Library review" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Dishes/ })).toContainText("1");
  await expect(page.getByRole("tab", { name: /Ingredients/ })).toContainText("1");

  // The dish: 4 kitchens, "looks like" hint, editable fields prefilled, a merge button for the suggestion.
  const card = page.getByTestId("library-candidate").filter({ has: page.locator(`input[name="name"][value="${DISH}"]`) });
  await expect(card).toContainText("4 kitchens");
  await expect(card).toContainText("Looks like: Bhel Puri");
  await expect(card.getByLabel("Name")).toHaveValue(DISH);
  await expect(card.getByLabel("Category")).toHaveValue("Starters");
  await expect(card.getByLabel("Veg / Non-Veg")).toHaveValue("VEGETARIAN");
  await expect(card.getByRole("button", { name: "Merge into “Bhel Puri”" })).toBeVisible();

  // Nothing is recorded when the product refuses (here its fake signing secret cannot be read): the reason shows and the item stays.
  await card.getByLabel("Name").fill(`${DISH} (Edited)`);
  await card.getByRole("button", { name: "Approve as new" }).click();
  await expect(card.getByRole("alert")).toContainText("signing secret could not be read");
  await expect(card.getByLabel("Name")).toHaveValue(`${DISH} (Edited)`); // what was typed is kept
  const rows = await pool.query("select status from library_candidate where \"productKey\" = $1 and name = $2", [KEY, DISH]);
  expect(rows.rows[0].status).toBe("PENDING");

  // The ingredient tab has a unit and a fixed list of categories, and no Veg / Non-Veg.
  await page.getByRole("tab", { name: /Ingredients/ }).click();
  const spice = page.getByTestId("library-candidate").filter({ has: page.locator(`input[name="name"][value="${SPICE}"]`) });
  await expect(spice.getByLabel("Unit")).toHaveValue("g");
  await expect(spice.getByLabel("Category")).toHaveValue("Spices & Masalas");
  await expect(spice.getByLabel("Veg / Non-Veg")).toHaveCount(0);
  await expect(spice.getByRole("button", { name: /Merge into/ })).toHaveCount(0);
});
