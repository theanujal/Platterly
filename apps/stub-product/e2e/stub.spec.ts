import { expect, test, type Page } from "@playwright/test";
import { newId } from "../../../packages/contract/index";
import { PLATFORM_CONTRACT_VERSION, signPlatformRequest } from "../../../packages/platform-contract/index";

/**
 * The stub product as a second consumer of the Platform contracts, in a real browser against the running Platform and stub (IC2):
 * single sign-on, logout in both directions (RP-initiated and back-channel), sign out everywhere, signed events and revocation. Nothing is faked: people are
 * registered through the pages and their codes read from the local mail sink; events are signed with the stub's real secret.
 */
const SINK = "http://localhost:3600";
const STUB = "http://stub.localhost:3500";
const ACCOUNT = "http://account.localhost:3300";
const PASSWORD = "correct horse 7";
const SECRET = (process.env.STUB_EVENT_SECRETS ?? "").split(",")[0];
let counter = 0;
const newEmail = () => `stub-${Date.now()}-${counter++}@auth.test`;

async function fill(page: Page, label: string, value: string, options?: { exact?: boolean }) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true, ...options } : options).fill(value);
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
/** From the provider's sign-in page (wherever the visit started) to a registered, verified, signed-in person. */
async function registerOnSignInPage(page: Page, to: string) {
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", ("Stub Person").split(" ")[0]);
  await fill(page, "Last name", ("Stub Person").split(" ").slice(1).join(" ") || "Tester");
  await fill(page, "Phone", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await fill(page, "Verification code", await codeFor(page, to));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Your email is verified. You can sign in now.")).toBeVisible();
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}
/** Signed in at the Account (the provider session now exists), then the stub opened with NO second login. */
async function signInAtAccountThenOpenStub(page: Page, to: string) {
  await page.goto(`${ACCOUNT}/`);
  await registerOnSignInPage(page, to);
  await expect(page).toHaveURL(`${ACCOUNT}/`);
  await page.goto(`${STUB}/login`);
  await expect(page.getByText(`Signed in as`)).toBeVisible();
}
const me = async (page: Page) => page.request.get(`${STUB}/api/me`);
const event = (businessId: string, sequence: number, data: object, type = "membership.changed") => ({ version: PLATFORM_CONTRACT_VERSION, eventId: newId("event"), businessId, sequence, occurredAt: new Date().toISOString(), type, data });
async function send(page: Page, body: object, o: { secret?: string; path?: string } = {}) {
  const raw = JSON.stringify(body);
  const id = (body as { eventId: string }).eventId;
  const headers = signPlatformRequest(o.secret ?? SECRET, id, raw, "POST", `${STUB}/api/platform/events`);
  return page.request.post(`${STUB}${o.path ?? "/api/platform/events"}`, { headers, data: raw });
}

test.beforeAll(() => {
  if (!SECRET) throw new Error("run `source ~/.platterly/f4dev/stub-env.sh` first (STUB_EVENT_SECRETS)");
});

test.describe("Single sign-on", () => {
  test("signed in at the Account, the stub signs the person in with no second login", async ({ page }) => {
    const to = newEmail();
    await page.goto(`${ACCOUNT}/`);
    await registerOnSignInPage(page, to);
    await expect(page).toHaveURL(`${ACCOUNT}/`);
    const signInPages: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame() && /auth\.localhost:3300\/sign-in/.test(f.url())) signInPages.push(f.url());
    });
    await page.goto(`${STUB}/login`);
    await expect(page).toHaveURL(`${STUB}/`);
    await expect(page.getByText("Signed in as")).toContainText(to);
    expect(signInPages, "the provider never showed a sign-in page").toEqual([]);
    expect(await (await me(page)).json()).toMatchObject({ status: "ok", email: to, allowed: false, memberships: [] });
    await expect(page.getByText("You do not have access to this product.")).toBeVisible();
  });

  test("opening the stub first sends the person to the provider's sign-in page, and back to the stub after signing in", async ({ page }) => {
    const to = newEmail();
    await page.goto(STUB);
    await expect(page.getByText("You are not signed in.")).toBeVisible();
    await page.getByRole("link", { name: "Sign in with Platterly" }).click();
    await registerOnSignInPage(page, to);
    await expect(page).toHaveURL(`${STUB}/`);
    await expect(page.getByText("Signed in as")).toContainText(to);
    // The stub session cookie is the stub host's own, HttpOnly, and carries no identity.
    const cookie = (await page.context().cookies(STUB)).find((c) => c.name === "stub_session")!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    expect(cookie.value).not.toContain(to);
    expect(await page.evaluate(() => document.cookie)).not.toContain("stub_session");
  });

  test("the central sign-in pages are branded for the product being signed in to, and plain for the Account", async ({ page }) => {
    await page.goto(`${STUB}/login`);
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await expect(page.getByRole("heading", { name: "Sign in to Platterly stub product" })).toBeVisible();
    await expect(page.locator(".pl-auth-product")).toHaveText("Platterly stub product");
    await expect(page.locator("img.pl-auth-logo")).toHaveAttribute("src", `${STUB}/logo.svg`);
    await expect(page.getByText("Signing in with your Platterly account")).toBeVisible();
    // The branding follows the person from page to page of the same sign-in (sign-up, forgot password), so it never flips back to plain mid-way.
    const signInUrl = page.url();
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page.locator(".pl-auth-product")).toHaveText("Platterly stub product");
    await page.goto(signInUrl);
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.locator(".pl-auth-product")).toHaveText("Platterly stub product");
    // The Account is first-party: the plain Platterly page.
    await page.goto(`${ACCOUNT}/`);
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.locator(".pl-auth-brand")).toHaveAttribute("data-product", "platterly");
    await expect(page.getByText("Signing in with your Platterly account")).toHaveCount(0);
    // A made-up client id on the page changes nothing (cosmetic only, no branding for an unknown product).
    await page.goto("http://auth.localhost:3300/sign-in?client_id=made-up-product");
    await expect(page.locator(".pl-auth-brand")).toHaveAttribute("data-product", "platterly");
  });

  test("a callback with no sign-in in progress, or a forged state, is refused", async ({ page }) => {
    const res = await page.request.get(`${STUB}/auth/callback?code=abc&state=xyz`);
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("could not sign you in");
    expect((await me(page)).status()).toBe(401);
  });
});

test.describe("Logout", () => {
  test("signing out at the Account ends the stub session through the back-channel", async ({ page }) => {
    await signInAtAccountThenOpenStub(page, newEmail());
    expect((await me(page)).status()).toBe(200);
    await page.goto(`${ACCOUNT}/`);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await expect.poll(async () => (await me(page)).status(), { message: "the stub session ends without the person visiting the stub" }).toBe(401);
    await page.goto(STUB);
    await expect(page.getByText("You are not signed in.")).toBeVisible();
  });

  test("signing out of the stub ends the provider session too, so the Account is signed out", async ({ page }) => {
    await signInAtAccountThenOpenStub(page, newEmail());
    expect((await page.request.get(`${ACCOUNT}/api/account/overview`)).status()).toBe(200);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(`${STUB}/`);
    await expect(page.getByText("You are not signed in.")).toBeVisible();
    expect((await me(page)).status()).toBe(401);
    expect((await page.request.get(`${ACCOUNT}/api/account/overview`)).status(), "the provider session ended, so the Account is signed out").toBe(401);
  });

  test("'Sign out everywhere' in the Account ends the stub session too", async ({ page }) => {
    await signInAtAccountThenOpenStub(page, newEmail());
    expect((await me(page)).status()).toBe(200);
    await page.goto(`${ACCOUNT}/security`);
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await expect.poll(async () => (await me(page)).status()).toBe(401);
  });

  test("a forged or garbage logout token is refused and the session stays", async ({ page }) => {
    await signInAtAccountThenOpenStub(page, newEmail());
    for (const body of ["logout_token=garbage", "", "logout_token=a.b.c", "other=1"]) {
      const res = await page.request.post(`${STUB}/api/platform/logout`, { headers: { "content-type": "application/x-www-form-urlencoded" }, data: body });
      expect(res.status(), body).toBe(400);
    }
    expect((await me(page)).status()).toBe(200);
  });
});

test.describe("Signed events and revocation", () => {
  test("an active membership grants access, a removal closes it on the next request while the person stays signed in, duplicates and old events change nothing", async ({ page }) => {
    await signInAtAccountThenOpenStub(page, newEmail());
    const { sub } = (await (await me(page)).json()) as { sub: string };
    const business = newId("business");

    const grant = event(business, 1, { userId: sub, role: "admin", status: "active", membershipVersion: 1 });
    expect(await (await send(page, grant)).json()).toEqual({ status: "ok", applied: true });
    await page.reload();
    await expect(page.getByText("You have access.")).toBeVisible();
    expect(await (await me(page)).json()).toMatchObject({ allowed: true, memberships: [{ businessId: business, role: "admin", status: "active" }] });

    expect(await (await send(page, grant)).json(), "a redelivery").toEqual({ status: "ok", applied: false });

    const removed = event(business, 3, { userId: sub, role: "admin", status: "removed", membershipVersion: 3 });
    expect(await (await send(page, removed)).json()).toEqual({ status: "ok", applied: true });
    const late = event(business, 2, { userId: sub, role: "admin", status: "active", membershipVersion: 2 });
    expect(await (await send(page, late)).json(), "an older event arriving late").toEqual({ status: "ok", applied: false });

    expect((await me(page)).status(), "still signed in").toBe(200);
    expect(await (await me(page)).json()).toMatchObject({ allowed: false, memberships: [{ status: "removed" }] });
    await page.reload();
    await expect(page.getByText("You do not have access to this product.")).toBeVisible();
    await expect(page.getByText("Signed in as")).toBeVisible();
  });

  test("a suspended business closes access, and reactivating it with a higher sequence opens it again", async ({ page }) => {
    await signInAtAccountThenOpenStub(page, newEmail());
    const { sub } = (await (await me(page)).json()) as { sub: string };
    const business = newId("business");
    await send(page, event(business, 1, { userId: sub, role: "admin", status: "active", membershipVersion: 1 }));
    expect((await (await me(page)).json()).allowed).toBe(true);
    await send(page, event(business, 2, { status: "suspended" }, "organisation.status"));
    expect((await (await me(page)).json()).allowed).toBe(false);
    await send(page, event(business, 3, { status: "active" }, "organisation.status"));
    expect((await (await me(page)).json()).allowed).toBe(true);
  });

  test("a forged, tampered, mis-routed or stale delivery is refused and changes nothing", async ({ page }) => {
    await signInAtAccountThenOpenStub(page, newEmail());
    const { sub } = (await (await me(page)).json()) as { sub: string };
    const business = newId("business");
    const grant = event(business, 1, { userId: sub, role: "admin", status: "active", membershipVersion: 1 });
    expect((await send(page, grant, { secret: "not-the-secret" })).status()).toBe(401);
    const raw = JSON.stringify(grant);
    const signed = signPlatformRequest(SECRET, grant.eventId, raw, "POST", `${STUB}/api/platform/events`);
    expect((await page.request.post(`${STUB}/api/platform/events`, { headers: signed, data: raw.replace("admin", "owner") })).status(), "tampered").toBe(401);
    expect((await page.request.post(`${STUB}/api/platform/events`, { headers: signPlatformRequest(SECRET, grant.eventId, raw, "POST", `${STUB}/api/platform/other`), data: raw })).status(), "signed for another route").toBe(401);
    expect((await page.request.post(`${STUB}/api/platform/events`, { headers: signPlatformRequest(SECRET, grant.eventId, raw, "POST", `${STUB}/api/platform/events`, Math.floor(Date.now() / 1000) - 3600), data: raw })).status(), "stale").toBe(401);
    expect((await page.request.post(`${STUB}/api/platform/events`, { data: raw, headers: { "content-type": "application/json" } })).status(), "unsigned").toBe(401);
    expect((await (await me(page)).json()).allowed).toBe(false);
  });
});

test("the manifest describes the product for registration", async ({ request }) => {
  const m = await (await request.get(`${STUB}/api/platform/manifest`)).json();
  expect(m).toMatchObject({ contractVersion: PLATFORM_CONTRACT_VERSION, key: "stub", oidc: { clientId: "stub-product", pkce: "S256", backchannelLogoutUri: `${STUB}/api/platform/logout` }, endpoints: { events: `${STUB}/api/platform/events` } });
  expect(JSON.stringify(m)).not.toMatch(/secret/i);
  expect((await request.get(`${STUB}/api/health`)).status()).toBe(200);
});
