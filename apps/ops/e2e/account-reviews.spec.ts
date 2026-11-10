import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

// Staff see the account reviews the Platform opened (an email change cancelled by the old address), and release the hold once they have verified the person.
const EMAIL = `e2e-review-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const root = path.join(__dirname, "..");
const OLD = `old-${randomBytes(3).toString("hex")}@auth.test`;
const REVIEW_ID = `chg-e2e-${randomBytes(4).toString("hex")}`;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(root, ".env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl() });

test.beforeAll(async () => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Review Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
  await pool.query(`insert into account_review (id, "reviewId", subject, "oldEmail", "newEmail", reason, note, "requestedAt", status) values ($1, $2, 'sub-e2e', $3, 'new@auth.test', 'not_me', 'I never asked for this', now(), 'OPEN')`, [`ar_${randomBytes(6).toString("hex")}`, REVIEW_ID, OLD]);
});
test.afterAll(async () => {
  await pool.query("delete from account_review where \"reviewId\" = $1", [REVIEW_ID]);
  await pool.query("delete from audit_log where action = 'account_review.cleared' and detail is null and subject not in (select id from account_review)").catch(() => undefined);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("staff see the review with its reason and release the hold once they have verified the person", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Account reviews" }).first().click();
  await expect(page.getByRole("heading", { name: "Account reviews" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: OLD });
  await expect(row).toContainText("new@auth.test");
  await expect(row).toContainText("Says it was not them");
  await expect(row).toContainText("I never asked for this");
  await expect(row.getByText("On hold")).toBeVisible();

  await row.getByRole("button", { name: "Verified: release the hold" }).click();
  await expect(row.getByText("Verified", { exact: true })).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  expect((await pool.query('select status from account_review where "reviewId" = $1', [REVIEW_ID])).rows[0].status).toBe("CLEARED");
});
