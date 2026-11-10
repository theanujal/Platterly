import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

// Staff write a newsletter issue, ask for a test, schedule it, take it back and delete it.
const EMAIL = `e2e-news-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const SUBJECT = `E2E issue ${randomBytes(3).toString("hex")}`;
const root = path.join(__dirname, "..");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(root, ".env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl() });

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Newsletter Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
});
test.afterAll(async () => {
  await pool.query(`delete from audit_log where action like 'newsletter.%' and subject in (select id from newsletter_issue where subject = $1)`, [SUBJECT]).catch(() => undefined);
  await pool.query("delete from newsletter_issue where subject = $1 or (subject = '' and body = '' and status = 'DRAFT')", [SUBJECT]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("staff write an issue, ask for a test, schedule it, take it back to a draft and delete it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Newsletter" }).first().click();
  await expect(page.getByRole("heading", { name: "Newsletter" })).toBeVisible();
  await page.getByRole("button", { name: "New issue" }).click();
  await expect(page).toHaveURL(/\/newsletter\/.+/);

  // Writing: the subject, and the text in the editor, then Save.
  await page.getByLabel("Subject").fill(SUBJECT);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("Hello from the team.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // A test is asked for: it goes out the next time the Platform checks in.
  await page.getByRole("button", { name: "Send test to me" }).click();
  await expect(page.getByRole("status").filter({ hasText: "A test email goes to" })).toBeVisible();
  const asked = await pool.query("select \"testTo\" from newsletter_issue where subject = $1", [SUBJECT]);
  expect(asked.rows[0].testTo).toBe(EMAIL.toLowerCase());

  // Scheduling needs a time that has not passed.
  await page.getByLabel("Send at").fill("2020-01-01T09:00");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not passed" })).toBeVisible();
  const tomorrow = new Date(Date.now() + 26 * 3_600_000 + 5.5 * 3_600_000).toISOString().slice(0, 16);
  await page.getByLabel("Send at").fill(tomorrow);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Scheduled." })).toBeVisible();

  await page.goto("/newsletter");
  await expect(page.getByRole("link", { name: SUBJECT })).toBeVisible();
  await expect(page.getByText("Scheduled", { exact: true }).first()).toBeVisible();

  // Back to a draft, then delete it.
  await page.getByRole("link", { name: SUBJECT }).click();
  await page.getByRole("button", { name: "Back to draft" }).click();
  await expect(page.getByRole("button", { name: "Delete draft" })).toBeVisible();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page.getByRole("heading", { name: "Newsletter" })).toBeVisible();
  await expect(page.getByRole("link", { name: SUBJECT })).toHaveCount(0);
});
