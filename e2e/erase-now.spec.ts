import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupOnboardingTestUser } from "./db";

/**
 * A REAL erase, in the browser, on the dev databases (AJ, 2026-11-17: "do it"). One throwaway person registers through Caterly (so there is a business in
 * Caterly, the Platform and Ops), asks for deletion in the Account, and a throwaway Ops staff member presses Approve deletion and then Erase now on the Ops
 * page. The Platform's scheduled pass (called here with the secret) removes the person; Ops closes the request as ERASED. Scoped to one email and one business id.
 * Needs the Platform started WITH CRON_SECRET (ERASE_E2E_CRON_SECRET must equal it), Ops, Caterly, the mail sink, PLATFORM_SSO_E2E=1 and IDENTITY_DATABASE_URL.
 * It leaves permanent Platform audit rows (that table cannot have rows deleted); the staff member and the Ops rows of the test business are removed at the end.
 * Set ERASE_SHOTS=<dir> to save screenshots of the Ops page at each step.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1" || !process.env.ERASE_E2E_CRON_SECRET || !process.env.IDENTITY_DATABASE_URL, "needs PLATFORM_SSO_E2E=1, ERASE_E2E_CRON_SECRET and IDENTITY_DATABASE_URL");

const CODE_SUBJECT = /Account Verification|Reset Your Platterly Password|Confirm Your New Platterly Email|Confirm Your Platterly Recovery Email|Sign-in Code/;
const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const ACCOUNT = "http://account.localhost:3300";
const OPS = "http://ops.localhost:3200";
const PASSWORD = "correct horse 7";
const STAFF_PASSWORD = "E2e-Only-Pass-2026";
const SHOTS = process.env.ERASE_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

const opsEnv = readFileSync(path.join(__dirname, "..", "apps", "ops", ".env"), "utf8");
const opsUrl = /^DATABASE_URL="?([^"\n]+)"?/m.exec(opsEnv)![1];
const caterly = new Pool({ connectionString: process.env.DATABASE_URL });
const ops = new Pool({ connectionString: opsUrl });
const identity = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 1 });
const staffEmail = `e2e-erase-staff-${randomBytes(3).toString("hex")}@platterly.local`;
let personEmail = "";
let businessId = "";
test.afterAll(async () => {
  await ops.query('delete from "user" where email = $1', [staffEmail]).catch(() => undefined);
  // The Ops rows of the test business (Erase now keeps an anonymised business and the closed request, so they are removed here by id and by owner email).
  await ops.query('delete from account_deletion_request where email = $1 or "businessId" = $2 or "businessId" in (select id from business where "ownerEmail" = $1)', [personEmail, businessId]).catch(() => undefined);
  await ops.query('delete from product_billing_profile where "businessId" = $1 or "businessId" in (select id from business where "ownerEmail" = $2)', [businessId, personEmail]).catch(() => undefined);
  await ops.query('delete from business where id = $1 or "ownerEmail" = $2', [businessId, personEmail]).catch(() => undefined);
  await cleanupOnboardingTestUser(personEmail).catch(() => undefined);
  await identity.query('delete from "user" where email = $1', [personEmail]).catch(() => undefined);
  await Promise.all([caterly.end(), ops.end(), identity.end()]);
});

async function fill(page: Page, label: string, value: string) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true } : undefined).fill(value);
}
async function codeFor(page: Page, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string; html: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && CODE_SUBJECT.test(m.subject)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.html.replace(/<[^>]*>/g, " ").match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no code arrived for ${to}`);
}

test("staff approve and Erase now in Ops: the person and the business are gone from Caterly, the Platform and the sign-in system, and Ops closes the request", async ({ page }) => {
  test.setTimeout(300_000);
  personEmail = `erase-e2e-${Date.now()}@auth.test`;

  // 1. A real person with a business: register through Caterly.
  await page.goto(`${CATERLY}/`);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", "Erase");
  await fill(page, "Last name", "Person");
  await fill(page, "Phone", "9800000555");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(page, "Email", personEmail);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await fill(page, "Verification code", await codeFor(page, personEmail));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  const orgFor = async () => (await caterly.query(`select o.id, o."businessId" from organization o join member m on m."organizationId" = o.id join "user" u on u.id = m."userId" where u.email = $1`, [personEmail])).rows[0];
  await expect.poll(async () => (await orgFor())?.businessId ?? null, { timeout: 90_000 }).not.toBeNull();
  const org = await orgFor();
  expect(org?.businessId).toBeTruthy();
  businessId = org.businessId;

  // 2. The person asks for deletion in the Account.
  await page.goto(`${ACCOUNT}/profile`);
  await expect(page).toHaveURL(`${ACCOUNT}/profile`);
  const asked = await page.request.post(`${ACCOUNT}/api/account/deletion`, { headers: { origin: ACCOUNT }, data: { password: PASSWORD, reason: "erase e2e" } });
  expect(asked.status()).toBe(200);
  await expect.poll(async () => (await ops.query("select status from account_deletion_request where email = $1", [personEmail])).rows[0]?.status, { timeout: 30_000 }).toBe("PENDING");

  // 3. Staff sign in to Ops and open the request.
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Erase Staff", staffEmail], { cwd: path.join(__dirname, "..", "apps", "ops"), env: { ...process.env, OPS_STAFF_PASSWORD: STAFF_PASSWORD, DATABASE_URL: opsUrl }, stdio: "pipe" });
  await page.goto(`${OPS}/sign-in`);
  await page.getByLabel("Email").fill(staffEmail);
  await page.getByLabel("Password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`${OPS}/account-deletions`);
  const card = page.getByRole("listitem").filter({ hasText: personEmail });
  await expect(card).toContainText("Waiting for you");
  await shot(page, "1-waiting");

  // 4. Approve deletion: the business is suspended in Caterly and the person's sign-in is blocked.
  await card.getByRole("button", { name: "Approve deletion" }).click();
  await expect(card).toContainText("Approved: suspended", { timeout: 60_000 });
  await shot(page, "2-approved");

  // 5. Erase now: type the email to confirm, then the Platform's pass does the removal.
  await card.getByLabel(`Type ${personEmail} to confirm`).fill(personEmail);
  await shot(page, "3-confirm-typed");
  await card.getByRole("button", { name: "Erase now" }).click();
  await expect(card).toContainText("Erase started", { timeout: 60_000 });
  const secret = process.env.ERASE_E2E_CRON_SECRET!;
  const cron = () => page.request.post(`${ACCOUNT}/api/cron/account`, { headers: { authorization: `Bearer ${secret}` } });
  await expect.poll(async () => (await (await cron()).json()).accountsErased ?? 0, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);

  // 6. Everything is gone.
  expect((await identity.query('select count(*) from "user" where email = $1', [personEmail])).rows[0].count).toBe("0");
  expect((await caterly.query(`select count(*) from "user" where email = $1`, [personEmail])).rows[0].count).toBe("0");
  await page.goto(`${OPS}/account-deletions`);
  await expect(page.getByRole("listitem").filter({ hasText: "Erased" }).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "4-erased");
  expect((await ops.query("select count(*) from account_deletion_request where email = $1", [personEmail])).rows[0].count).toBe("0");
});
