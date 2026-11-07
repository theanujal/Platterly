import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupOnboardingTestUser } from "./db";
import { signOutFromMenu } from "./auth-helpers";

/**
 * Caterly as a sign-in client of Platterly's central identity (F8.1.1 / F8.1.3), end to end in a real browser against the running Caterly, Platform
 * (account.localhost:3300, auth.localhost:3300) and the local mail sink (3600). It only means anything when Caterly is running WITH the switch on, so it is
 * skipped unless PLATFORM_SSO_E2E=1 (start Caterly with PLATFORM_SSO=1 first; Caterly must be registered: apps/platform `node scripts/register-product-client.mjs caterly`).
 * With the switch off Caterly's own login is covered by kitchenlogin.spec.ts and the rest of the suite, which is unchanged.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1", "needs Caterly running with PLATFORM_SSO=1");

const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const ACCOUNT = "http://account.localhost:3300";
const PASSWORD = "correct horse 7";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let counter = 0;
const newEmail = () => `sso-${Date.now()}-${counter++}@auth.test`;
const created: string[] = [];
test.afterEach(async () => {
  for (const email of created.splice(0)) await cleanupOnboardingTestUser(email);
});
test.afterAll(async () => {
  await pool.end();
});

async function fill(page: Page, label: string, value: string, options?: { exact?: boolean }) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, options).fill(value);
}
async function codeFor(page: Page, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string }[];
    const mine = messages.filter((m) => m.to.includes(to)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.subject.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no code arrived for ${to}`);
}
/** On the central sign-in page: register, verify by the emailed code, and sign in (so the browser goes back to where it came from). */
async function registerOnCentralPage(page: Page, to: string) {
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "Full name", "Sso Person");
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD, { exact: true });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await fill(page, "Verification code", await codeFor(page, to));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Your email is verified. You can sign in now.")).toBeVisible();
  await fill(page, "Password", PASSWORD, { exact: true });
  await page.getByRole("button", { name: /^Sign in( to your account)?$/ }).click();
}
const caterlySession = async (page: Page) => (await (await page.request.get(`${CATERLY}/api/auth/get-session`)).json()) as { user?: { email: string; id: string } } | null;
const userCount = async (email: string) => Number((await pool.query('select count(*) from "user" where email = $1', [email])).rows[0].count);

test("Caterly sends a signed-out visitor to the central page, which looks like Caterly's own sign-in, and a new central person lands in their Caterly dashboard", async ({ page }) => {
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("Run your catering business from one place")).toBeVisible();
  await expect(page.getByText("Sign in to manage your catering business")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to your account" })).toBeVisible();
  await expect(page.locator(".pl-cat-mark")).toHaveAttribute("src", `${CATERLY}/caterly-mark.svg`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  const session = await caterlySession(page);
  expect(session?.user?.email).toBe(to);
  expect(await userCount(to)).toBe(1);
  const link = await pool.query(`select "accountId", "userId" from account where "providerId" = 'platterly' and "userId" = $1`, [session!.user!.id]);
  expect(link.rowCount, "the central identity is recorded as a linked account on the Caterly user").toBe(1);
});

test("signing in again uses the same Caterly user (matched by the linked account), not a second one", async ({ page }) => {
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  const first = (await caterlySession(page))!.user!.id;
  // A fresh Dashboard opens the "Create Your Custom Link" dialog over the page; close it as Caterly's own sign-up helper does.
  await page.getByRole("button", { name: "Close" }).click();
  await signOutFromMenu(page);
  // Signing out of Caterly also ends the central session: the browser follows the end-session address and comes back to Caterly, which sends a signed-out
  // visitor to the central page, and it shows the sign-in form instead of signing the person straight back in.
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  expect(await caterlySession(page)).toBeNull();
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD, { exact: true });
  await page.getByRole("button", { name: "Sign in to your account" }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  expect((await caterlySession(page))!.user!.id).toBe(first);
  expect(await userCount(to)).toBe(1);
});

test("single sign-on: already signed in at the Account, Caterly signs the person in with no sign-in page", async ({ page }) => {
  const to = newEmail();
  created.push(to);
  await page.goto(`${ACCOUNT}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(`${ACCOUNT}/`);
  const signInPages: string[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame() && /auth\.localhost:3300\/sign-in/.test(f.url())) signInPages.push(f.url());
  });
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  expect(signInPages, "the central sign-in page never showed").toEqual([]);
  expect((await caterlySession(page))?.user?.email).toBe(to);
});

test("signing out at the Account ends the Caterly session through the back-channel", async ({ page }) => {
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  expect((await caterlySession(page))?.user?.email).toBe(to);
  await page.goto(`${ACCOUNT}/`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await expect.poll(async () => (await caterlySession(page))?.user?.email ?? null, { message: "the Caterly session ended without the person visiting Caterly" }).toBeNull();
});

test("a Caterly user who only shares the email is NOT linked by email: the central sign-in is refused and no second user appears", async ({ page, request }) => {
  const to = newEmail();
  created.push(to);
  // Made through a separate request context, so this browser is not signed in to Caterly by the sign-up call.
  const made = await request.post(`${CATERLY}/api/auth/sign-up/email`, { headers: { origin: CATERLY }, data: { name: "Existing Person", firstName: "Existing", lastName: "Person", email: to, password: "correct-horse-battery" } });
  expect(made.ok()).toBe(true);
  expect(await userCount(to)).toBe(1);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/\?error=/);
  await expect(page.getByRole("heading", { name: "We could not sign you in" })).toBeVisible();
  await expect(page.locator("[data-sso-problem]")).toBeVisible();
  expect(await userCount(to), "still exactly one Caterly user").toBe(1);
  expect(await caterlySession(page)).toBeNull();
  const linked = await pool.query(`select 1 from account a join "user" u on u.id = a."userId" where u.email = $1 and a."providerId" = 'platterly'`, [to]);
  expect(linked.rowCount).toBe(0);
});

test("?legacy=1 still shows Caterly's own email-and-password form", async ({ page }) => {
  await page.goto(`${CATERLY}/?legacy=1`);
  await expect(page).toHaveURL(`${CATERLY}/?legacy=1`);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to your account" })).toBeVisible();
});

test("the back-channel endpoint refuses anything that is not a valid logout token from the provider", async ({ request }) => {
  for (const body of ["logout_token=garbage", "", "other=1", "logout_token=a.b.c"]) {
    const res = await request.post(`${CATERLY}/api/platform/logout`, { headers: { "content-type": "application/x-www-form-urlencoded" }, data: body });
    expect(res.status(), body).toBe(400);
  }
  expect((await request.get(`${CATERLY}/api/platform/sso/start`, { maxRedirects: 0 })).status()).toBe(303);
});
