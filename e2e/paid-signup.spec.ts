import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupOnboardingTestUser } from "./db";

/**
 * Sign-up with a paid plan (AJ, 2026-11-14; docs/paid-plan-signup-plan.md, revision 3). Sign up from Caterly's pricing link for a yearly plan, verify the email, land in the
 * Store with that plan chosen, pay in Razorpay's TEST checkout, continue to Caterly. Nothing is made in the product, and no trial anywhere, until the payment succeeds. A
 * person who never pays is cleared away (details kept on Ops's Abandoned orders) and the email can sign up again.
 * Needs the Platform, identity and Ops on THROWAWAY databases, Caterly started with Ops billing on, the mail sink, internet access to Razorpay's test checkout, and
 * PLATFORM_SSO_E2E=1, CRON_SECRET_FILE, PLATFORM_THROWAWAY_DATABASE_URL, IDENTITY_DATABASE_URL, OPS_THROWAWAY_DATABASE_URL (each containing "throwaway").
 */
test.skip(
  process.env.PLATFORM_SSO_E2E !== "1" || process.env.OPS_BILLING === "0" || !process.env.CRON_SECRET_FILE || ![process.env.PLATFORM_THROWAWAY_DATABASE_URL, process.env.IDENTITY_DATABASE_URL, process.env.OPS_THROWAWAY_DATABASE_URL].every((u) => u?.includes("throwaway")),
  "needs throwaway Platform, identity and Ops databases, Caterly with Ops billing on, the mail sink and internet access to Razorpay's test checkout",
);

const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const AUTH = "http://auth.localhost:3300";
const PASSWORD = "correct horse 7";
const caterly = new Pool({ connectionString: process.env.DATABASE_URL });
const platform = new Pool({ connectionString: process.env.PLATFORM_THROWAWAY_DATABASE_URL });
const identity = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL });
const ops = new Pool({ connectionString: process.env.OPS_THROWAWAY_DATABASE_URL });
const emails: string[] = [];
const businesses: string[] = [];
test.afterEach(async () => {
  for (const email of emails.splice(0)) await cleanupOnboardingTestUser(email);
  for (const id of businesses.splice(0)) {
    await caterly.query(`delete from platform_outbox where "businessId" = $1`, [id]);
    await caterly.query(`delete from ops_outbox where "businessId" = $1`, [id]);
    await caterly.query(`delete from subscription where "organizationId" in (select id from organization where "businessId" = $1)`, [id]);
    await caterly.query(`delete from organization where "businessId" = $1`, [id]);
  }
});
test.afterAll(async () => {
  await Promise.all([caterly.end(), platform.end(), identity.end(), ops.end()]);
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
const cron = (page: Page) => page.request.post(`${AUTH}/api/cron/paid-signups`, { headers: { authorization: `Bearer ${readFileSync(process.env.CRON_SECRET_FILE!, "utf8").trim()}` } });

/** The pricing button of Caterly's marketing page for the yearly Premium plan: it goes to Caterly's start, which carries the plan to the central sign-in. */
async function startPaidSignUp(page: Page, email: string) {
  await page.goto(`${CATERLY}/api/platform/sso/start?plan=premium&interval=ANNUAL`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", "Asha");
  await fill(page, "Last name", "Rao");
  await fill(page, "Business phone number", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(page, "Email", email);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}
async function verify(page: Page, email: string) {
  await fill(page, "Verification code", await code(page, email));
  await page.getByRole("button", { name: "Verify email" }).click();
}
const pendingRow = async (email: string) =>
  (await identity.query(`select s."status", s."planCode", s."interval", s."reservedBusinessId" from "signupProduct" s join "user" u on u.id = s."userId" where u."email" = $1`, [email])).rows[0] ?? null;

/** Pays in Razorpay's test checkout with the plain test card and answers the demo bank page. */
async function payInRazorpay(page: Page) {
  const bank = page.context().waitForEvent("page", { timeout: 60_000 });
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  const frame = page.frameLocator("iframe.razorpay-checkout-frame");
  const mobile = frame.getByPlaceholder("Mobile number");
  if (await mobile.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false)) await mobile.pressSequentially("9845671203", { delay: 60 });
  await frame.getByText("Cards", { exact: true }).first().click();
  await frame.getByText("Add a new card").click();
  await frame.locator('input[name="card.number"]').pressSequentially("4111111111111111", { delay: 40 });
  await frame.locator('input[name="card.expiry"]').pressSequentially("1230", { delay: 40 });
  await frame.locator('input[name="card.cvv"]').pressSequentially("123", { delay: 40 });
  await frame.getByPlaceholder("Enter Email").fill("buyer@auth.test");
  await frame.getByRole("button", { name: "Continue", exact: true }).click();
  await frame.getByText("Maybe later", { exact: true }).locator("visible=true").first().click({ timeout: 8000 }).catch(() => {});
  await (await bank).getByRole("button", { name: "Success" }).click();
  await frame.getByText("Maybe later", { exact: true }).locator("visible=true").first().click({ timeout: 10_000, force: true }).catch(() => {});
}

test("a paid yearly sign-up: nothing exists in the product or Ops before payment, no trial ever, and after paying the person lands in Caterly with the plan", async ({ page }) => {
  test.setTimeout(300_000);
  const email = `ps-${Date.now()}@auth.test`;
  emails.push(email);
  await startPaidSignUp(page, email);
  await verify(page, email);

  // The Store opens with the plan already chosen.
  await expect(page).toHaveURL(/store\.localhost:3300\/manage\/caterly\?plan=premium&interval=ANNUAL/, { timeout: 60_000 });
  await expect(page.getByLabel("Business name")).toBeVisible({ timeout: 60_000 });
  const row = await pendingRow(email);
  expect(row).toMatchObject({ status: "pending_payment", planCode: "premium", interval: "ANNUAL" });
  const businessId = row.reservedBusinessId as string;
  businesses.push(businessId);

  // Before paying: no Platform business, no product account, Ops knows the business with NO plan and NO trial.
  expect((await platform.query(`select count(*) from organisations where id = $1`, [businessId])).rows[0].count).toBe("0");
  expect((await caterly.query(`select count(*) from organization where "businessId" = $1`, [businessId])).rows[0].count).toBe("0");
  await expect.poll(async () => (await ops.query(`select count(*) from business where id = $1`, [businessId])).rows[0].count, { timeout: 30_000 }).toBe("1");
  expect((await ops.query(`select count(*) from subscription where "businessId" = $1`, [businessId])).rows[0].count).toBe("0");

  await page.getByLabel("Business name").fill("Asha Rao Catering");
  await page.getByLabel("Address line 1").fill("12 MG Road");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("PIN code").fill("411001");
  await expect(page.getByRole("button", { name: /^Pay ₹/ })).toBeVisible();
  await payInRazorpay(page);
  await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 90_000 });

  // The payment made the business, the Admin and the product link, and Ops holds the paid plan, with no trial row ever.
  expect((await platform.query(`select count(*) from organisation_members m join users u on u.id = m.user_id where m.organisation_id = $1 and u.email = $2 and m.central_role = 'admin'`, [businessId, email])).rows[0].count).toBe("1");
  expect((await ops.query(`select status, "billingInterval" from subscription where "businessId" = $1 order by "createdAt"`, [businessId])).rows).toEqual([{ status: "ACTIVE", billingInterval: "ANNUAL" }]);
  expect((await pendingRow(email))?.status).toBe("completed");

  await page.getByRole("link", { name: /^Continue to Caterly/ }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/, { timeout: 90_000 });
  const mine = await caterly.query(`select o."businessId", m.role from member m join "user" u on u.id = m."userId" join organization o on o.id = m."organizationId" where u.email = $1`, [email]);
  expect(mine.rows).toEqual([{ businessId, role: "owner" }]);
  // Caterly opened with the paid plan from Ops, not trial defaults, and is not locked.
  await expect.poll(async () => (await caterly.query(`select s.data->>'status' as status from ops_snapshot s join organization o on o.id = s."organizationId" where o."businessId" = $1`, [businessId])).rows[0]?.status ?? null, { timeout: 60_000 }).toBe("ACTIVE");
  await page.goto(`${CATERLY}/dashboard`);
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  // The scheduled check leaves a paid, completed sign-up alone.
  expect((await cron(page)).status()).toBe(200);
  expect((await platform.query(`select count(*) from organisations where id = $1`, [businessId])).rows[0].count).toBe("1");
});

test("a paid sign-up that is never paid: cannot sign in meanwhile, is cleared away after the window with its details kept for staff, and the email can sign up again", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `ps-${Date.now()}@auth.test`;
  emails.push(email);
  await startPaidSignUp(page, email);
  await verify(page, email);
  await expect(page.getByLabel("Business name")).toBeVisible({ timeout: 60_000 });
  const row = await pendingRow(email);
  const businessId = row.reservedBusinessId as string;
  await expect.poll(async () => (await ops.query(`select count(*) from business where id = $1`, [businessId])).rows[0].count, { timeout: 30_000 }).toBe("1");

  // Meanwhile a password sign-in is refused: the person starts again from the product.
  const other = await (await browser.newContext()).newPage();
  await other.goto(`${CATERLY}/`);
  await expect(other).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await fill(other, "Email", email);
  await fill(other, "Password", PASSWORD);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.locator(".pl-auth-error")).toContainText("Your sign-up was not completed");

  // Inside the window the scheduled check leaves everything alone.
  expect((await (await cron(page)).json()).abandoned).toBe(0);
  expect(await pendingRow(email)).not.toBeNull();

  // The window ends: Ops keeps one Abandoned-orders record, and the person's sign-in record, Platform user and Ops registration are gone.
  await identity.query(`update "signupProduct" set "verifiedAt" = now() - interval '25 hours' where "reservedBusinessId" = $1`, [businessId]);
  const swept = await (await cron(page)).json();
  expect(swept.abandoned).toBeGreaterThanOrEqual(1);
  expect(await pendingRow(email)).toBeNull();
  expect((await identity.query(`select count(*) from "user" where "email" = $1`, [email])).rows[0].count).toBe("0");
  expect((await platform.query(`select count(*) from users where email = $1`, [email])).rows[0].count).toBe("0");
  expect((await ops.query(`select count(*) from business where id = $1`, [businessId])).rows[0].count).toBe("0");
  expect((await ops.query(`select email, name, "planCode", interval, step, status from abandoned_order where "businessId" = $1`, [businessId])).rows).toEqual([
    { email, name: "Asha Rao", planCode: "premium", interval: "ANNUAL", step: "opened_store", status: "OPEN" },
  ]);

  // The email is free: the same person can sign up again, and is not treated as already registered.
  const again = await (await browser.newContext()).newPage();
  await startPaidSignUp(again, email);
  expect(await pendingRow(email)).toMatchObject({ status: "pending_payment" });
  await ops.query(`delete from abandoned_order where "businessId" = $1`, [businessId]);
});

test("signing up again with an unpaid email before the window ends replaces the unpaid one", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `ps-${Date.now()}@auth.test`;
  emails.push(email);
  await startPaidSignUp(page, email);
  await verify(page, email);
  await expect(page.getByLabel("Business name")).toBeVisible({ timeout: 60_000 });
  const first = (await pendingRow(email)).reservedBusinessId as string;

  const again = await (await browser.newContext()).newPage();
  await startPaidSignUp(again, email); // would be refused as "already registered" if the unpaid one were kept
  const second = (await pendingRow(email)).reservedBusinessId as string;
  expect(second).not.toBe(first);
  expect((await ops.query(`select count(*) from abandoned_order where "businessId" = $1`, [first])).rows[0].count).toBe("1");
  await ops.query(`delete from abandoned_order where "businessId" = $1`, [first]);
});
