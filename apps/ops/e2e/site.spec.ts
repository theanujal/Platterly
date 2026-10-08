import { createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-site-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const SLUG = `e2e-post-${randomBytes(3).toString("hex")}`;
const RELEASE = `e2e-release-${randomBytes(3).toString("hex")}`;
const root = path.join(__dirname, "..");

function envValue(name: string): string {
  if (process.env[name]) return process.env[name]!;
  return new RegExp(`^${name}="?([^"\\n]*)"?`, "m").exec(readFileSync(path.join(root, ".env"), "utf8"))?.[1] ?? "";
}
const pool = new pg.Pool({ connectionString: envValue("DATABASE_URL") });
let notice: { value: unknown } | undefined;
let changed: { value: unknown } | undefined;

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Site Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: envValue("DATABASE_URL") }, stdio: "pipe" });
  // The spec edits the live notice bar of the dev database, so it puts the original back afterwards.
  notice = (await pool.query("select value from site_setting where key = 'notice'")).rows[0];
  changed = (await pool.query("select value from site_setting where key = 'changed'")).rows[0];
});
test.afterAll(async () => {
  for (const [key, row] of [["notice", notice], ["changed", changed]] as const) {
    if (row) await pool.query("update site_setting set value = $2 where key = $1", [key, JSON.stringify(row.value)]);
    else await pool.query("delete from site_setting where key = $1", [key]);
  }
  await pool.query("delete from site_post where slug = $1", [SLUG]);
  await pool.query("delete from site_release where id = $1", [RELEASE]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("the content endpoint is closed to anyone without the signature", async ({ request }) => {
  const unsigned = await request.get("/api/site/content");
  expect([401, 404]).toContain(unsigned.status());
  const secret = envValue("SITE_SECRET");
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = { "x-platterly-timestamp": String(timestamp), "x-platterly-signature": `v1=${createHmac("sha256", secret).update(`${timestamp}.`).digest("hex")}`, "x-platterly-event-id": "e2e" };
    const ok = await request.get("/api/site/content", { headers });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).version).toBe(1);
  }
});

test("staff edit the notice bar, add an update and a post with categories, and see the unpublished-changes notice", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Website" }).first().click();
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();

  await page.getByRole("link", { name: "Notice bar" }).click();
  await page.getByLabel("Message").fill("");
  await page.getByLabel("Show the bar").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Add a message");
  await page.getByLabel("Message").fill("E2E notice text");
  await page.getByLabel("Link label").fill("Read more");
  await page.getByLabel("Link address").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("must start with");
  await page.getByLabel("Link address").fill("/catering/");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Saved");

  await page.getByRole("link", { name: "What's new" }).click();
  await page.locator("input[name=id]").first().fill(RELEASE);
  await expect(page.locator("input[name=id]").first()).toHaveValue(RELEASE);
  await page.getByLabel("Title").first().fill("E2E update");
  await page.getByLabel("Text").first().fill("Something shipped.");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Saved");
  await page.reload();
  await expect(page.getByText("E2E update")).toBeVisible();

  await page.getByRole("link", { name: "Blog" }).click();
  await page.getByRole("link", { name: "New post" }).click();
  await page.getByLabel("Address").fill(SLUG);
  await page.getByLabel("Title").fill("E2E post");
  await page.getByLabel("Summary").fill("A short summary.");
  await page.getByLabel("Categories").fill("E2E Cat, Kitchen");
  await page.getByLabel("Post text").fill("## Heading\n\nBody text.");
  await page.getByRole("button", { name: "Add post" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Saved");
  await page.goto("/site/posts");
  await expect(page.getByRole("link", { name: "E2E post" })).toBeVisible();
  await expect(page.getByLabel("Rename E2E Cat")).toBeVisible();

  await page.getByRole("link", { name: "Legal pages" }).click();
  await expect(page.getByRole("link", { name: "Terms of service" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Security" })).toBeVisible();

  await page.getByRole("link", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Unpublished changes")).toBeVisible();
  const configured = !!envValue("SITE_SECRET") && !!envValue("SITE_DEPLOY_HOOK_URL");
  if (!configured) {
    await expect(page.getByText("Publishing is not set up on this server yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish to the site" })).toBeDisabled();
  }
});
