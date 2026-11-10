import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupInviteeUser, cleanupOnboardingTestUser } from "./db";
import { signOutFromMenu, signUpCaterer } from "./auth-helpers";
import { totpFromUri } from "../apps/platform/src/modules/auth/__tests__/totp-util";

/** The sign-in system's code emails (approved Caterly layout): the code is read from the email body, not the subject. */
const CODE_SUBJECT = /Account Verification|Reset Your Platterly Password|Confirm Your New Platterly Email|Confirm Your Platterly Recovery Email|Sign-in Code/;


/**
 * Caterly as a sign-in client of Platterly's central identity (F8.1.1 / F8.1.3), end to end in a real browser against the running Caterly, Platform
 * (account.localhost:3300, auth.localhost:3300) and the local mail sink (3600). Single sign-in is Caterly's login (there is no switch). The spec is skipped
 * unless PLATFORM_SSO_E2E=1, because it needs the Platform and the mail sink running and Caterly registered there (apps/platform
 * `node scripts/register-product-client.mjs caterly`). Caterly has no sign-in form of its own any more (the legacy door was removed on 2026-11-10); kitchenlogin.spec.ts proves it is gone.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1", "needs the Platform (auth.localhost:3300) and the mail sink running");

const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const ACCOUNT = "http://account.localhost:3300";
const PASSWORD = "correct horse 7";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let counter = 0;
const newEmail = () => `sso-${Date.now()}-${counter++}@auth.test`;
const created: string[] = [];
const invitees: string[] = [];
test.afterEach(async () => {
  // Invitees join someone else's business: remove only their own rows (never the shared business) before the owner's cleanup below.
  const invited = invitees.splice(0);
  for (const email of invited) await cleanupInviteeUser(email);
  const emails = [...created.splice(0), ...invited];
  for (const email of emails) await cleanupOnboardingTestUser(email);
  // The people registered on the central page live in the identity database too. When its address is given (source ~/.platterly/f4dev/env.sh gives
  // IDENTITY_DATABASE_URL, but also points DATABASE_URL at Platform's database, so pass only the one variable: IDENTITY_DATABASE_URL=... npx playwright test ...),
  // remove them as well so the central database keeps only real accounts.
  if (process.env.IDENTITY_DATABASE_URL && emails.length) {
    const identity = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 1 });
    await identity.query('delete from "user" where email = any($1)', [emails]).finally(() => identity.end());
  }
});
test.afterAll(async () => {
  await pool.end();
});

async function fill(page: Page, label: string, value: string, options?: { exact?: boolean }) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true, ...options } : options).fill(value);
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
/** On the central sign-in page: register, verify by the emailed code, and sign in (so the browser goes back to where it came from). */
async function registerOnCentralPage(page: Page, to: string) {
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", ("Sso Person").split(" ")[0]);
  await fill(page, "Last name", ("Sso Person").split(" ").slice(1).join(" ") || "Tester");
  await fill(page, "Phone", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
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

test("Caterly sends a signed-out visitor to the central page, which looks like Caterly's own sign-in, and a new central person starts Caterly's onboarding", async ({ page }) => {
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
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  const session = await caterlySession(page);
  expect(session?.user?.email).toBe(to);
  expect(await userCount(to)).toBe(1);
  // The common details given on the central sign-up page (first name, last name, phone) arrive in Caterly through userinfo.
  const row = (await pool.query('select "firstName", "lastName", phone from "user" where email = $1', [to])).rows[0];
  expect(row, "Caterly holds the same first name, last name and phone as the Account").toEqual({ firstName: "Sso", lastName: "Person", phone: "+919800000123" });
  const link = await pool.query(`select "accountId", "userId" from account where "providerId" = 'platterly' and "userId" = $1`, [session!.user!.id]);
  expect(link.rowCount, "the central identity is recorded as a linked account on the Caterly user").toBe(1);
});

test("signing in again uses the same Caterly user (matched by the linked account), not a second one", async ({ page }) => {
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  await page.goto(`${CATERLY}/dashboard`);
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

test("single sign-on: already signed in centrally, Caterly signs the person in with no sign-in page", async ({ page }) => {
  const to = newEmail();
  created.push(to);
  // Sign-up only starts from a product, so the person registers through Caterly; then only Caterly's own session is dropped, leaving the central one.
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  await page.context().clearCookies({ domain: "catering.localhost" });
  expect(await caterlySession(page)).toBeNull();
  const signInPages: string[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame() && /auth\.localhost:3300\/sign-in/.test(f.url())) signInPages.push(f.url());
  });
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/catering\.localhost:3000\/(dashboard|kitchenlogin\/onboarding)/);
  expect(signInPages, "the central sign-in page never showed").toEqual([]);
  expect((await caterlySession(page))?.user?.email).toBe(to);
});

test("signing out at the Account ends the Caterly session through the back-channel", async ({ page }) => {
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  expect((await caterlySession(page))?.user?.email).toBe(to);
  await page.goto(`${ACCOUNT}/`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await expect.poll(async () => (await caterlySession(page))?.user?.email ?? null, { message: "the Caterly session ended without the person visiting Caterly" }).toBeNull();
});

/**
 * A Caterly person who existed before central sign-in (like an imported kitchen owner): a user with a business of their own, written straight to Caterly's
 * database, because Caterly no longer has a sign-up of its own to make one. Removed by `cleanupOnboardingTestUser`.
 */
async function makeCaterlyUser(_request: import("@playwright/test").APIRequestContext, email: string, verified: boolean): Promise<string> {
  const userId = `legacy-${crypto.randomUUID()}`;
  const orgId = `legacy-org-${crypto.randomUUID()}`;
  await pool.query(`insert into "user" (id, name, email, "emailVerified", "firstName", "lastName", "updatedAt") values ($1, 'Existing Person', $2, $3, 'Existing', 'Person', now())`, [userId, email, verified]);
  await pool.query(`insert into organization (id, name, slug, "createdAt") values ($1, 'Legacy Kitchen', $2, now())`, [orgId, `legacy-${orgId.slice(-12)}`]);
  await pool.query(`insert into member (id, "organizationId", "userId", role, "createdAt") values ($1, $2, $3, 'owner', now())`, [`legacy-m-${crypto.randomUUID()}`, orgId, userId]);
  return userId;
}
const platterlyLinks = async (userId: string) => (await pool.query(`select "accountId" from account where "userId" = $1 and "providerId" = 'platterly'`, [userId])).rows.map((r) => r.accountId as string);

test("first sign-in links an existing Caterly user by VERIFIED email, once; from then on the central id alone is used", async ({ page, request }) => {
  const to = newEmail();
  created.push(to);
  const existing = await makeCaterlyUser(request, to, true);
  expect(await platterlyLinks(existing)).toEqual([]);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  expect((await caterlySession(page))!.user!.id, "signed in as the EXISTING Caterly user, not a new one").toBe(existing);
  expect(await userCount(to)).toBe(1);
  const links = await platterlyLinks(existing);
  expect(links, "exactly one link was recorded").toHaveLength(1);
  // Sign out, then sign in again: the recorded link finds the same user (no email matching involved any more).
  await page.getByRole("button", { name: "Close" }).click();
  await signOutFromMenu(page);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD, { exact: true });
  await page.getByRole("button", { name: "Sign in to your account" }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  expect((await caterlySession(page))!.user!.id).toBe(existing);
  expect(await platterlyLinks(existing)).toEqual(links);
});

test("a Caterly user whose email is NOT verified is not linked by email: the central sign-in is refused and no second user appears", async ({ page, request }) => {
  const to = newEmail();
  created.push(to);
  const existing = await makeCaterlyUser(request, to, false);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/\?error=/);
  await expect(page.getByRole("heading", { name: "We could not sign you in" })).toBeVisible();
  await expect(page.locator("[data-sso-problem]")).toBeVisible();
  expect(await userCount(to), "still exactly one Caterly user").toBe(1);
  expect(await caterlySession(page)).toBeNull();
  expect(await platterlyLinks(existing)).toEqual([]);
});

test("a Caterly user already linked to a DIFFERENT central identity is not handed to someone else who shares the email: refused, link unchanged", async ({ page, request }) => {
  const to = newEmail();
  created.push(to);
  const existing = await makeCaterlyUser(request, to, true);
  await pool.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") values ($1, 'someone-else', 'platterly', $2, now(), now())`, [`pre-${existing}`, existing]);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/\?error=/);
  await expect(page.locator("[data-sso-problem]")).toBeVisible();
  expect(await caterlySession(page)).toBeNull();
  expect(await userCount(to)).toBe(1);
  expect(await platterlyLinks(existing), "still only the original link").toEqual(["someone-else"]);
});

test("an invitee with no Caterly account signs in centrally, comes back to the invitation (not onboarding), and joins the INVITER's business", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const ownerEmail = `e2e-owner-${Date.now()}@example.test`;
  const invitee = newEmail();
  created.push(ownerEmail);
  invitees.push(invitee);
  // The owner has a business (made through the old form, which still works); an invitation for the invitee is written straight to the database.
  await signUpCaterer(page, ownerEmail);
  const owner = (await pool.query(`select u.id as "userId", m."organizationId" as org, o.name from "user" u join member m on m."userId" = u.id join organization o on o.id = m."organizationId" where u.email = $1`, [ownerEmail])).rows[0];
  const invitationId = `inv-${Date.now()}`;
  await pool.query(`insert into invitation (id, "organizationId", email, role, status, "expiresAt", "createdAt", "inviterId") values ($1, $2, $3, 'staff', 'pending', now() + interval '2 days', now(), $4)`, [invitationId, owner.org, invitee, owner.userId]);

  const context = await browser.newContext();
  const inviteePage = await context.newPage();
  await inviteePage.goto(`${CATERLY}/invitations/${invitationId}/accept`);
  await registerOnCentralPage(inviteePage, invitee);
  // Back on the invitation (which accepts itself on load), not Caterly's onboarding wizard: straight to the Dashboard, signed in as the invitee.
  await expect(inviteePage).toHaveURL(/catering\.localhost:3000\/dashboard/);
  const session = (await caterlySession(inviteePage))!;
  expect(session.user?.email).toBe(invitee);
  expect(await platterlyLinks(session.user!.id)).toHaveLength(1);
  const joined = await pool.query(`select "organizationId" from member where "userId" = $1`, [session.user!.id]);
  expect(joined.rows.map((r) => r.organizationId), "joined the inviter's business and has no business of their own").toEqual([owner.org]);
  await context.close();
});

test("a person with two-step verification is asked for the code on the central page when signing in to Caterly, and then lands in Caterly", async ({ page }) => {
  test.setTimeout(90_000);
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  // Turn on two-step verification at the Account (single sign-on signs the person in there).
  await page.goto(`${ACCOUNT}/security`);
  await page.getByRole("button", { name: "Set up" }).click();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = (await page.locator("code").first().textContent())!.trim();
  const codeNow = () => totpFromUri(`otpauth://totp/x?secret=${secret}`);
  await page.getByLabel("6-digit code").fill(codeNow());
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Two-step verification is on.")).toBeVisible();
  await page.getByRole("button", { name: "I have saved them" }).click();
  // Switching it on ends the person's other sessions, Caterly's included; the next Caterly visit goes to the central page and asks for the code.
  await page.goto(`${ACCOUNT}/profile`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD, { exact: true });
  await page.getByRole("button", { name: "Sign in to your account" }).click();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  await fill(page, "Authentication code", codeNow());
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\/(dashboard|kitchenlogin\/onboarding)/);
  expect((await caterlySession(page))?.user?.email).toBe(to);
});

/** From a Caterly-started sign-in to a signed-in Caterly session: goes to Caterly, signs in on the central page with the password, comes back. */
async function signInToCaterly(page: Page, email: string) {
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await fill(page, "Email", email);
  await fill(page, "Password", PASSWORD, { exact: true });
  await page.getByRole("button", { name: "Sign in to your account" }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\//);
}
const caterlyRow = async (email: string) => (await pool.query('select name, "firstName", "lastName", phone, email from "user" where email = $1', [email])).rows[0];

test("a name and phone changed in the Account reach Caterly at the next sign-in", async ({ page }) => {
  test.setTimeout(90_000);
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  expect(await caterlyRow(to)).toMatchObject({ firstName: "Sso", lastName: "Person", phone: "+919800000123", name: "Sso Person" });

  await page.goto(`${ACCOUNT}/profile`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("First name").fill("Renu");
  await page.getByLabel("Phone").fill("+91 98000 00999");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your details were saved.")).toBeVisible();
  // Not pushed: Caterly still holds the old details until the person signs in there again.
  expect(await caterlyRow(to)).toMatchObject({ firstName: "Sso", phone: "+919800000123" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await signInToCaterly(page, to);
  expect(await caterlyRow(to)).toEqual({ name: "Renu Person", firstName: "Renu", lastName: "Person", phone: "+919800000999", email: to });
  expect(await userCount(to), "still one Caterly user").toBe(1);
});

test("an Account that holds no phone never erases the phone Caterly already has", async ({ page }) => {
  test.skip(!process.env.IDENTITY_DATABASE_URL, "needs IDENTITY_DATABASE_URL to empty the Account's phone");
  test.setTimeout(90_000);
  const to = newEmail();
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, to);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  const identity = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 1 });
  try {
    await identity.query('update "user" set phone = null where email = $1', [to]);
  } finally {
    await identity.end();
  }
  await pool.query(`update "user" set phone = '+919811111111' where email = $1`, [to]);
  await page.goto(`${ACCOUNT}/profile`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await signInToCaterly(page, to);
  expect((await caterlyRow(to)).phone, "Caterly's own phone stays when the Account has none").toBe("+919811111111");
});

test("if another Caterly person already holds the new email, the person still signs in to Caterly, keeping their current Caterly address, and nobody else's data changes", async ({ page, request }) => {
  test.setTimeout(90_000);
  const oldEmail = newEmail();
  const taken = newEmail();
  created.push(oldEmail, taken);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, oldEmail);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  // A different person who exists only in Caterly holds the address the first person is about to move to.
  const bystander = await makeCaterlyUser(request, taken, true);
  await page.goto(`${ACCOUNT}/security`);
  await page.getByRole("button", { name: "Change email" }).first().click();
  await page.getByLabel("New email address").fill(taken);
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(await codeFor(page, taken));
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(page.getByText("Your sign-in email was changed.")).toBeVisible();
  // Changing the email signs the person out of every device, this one too.
  await page.goto(`${ACCOUNT}/profile`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.goto(`${CATERLY}/`);
  await fill(page, "Email", taken);
  await fill(page, "Password", PASSWORD, { exact: true });
  await page.getByRole("button", { name: "Sign in to your account" }).click();
  // The person signs in normally. Caterly keeps their current address (the clash is not forced), the other person is untouched, and there is no second user.
  await expect(page).toHaveURL(/catering\.localhost:3000\/(dashboard|kitchenlogin\/onboarding)/);
  expect((await caterlySession(page))?.user?.email).toBe(oldEmail);
  expect((await pool.query('select id from "user" where email = $1', [taken])).rows.map((r) => r.id), "the other person still holds the address").toEqual([bystander]);
  expect(await userCount(oldEmail)).toBe(1);
});

test("an email changed in the Account reaches Caterly at the next sign-in", async ({ page }) => {
  test.setTimeout(90_000);
  const oldEmail = newEmail();
  const next = newEmail();
  created.push(oldEmail, next);
  await page.goto(`${CATERLY}/`);
  await registerOnCentralPage(page, oldEmail);
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  await page.goto(`${ACCOUNT}/security`);
  await page.getByRole("button", { name: "Change email" }).first().click();
  await page.getByLabel("New email address").fill(next);
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(await codeFor(page, next));
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(page.getByText("Your sign-in email was changed.")).toBeVisible();
  expect(await userCount(oldEmail), "Caterly still has the old address until the next sign-in").toBe(1);
  // Changing the email signs the person out of every device, this one too.
  await page.goto(`${ACCOUNT}/profile`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await signInToCaterly(page, next);
  expect(await userCount(oldEmail)).toBe(0);
  expect(await userCount(next), "the same Caterly user now has the new address").toBe(1);
  expect((await caterlyRow(next)).firstName).toBe("Sso");
});

test("the back-channel endpoint refuses anything that is not a valid logout token from the provider", async ({ request }) => {
  for (const body of ["logout_token=garbage", "", "other=1", "logout_token=a.b.c"]) {
    const res = await request.post(`${CATERLY}/api/platform/logout`, { headers: { "content-type": "application/x-www-form-urlencoded" }, data: body });
    expect(res.status(), body).toBe(400);
  }
  expect((await request.get(`${CATERLY}/api/platform/sso/start`, { maxRedirects: 0 })).status()).toBe(303);
});
