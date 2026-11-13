import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupInviteeUser, cleanupOnboardingTestUser } from "./db";
import { expectNoAccessPage } from "./auth-helpers";

/**
 * The Admin transfer seen from Caterly (AJ, 2026-11-13), with the Platform link ON: the Admin starts from the Team Management card, invites a brand-new
 * person in the Account, who accepts; the Platform's outbox is run by hand. The old Admin stays Admin until the new one first opens Caterly; then the old
 * one is an Old Admin (sees, changes nothing, no Settings) and the new Admin can remove them.
 * Needs the Platform (CRON_SECRET_FILE holds the secret it was started with), Caterly with its link on, the mail sink and PLATFORM_SSO_E2E=1.
 * It writes permanent Platform audit rows, so run it only against a throwaway Platform database.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1" || !process.env.CRON_SECRET_FILE, "needs the Platform, the mail sink and CRON_SECRET_FILE");

const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const ACCOUNT = "http://account.localhost:3300";
const AUTH = "http://auth.localhost:3300";
const PASSWORD = "correct horse 7";
const CODE_SUBJECT = /Account Verification|Sign-in Code/;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const created: { admin: string; nominee: string }[] = [];
test.afterEach(async () => {
  for (const { admin, nominee } of created.splice(0)) {
    await cleanupInviteeUser(nominee);
    await cleanupOnboardingTestUser(admin);
  }
});
test.afterAll(async () => {
  await pool.end();
});

async function fill(page: Page, label: string, value: string) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true } : undefined).fill(value);
}
async function mailTo(page: Page, to: string, subject: RegExp) {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string; html: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && subject.test(m.subject)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    if (mine) return mine.html;
    await page.waitForTimeout(250);
  }
  throw new Error(`no mail for ${to}`);
}
const codeFor = async (page: Page, to: string) => (await mailTo(page, to, CODE_SUBJECT)).replace(/<[^>]*>/g, " ").match(/\b(\d{6})\b/)![1];
const runPlatformOutbox = async (page: Page) => {
  const res = await page.request.post(`${AUTH}/api/cron/outbox`, { headers: { authorization: `Bearer ${readFileSync(process.env.CRON_SECRET_FILE!, "utf8").trim()}` } });
  expect(res.status()).toBe(200);
};
const roleOf = async (email: string) => (await pool.query('select m.role from member m join "user" u on u.id = m."userId" where u.email = $1', [email])).rows[0]?.role ?? null;

async function signUpFromCaterly(page: Page, to: string) {
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", "Asha");
  await fill(page, "Last name", "Rao");
  await fill(page, "Phone", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await fill(page, "Verification code", await codeFor(page, to));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Your email is verified. You can sign in now.")).toBeVisible();
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: /^Sign in( to your account)?$/ }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
}

test("Admin transfer in Caterly: the old Admin stays Admin until the new Admin arrives, then becomes an Old Admin who the new Admin can remove", async ({ browser }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const adminEmail = `at-admin-${stamp}@auth.test`;
  const nomineeEmail = `at-new-${stamp}@auth.test`;
  created.push({ admin: adminEmail, nominee: nomineeEmail });

  // The Admin starts a business in Caterly; the Platform learns of it and gives them the Admin seat.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signUpFromCaterly(admin, adminEmail);
  await expect.poll(async () => (await pool.query(`select count(*) from "platform_outbox" where status = 'SENT' and type = 'business.created'`)).rows[0].count, { timeout: 30_000 }).not.toBe("0");
  expect(await roleOf(adminEmail)).toBe("owner");

  // The Team Management card sends the Admin to the Account's Admin role page.
  await admin.goto(`${CATERLY}/settings/team`);
  await expect(admin.getByText("Business Admin: Asha Rao")).toBeVisible();
  await admin.getByRole("link", { name: "Transfer admin role" }).click();
  await expect(admin).toHaveURL(/account\.localhost:3300\/admin-role/);
  await expect(admin.getByText("You are the Business Admin", { exact: true })).toBeVisible();
  await admin.getByLabel("Email of the new Business Admin").fill(nomineeEmail);
  await admin.getByLabel("Current password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Send invitation" }).click();
  await expect(admin.getByText("Invitation sent.")).toBeVisible();

  // The new person creates an account from the invitation and accepts.
  const link = (await mailTo(admin, nomineeEmail, /invited you to be the Business Admin/)).match(/href="([^"]*admin-transfer\?invite=[^"]+)"/)![1].replace(/&amp;/g, "&");
  const nomCtx = await browser.newContext();
  const nom = await nomCtx.newPage();
  await nom.goto(link);
  await nom.getByRole("link", { name: "Create an account" }).click();
  await fill(nom, "First name", "New");
  await fill(nom, "Last name", "Admin");
  await fill(nom, "Phone", "9800000456");
  await fill(nom, "Confirm password", PASSWORD);
  await nom.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(nom, "Email", nomineeEmail);
  await fill(nom, "Password", PASSWORD);
  await nom.getByRole("button", { name: "Create account" }).click();
  await fill(nom, "Verification code", await codeFor(nom, nomineeEmail));
  await nom.getByRole("button", { name: "Verify email" }).click();
  await fill(nom, "Password", PASSWORD);
  await nom.getByRole("button", { name: "Sign in" }).click();
  await expect(nom.getByRole("heading", { name: "You are signed in" })).toBeVisible();
  await nom.getByRole("link", { name: "Go to my Account" }).click();
  await nom.getByRole("button", { name: "Accept and become the Business Admin" }).click();
  await expect(nom.getByRole("status").filter({ hasText: /Business Admin/ }).first()).toBeVisible();

  // Deliver the two membership events. The new Admin has no Caterly user yet, so the old Admin keeps the Admin seat.
  await runPlatformOutbox(admin);
  await expect.poll(async () => (await pool.query(`select count(*) from platform_pending_member where role = 'owner'`)).rows[0].count, { timeout: 20_000 }).not.toBe("0");
  expect(await roleOf(adminEmail)).toBe("owner");
  expect(Number((await pool.query(`select count(*) from platform_pending_member where role = 'oldAdmin'`)).rows[0].count)).toBeGreaterThan(0);
  await admin.goto(`${CATERLY}/settings/team`);
  await expect(admin.getByRole("heading", { name: "Team Management" })).toBeVisible();

  // The new Admin opens Caterly for the first time: they join as Admin, with no business of their own, and the old Admin steps down.
  await nom.goto(`${CATERLY}/`);
  await expect(nom).toHaveURL(/catering\.localhost:3000\/(dashboard|orders|kitchenlogin\/onboarding)/);
  await expect.poll(() => roleOf(nomineeEmail), { timeout: 20_000 }).toBe("owner");
  expect(await roleOf(adminEmail)).toBe("oldAdmin");
  expect(Number((await pool.query(`select count(distinct "organizationId") from member m join "user" u on u.id = m."userId" where u.email = $1`, [nomineeEmail])).rows[0].count)).toBe(1);

  // The Old Admin sees the business but not Settings, and the sidebar plan cards are gone.
  await admin.goto(`${CATERLY}/settings/team`);
  await expectNoAccessPage(admin);
  await admin.goto(`${CATERLY}/orders`);
  await expect(admin.getByRole("heading", { name: "You don't have access to this page" })).toHaveCount(0);

  // The new Admin sees the Old Admin with only Remove, and removes them.
  await nom.goto(`${CATERLY}/settings/team`);
  await expect(nom.getByText("Business Admin: New Admin")).toBeVisible();
  const row = nom.getByRole("listitem").filter({ hasText: adminEmail });
  await expect(row.getByText("Old Admin", { exact: true })).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveCount(0);
  await row.getByRole("button", { name: /^Remove / }).click();
  await nom.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => roleOf(adminEmail), { timeout: 20_000 }).toBeNull();

  await adminCtx.close();
  await nomCtx.close();
});
