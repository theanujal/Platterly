import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupOnboardingTestUser } from "./db";

/** The sign-in system's code emails (approved Caterly layout): the code is read from the email body, not the subject. */
const CODE_SUBJECT = /Account Verification|Reset Your Platterly Password|Confirm Your New Platterly Email|Confirm Your Platterly Recovery Email|Sign-in Code/;


/**
 * A change made in the Platterly Account shows in Caterly (AJ, 2026-11-10: "like Zoho, a central account"). One real person is registered through Caterly's
 * central sign-in, edits their name and phone in the Account, the Platform's outbox is run once by hand (nothing schedules it locally), and Caterly's
 * read-only User Profile page shows the new details. Needs the Platform (CRON_SECRET_FILE holds the secret it was started with), the mail sink and PLATFORM_SSO_E2E=1.
 * It leaves permanent Platform audit rows (that table cannot have rows deleted), so it is run on purpose, never in a routine run.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1" || !process.env.CRON_SECRET_FILE, "needs the Platform, the mail sink and CRON_SECRET_FILE");

const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const ACCOUNT = "http://account.localhost:3300";
const AUTH = "http://auth.localhost:3300";
const PASSWORD = "correct horse 7";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const created: string[] = [];
test.afterEach(async () => {
  const emails = created.splice(0);
  for (const email of emails) await cleanupOnboardingTestUser(email);
  if (process.env.IDENTITY_DATABASE_URL && emails.length) {
    const identity = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 1 });
    await identity.query('delete from "user" where email = any($1)', [emails]).finally(() => identity.end());
  }
});
test.afterAll(async () => { await pool.end(); });

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
const runPlatformOutbox = async (page: Page) => {
  const res = await page.request.post(`${AUTH}/api/cron/outbox`, { headers: { authorization: `Bearer ${readFileSync(process.env.CRON_SECRET_FILE!, "utf8").trim()}` } });
  expect(res.status()).toBe(200);
  return (await res.json()) as unknown;
};

test("a name and phone changed in the Account show on Caterly's User Profile", async ({ page }) => {
  test.setTimeout(120_000);
  const to = `acct-caterly-${Date.now()}@auth.test`;
  created.push(to);

  // Register through Caterly's central sign-in, so the person starts in Caterly with a business (and the Platform learns of it).
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", "Sso");
  await fill(page, "Last name", "Person");
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

  // Caterly's page shows what was given at sign-up.
  await page.goto(`${CATERLY}/settings/account/user-profile`);
  await expect(page.getByText("Sso", { exact: true })).toBeVisible();

  // Caterly tells the Platform about the new business; run the Platform's outbox until the person has a seat.
  await expect.poll(async () => (await pool.query(`select count(*) from "platform_outbox" where status = 'SENT' and type = 'business.created' and payload->'owner'->>'subject' is not null`)).rows[0].count, { timeout: 30_000 }).not.toBe("0");

  // Edit in the Account.
  await page.goto(`${ACCOUNT}/profile`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("First name").fill("Asha");
  await page.getByLabel("Last name").fill("Rao Nair");
  await page.getByLabel("Phone").fill("+91 98000 00456");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your details were saved.")).toBeVisible();

  // Deliver by hand, then Caterly shows the same details.
  await runPlatformOutbox(page);
  await expect.poll(async () => (await pool.query('select "firstName", "lastName", phone from "user" where email = $1', [to])).rows[0], { timeout: 20_000 })
    .toEqual({ firstName: "Asha", lastName: "Rao Nair", phone: "+919800000456" });
  await page.goto(`${CATERLY}/settings/account/user-profile`);
  await expect(page.getByText("Asha", { exact: true })).toBeVisible();
  await expect(page.getByText("Rao Nair", { exact: true })).toBeVisible();
  await expect(page.getByText("+919800000456")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: /edit/i })).toHaveCount(0);
});
