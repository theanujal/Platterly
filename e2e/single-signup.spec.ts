import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupOnboardingTestUser, getTrialSubscriptionStatus } from "./db";

/**
 * Single sign-up (AJ, 2026-11-14; docs/single-signup-business-plan.md), with the Platform link ON. A person signs up from Caterly's link, verifies the email, signs in,
 * and arrives in Caterly's onboarding. The business was made by the ACCOUNT when the email was verified (named after the person until onboarding names it) with the
 * product attached and the person as its Admin; Caterly adopted it. Caterly never made a business of its own and never reported one (`business.created`).
 * Needs the Platform on a THROWAWAY database (PLATFORM_THROWAWAY_DATABASE_URL), Caterly with its link on (OPS_BILLING=0), the mail sink and PLATFORM_SSO_E2E=1.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1" || !process.env.PLATFORM_THROWAWAY_DATABASE_URL?.includes("throwaway") || !process.env.CRON_SECRET_FILE, "needs the Platform on a throwaway database, Caterly with its link on and the mail sink");

const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const PASSWORD = "correct horse 7";
const caterly = new Pool({ connectionString: process.env.DATABASE_URL });
const platform = new Pool({ connectionString: process.env.PLATFORM_THROWAWAY_DATABASE_URL });
const ops = process.env.OPS_THROWAWAY_DATABASE_URL?.includes("throwaway") ? new Pool({ connectionString: process.env.OPS_THROWAWAY_DATABASE_URL }) : null;
const emails: string[] = [];
const businesses: string[] = [];
test.afterEach(async () => {
  for (const email of emails.splice(0)) await cleanupOnboardingTestUser(email);
  // The business Caterly adopted is not removed with the person: take it (and its trial and queued messages) out too.
  for (const id of businesses.splice(0)) {
    await caterly.query(`delete from platform_outbox where "businessId" = $1`, [id]);
    await caterly.query(`delete from ops_outbox where "businessId" = $1`, [id]);
    await caterly.query(`delete from subscription where "organizationId" in (select id from organization where "businessId" = $1)`, [id]);
    await caterly.query(`delete from organization where "businessId" = $1`, [id]);
  }
});
test.afterAll(async () => {
  await caterly.end();
  await platform.end();
  await ops?.end();
});

async function fill(page: Page, label: string, value: string) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true } : undefined).fill(value);
}
async function code(page: Page, to: string) {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string; html: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && /Account Verification|Sign-in Code/.test(m.subject)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    if (mine) return mine.html.replace(/<[^>]*>/g, " ").match(/\b(\d{6})\b/)![1];
    await page.waitForTimeout(250);
  }
  throw new Error(`no code for ${to}`);
}

async function signUpAndVerify(page: Page, email: string) {
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", "Asha");
  await fill(page, "Last name", "Rao");
  await expect(page.getByLabel("Business phone number")).toBeVisible();
  await fill(page, "Business phone number", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(page, "Email", email);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // The email is not verified yet: nothing has been created on the Platform.
  expect((await platform.query(`select count(*) from users where email = $1`, [email])).rows[0].count).toBe("0");
  await fill(page, "Verification code", await code(page, email));
  // Verifying signs the person in and sends them back to Caterly: there is no second sign-in.
  await page.getByRole("button", { name: "Verify email" }).click();
}
const accountBusiness = (email: string) =>
  platform.query(
    `select o.id, o.name, op.product_key, m.central_role from users u join organisation_members m on m.user_id = u.id join organisations o on o.id = m.organisation_id join organisation_products op on op.organisation_id = o.id where u.email = $1`,
    [email],
  );

test("signing up from Caterly: the Account makes the business at verification and Caterly adopts it", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `ss-${Date.now()}@auth.test`;
  emails.push(email);
  await signUpAndVerify(page, email);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/, { timeout: 90_000 });

  // The Account made the person, their business (named after them), the product link and the Admin seat at verification.
  const made = await accountBusiness(email);
  expect(made.rows).toHaveLength(1);
  expect(made.rows[0]).toMatchObject({ name: "Asha Rao", product_key: "caterly", central_role: "admin" });
  const businessId = made.rows[0].id as string;
  businesses.push(businessId);

  // Caterly adopted that business: one business for this person, with the Platform's id, as its owner, on a trial. It made none of its own and reported none.
  const mine = await caterly.query(`select o."businessId", m.role from member m join "user" u on u.id = m."userId" join organization o on o.id = m."organizationId" where u.email = $1`, [email]);
  expect(mine.rows).toEqual([{ businessId, role: "owner" }]);
  // Caterly's own trial exists only when Ops does not own billing; with Ops billing on, the trial comes from Ops (the last test).
  if (process.env.OPS_BILLING !== "1") expect(await getTrialSubscriptionStatus(email)).toBe("TRIALING");
  expect((await caterly.query(`select count(*) from platform_outbox where "businessId" = $1 and type = 'business.created'`, [businessId])).rows[0].count).toBe("0");
  // The hand-over messages were delivered, the link first.
  const sent = await platform.query(`select event_type from outbox_events where organisation_id = $1 and status = 'delivered' order by sequence`, [businessId]);
  expect(sent.rows.map((r) => r.event_type)).toEqual(["organisation.link", "membership.changed"]);
});

test("if Caterly cannot be reached at verification the person waits on \"Setting up your account\", makes no business of their own, and moves on once the hand-over lands", async ({ page }) => {
  test.setTimeout(240_000);
  const email = `ss-${Date.now()}@auth.test`;
  emails.push(email);
  const goodUrl = (await platform.query(`select base_url from product_integrations where key = 'caterly'`)).rows[0].base_url as string;
  try {
    await platform.query(`update product_integrations set base_url = 'http://127.0.0.1:9' where key = 'caterly'`);
    await signUpAndVerify(page, email);
    // Verifying signs the person in and sends them to Caterly, which has no business for them yet: they wait.
    await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/setting-up/, { timeout: 60_000 });
    const made = await accountBusiness(email);
    expect(made.rows).toHaveLength(1);
    const businessId = made.rows[0].id as string;
    businesses.push(businessId);
    expect((await platform.query(`select count(*) from outbox_events where organisation_id = $1 and status = 'delivered'`, [businessId])).rows[0].count).toBe("0");
    await expect(page.getByRole("heading", { name: "Setting up your account" })).toBeVisible();
    expect((await caterly.query(`select count(*) from member m join "user" u on u.id = m."userId" where u.email = $1`, [email])).rows[0].count).toBe("0");

    // Caterly becomes reachable and the Platform's outbox runs: the waiting page joins the business and goes on to onboarding.
    await platform.query(`update product_integrations set base_url = $1 where key = 'caterly'`, [goodUrl]);
    await platform.query(`update outbox_events set next_attempt_at = now() where organisation_id = $1 and status = 'pending'`, [businessId]);
    const res = await page.request.post("http://auth.localhost:3300/api/cron/outbox", { headers: { authorization: `Bearer ${readFileSync(process.env.CRON_SECRET_FILE!, "utf8").trim()}` } });
    expect(res.status()).toBe(200);
    await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/, { timeout: 60_000 });
    const mine = await caterly.query(`select o."businessId", m.role from member m join "user" u on u.id = m."userId" join organization o on o.id = m."organizationId" where u.email = $1`, [email]);
    expect(mine.rows).toEqual([{ businessId, role: "owner" }]);
  } finally {
    await platform.query(`update product_integrations set base_url = $1 where key = 'caterly'`, [goodUrl]);
  }
});

test("with Ops billing on, the adopted business starts its trial in Ops and Caterly receives the plan", async ({ page }) => {
  test.skip(!ops || process.env.OPS_BILLING !== "1", "needs Ops on a throwaway database (OPS_THROWAWAY_DATABASE_URL) and Caterly started with Ops billing on");
  test.setTimeout(180_000);
  const email = `ss-${Date.now()}@auth.test`;
  emails.push(email);
  await signUpAndVerify(page, email);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/, { timeout: 90_000 });
  const businessId = (await accountBusiness(email)).rows[0].id as string;
  businesses.push(businessId);

  // Ops heard of the business (named after the person until onboarding names it), with the person as its owner, and started the trial.
  await expect
    .poll(async () => (await ops!.query(`select name, "ownerName", "ownerEmail" from business where id = $1`, [businessId])).rows[0] ?? null, { timeout: 60_000 })
    .toEqual({ name: "Asha Rao", ownerName: "Asha Rao", ownerEmail: email });
  await expect
    .poll(async () => (await ops!.query(`select status from subscription where "businessId" = $1 and "productKey" = 'catering' and "endDate" is null`, [businessId])).rows.map((r) => r.status), { timeout: 60_000 })
    .toEqual(["TRIALING"]);
  // Caterly got the plan Ops issued, and the person is not locked out: the dashboard opens (it would send them to /subscribe if the trial were missing).
  await expect
    .poll(async () => (await caterly.query(`select count(*) from ops_snapshot s join organization o on o.id = s."organizationId" where o."businessId" = $1`, [businessId])).rows[0].count, { timeout: 60_000 })
    .toBe("1");
  await page.goto(`${CATERLY}/dashboard`);
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  // Ops raised one "New business signed up" for this business, not two.
  expect((await ops!.query(`select count(*) from notification where "businessId" = $1 and kind = 'business.signed_up'`, [businessId])).rows[0].count).toBe("1");
  // Cleanup of Ops' side: the throwaway database is dropped afterwards.
});
