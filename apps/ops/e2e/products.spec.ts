import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

/**
 * Staff manage the product cards on the Products page (AJ, 2026-11-15): Caterly's line and picture, Rivo shown and the other three kept hidden, and a new
 * upcoming product added with a built-in picture and a launch date, given an uploaded picture, switched to live and deleted. Needs the Ops dev server on 3200.
 */
const SUFFIX = randomBytes(4).toString("hex");
const EMAIL = `e2e-products-${SUFFIX}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const KEY = `e2eprod-${SUFFIX}`;
const NAME = `E2E Product ${SUFFIX}`;
const PICTURE = `e2e-card-${SUFFIX}.png`;
// A 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(__dirname, "../.env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl().replace(/\?.*$/, "") });

async function cleanData() {
  await pool.query("delete from upcoming_product where key like 'e2eprod-%'");
  const media = await pool.query("select name from site_media where \"originalName\" = $1", [PICTURE]);
  for (const row of media.rows) rmSync(path.join(process.env.SITE_MEDIA_DIR || path.join(__dirname, "..", ".data", "site-media"), row.name), { force: true });
  await pool.query("delete from site_media where \"originalName\" = $1", [PICTURE]);
  await pool.query("delete from audit_log where subject like 'e2eprod-%'");
}

test.beforeAll(async () => {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Staff", EMAIL], { cwd: path.join(__dirname, ".."), env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "ignore" });
  await cleanData();
});
test.afterAll(async () => {
  await cleanData();
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("the Products page: starting data, add an upcoming product, upload a picture, switch it to live, delete it", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Products" }).first().click();
  await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();

  // The starting data: Caterly has its line and picture; Rivo is shown; the other three are kept hidden.
  const caterly = page.locator("section", { has: page.getByRole("heading", { name: "Caterly", level: 3 }) });
  await expect(caterly.getByLabel("One line under the name")).toHaveValue("Catering business platform");
  await expect(caterly).toContainText("Shown on the Account");
  const rivo = page.locator("section", { has: page.getByRole("heading", { name: "Rivo", level: 3 }) });
  await expect(rivo).toContainText("Shown");
  for (const name of ["Opsly", "Insights", "Supply"]) await expect(page.locator("section", { has: page.getByRole("heading", { name, level: 3 }) })).toContainText("Hidden");

  // Add an upcoming product with a built-in picture and a launch date in India time.
  const add = page.locator("section", { has: page.getByRole("heading", { name: "Add an upcoming product" }) });
  await add.getByLabel("Key", { exact: true }).fill(KEY);
  await add.getByLabel("Name", { exact: true }).fill(NAME);
  await add.getByLabel("One line under the name").fill("A line staff wrote");
  await add.getByLabel("Launch date and time (India time)").fill("2099-03-04T09:30");
  await add.getByLabel("Picture choice").selectOption("builtin");
  await add.getByText("donut", { exact: true }).click();
  await add.getByRole("button", { name: "Add product" }).click();
  await expect(add.getByRole("status")).toHaveText("Added.");

  await page.reload();
  const mine = page.locator("section", { has: page.getByRole("heading", { name: NAME, level: 3 }) });
  await expect(mine).toContainText("Upcoming");
  await expect(mine.getByLabel("Launch date and time (India time)")).toHaveValue("2099-03-04T09:30");
  await expect(mine.getByLabel("Key", { exact: true })).toHaveValue(KEY);
  // Stored in UTC (read as text so this machine's time zone cannot skew it): 09:30 in India is 04:00 UTC.
  const stored = (await pool.query("select to_char(\"launchAt\", 'YYYY-MM-DD\"T\"HH24:MI') as at, \"cardImage\" from upcoming_product where key = $1", [KEY])).rows[0];
  expect(stored.at).toBe("2099-03-04T04:00");
  expect(stored.cardImage).toBe("builtin:donut");

  // Upload a picture instead: it lands in the library and the card now uses it.
  await mine.getByLabel("Picture choice").selectOption("upload");
  await mine.getByLabel("Picture file").setInputFiles({ name: PICTURE, mimeType: "image/png", buffer: PNG });
  await mine.getByRole("button", { name: "Save", exact: true }).click();
  await expect(mine.getByRole("status").first()).toHaveText("Saved.");
  const uploaded = (await pool.query("select \"cardImage\" from upcoming_product where key = $1", [KEY])).rows[0].cardImage as string;
  expect(uploaded).toMatch(/^upload:[0-9a-f]{8}-e2e-card-/);

  // An empty or unreadable choice is refused with a reason.
  await page.reload();
  const again = page.locator("section", { has: page.getByRole("heading", { name: NAME, level: 3 }) });
  await again.getByLabel("Picture choice").selectOption("upload");
  await again.getByRole("button", { name: "Save", exact: true }).click();
  await expect(again.getByRole("alert")).toContainText("Choose a picture to upload");

  // Switch it to live: the Upcoming switch off.
  await page.reload();
  const live = page.locator("section", { has: page.getByRole("heading", { name: NAME, level: 3 }) });
  await live.getByLabel(/Upcoming product/).uncheck();
  await live.getByRole("button", { name: "Save", exact: true }).click();
  await expect(live.getByRole("status").first()).toHaveText("Saved.");
  await page.reload();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: NAME, level: 3 }) })).toContainText("Live");

  // A picture a card uses cannot be deleted from the library.
  await page.goto("/site/media");
  await expect(page.getByText(`Product card: ${NAME}`).first()).toBeVisible();

  // Delete it.
  await page.goto("/products");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("section", { has: page.getByRole("heading", { name: NAME, level: 3 }) }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: NAME, level: 3 })).toHaveCount(0);
});
