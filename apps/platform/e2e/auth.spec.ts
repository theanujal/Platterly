import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { openSignUpFromProduct, verifyAndSignOut } from "./signed-in";
import path from "node:path";

/** The sign-in system's code emails (approved Caterly layout): the code is read from the email body, not the subject. */
const CODE_SUBJECT = /Account Verification|Reset Your Platterly Password|Confirm Your New Platterly Email|Confirm Your Platterly Recovery Email|Sign-in Code/;


/**
 * F4 sign-in, end to end in a real browser against the running Platform dev server (account.localhost:3300 and auth.localhost:3300), its identity
 * database and the local mail sink on port 3600 (no email leaves the machine). Nothing is intercepted and no user is faked: every test registers a
 * new person through the pages and reads the 6-digit code from the sink. Run with the F4 launcher (~/.platterly/f4dev/dev.sh); set
 * ACCOUNT_SHOTS=<dir> to save screenshots.
 */
const SINK = "http://localhost:3600";
const SHOTS = process.env.ACCOUNT_SHOTS;
const PASSWORD = "correct horse 7";
/** A registered, plain-looking product to sign up from (sign-up is closed to anyone who does not start from a product). */
const SIGN_UP_PRODUCT = "stub-product";
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};
/** Text typed before the page is interactive is lost when it becomes interactive, so every fill waits for the page's ready marker first. */
async function fill(page: Page, label: string, value: string, options?: { exact?: boolean }) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true, ...options } : options).fill(value);
}
let counter = 0;
const newEmail = () => `e2e-${Date.now()}-${counter++}@auth.test`;

/** The newest code mailed to this address, from the sink (retries while the background send finishes). */
async function codeFor(page: Page, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await page.request.get(`${SINK}/api/messages`);
    const messages = (await res.json()) as { to: string[]; subject: string; receivedAt: string; html: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && CODE_SUBJECT.test(m.subject)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.html.replace(/<[^>]*>/g, " ").match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no code arrived for ${to}`);
}

/** From an Account page (a signed-out visit lands on the sign-in page) to a registered, verified, signed-in person back on the Account. */
async function registerAndSignIn(page: Page, to: string, startPath = "/") {
  // Sign-up is open only to a person who starts from a registered product (the rule of 2026-11-10), so the test person is created as if they came from one
  // (the plain-looking stub product), verifies by the emailed code, and then signs in at the Account like any existing person.
  await openSignUpFromProduct(page);
  await fill(page, "First name", ("E2E Person").split(" ")[0]);
  await fill(page, "Last name", ("E2E Person").split(" ").slice(1).join(" ") || "Tester");
  await fill(page, "Phone", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await fill(page, "Verification code", await codeFor(page, to));
  await verifyAndSignOut(page);
  await page.goto(startPath);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const cookiesFor = async (context: BrowserContext, host: string) => (await context.cookies()).filter((c) => c.domain === host || c.domain === `.${host}`);

test.describe("Sign-up only from a product", () => {
  test("the Account and the Store offer no sign-up, a direct visit to the sign-up page is closed, and the request itself is refused without a product", async ({ page, request }) => {
    for (const start of ["http://account.localhost:3300/", "http://store.localhost:3300/"]) {
      await page.goto(start);
      await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
      await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
    }
    for (const closed of ["http://auth.localhost:3300/sign-up", "http://auth.localhost:3300/sign-up?client_id=platterly-account", "http://auth.localhost:3300/sign-up?client_id=platterly-store", "http://auth.localhost:3300/sign-up?client_id=no-such-product", `http://auth.localhost:3300/sign-up?client_id=${SIGN_UP_PRODUCT}`, `http://auth.localhost:3300/sign-up?client_id=${SIGN_UP_PRODUCT}&sig=abc&exp=${Math.floor(Date.now() / 1000) + 600}`]) {
      await page.goto(closed);
      await expect(page.getByRole("heading", { name: "Create your account from a product" })).toBeVisible();
      await expect(page.getByLabel("Email")).toHaveCount(0);
    }
    const body = { email: newEmail(), password: PASSWORD, name: "No Product", firstName: "No", lastName: "Product", phone: "+919800000123" };
    const refused = await request.post("http://auth.localhost:3300/api/auth/sign-up/email", { data: body, headers: { origin: "http://auth.localhost:3300" } });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe("SIGN_UP_FROM_PRODUCT_ONLY");
  });

  test("a product's own sign-up page shows the form", async ({ page }) => {
    await openSignUpFromProduct(page);
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });
});

test.describe("Sign-in journey", () => {
  test("signed-out visit goes to sign-in -> register -> verify by emailed code -> sign in -> Account shows the real person -> sign out", async ({ page, context }) => {
    const to = newEmail();
    await page.goto("/");
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await expect(page.getByRole("region", { name: "You are not signed in" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await shot(page, "f4-2-sign-in-page");
    // The Account offers no way to create an account (sign-up starts from a product), so the sign-up here is opened as a product would open it.
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
    await expect(page.getByText("Accounts are created when you first use a Platterly product.")).toBeVisible();
    await openSignUpFromProduct(page);
    await shot(page, "f4-3-sign-up-page");
    await fill(page, "First name", ("E2E Person").split(" ")[0]);
    await fill(page, "Last name", ("E2E Person").split(" ").slice(1).join(" ") || "Tester");
    await fill(page, "Phone", "9800000123");
    await fill(page, "Confirm password", PASSWORD);
    await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(`Enter the code we sent to ${to}.`)).toBeVisible();
    await expect(page.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
    await shot(page, "f4-4-verify-page");
    await fill(page, "Verification code", await codeFor(page, to));
    await page.getByRole("button", { name: "Verify email" }).click();
    // Verifying signs the person in and sends them on to the product they came from (single sign-up): no second sign-in. The stub product is not running here, so the
    // proof is that the page left the verify page and the provider now holds this person's session.
    await page.waitForURL((url) => !url.pathname.endsWith("/verify"), { waitUntil: "commit", timeout: 30_000 });
    const session = await page.context().request.get("http://auth.localhost:3300/api/auth/get-session");
    expect(((await session.json()) as { user?: { email?: string } } | null)?.user?.email).toBe(to);
    // Opening the Account now needs no password either: the existing session completes the sign-in.
    await page.goto("/");

    // Back on the Account, signed in, with the person's real email and no business yet.
    await expect(page).toHaveURL("http://account.localhost:3300/");
    await expect(page.getByRole("heading", { level: 3, name: "E2E Person" })).toBeVisible();
    await expect(page.locator(".pa-acct-chip")).toContainText("E2E Person");
    await expect(page.getByText("Email verified").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "No business yet" })).toBeVisible();
    await expect(page.getByRole("region", { name: "You are not signed in" })).toHaveCount(0);
    await shot(page, "f4-5-account-signed-in");
    for (const p of ["/products", "/profile", "/security", "/devices", "/notifications"]) {
      await page.goto(p);
      await expect(page.locator(".pa-acct-chip")).toContainText("E2E Person");
    }
    await shot(page, "f4-6-security-signed-in");

    // Cookies: the Account's is host-only on the account host, HttpOnly, SameSite=Lax; the provider's is on the auth host only.
    const account = await cookiesFor(context, "account.localhost");
    const auth = await cookiesFor(context, "auth.localhost");
    const mine = account.find((c) => c.name === "platterly_account_session")!;
    expect(mine).toMatchObject({ httpOnly: true, sameSite: "Lax", domain: "account.localhost", path: "/" });
    expect(account.some((c) => c.name.startsWith("platterly-idp"))).toBe(false);
    expect(auth.some((c) => c.name === "platterly-idp.session_token" && c.httpOnly && c.sameSite === "Lax")).toBe(true);
    expect(auth.some((c) => c.name === "platterly_account_session")).toBe(false);
    expect(await page.evaluate(() => document.cookie)).not.toContain("platterly");

    // The API now answers 200 with this person, and only this person.
    const overview = await page.request.get("/api/account/overview");
    expect(overview.status()).toBe(200);
    expect(await overview.json()).toMatchObject({ status: "ok", overview: { user: { email: to, emailVerified: true }, business: { state: "none" } } });

    // Sign out: back to not signed in, the cookie is gone, and the old cookie no longer works.
    await page.goto("/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    expect((await cookiesFor(context, "account.localhost")).some((c) => c.name === "platterly_account_session")).toBe(false);
    await context.addCookies([mine]);
    expect((await page.request.get("/api/account/overview")).status(), "the signed-out session is dead even with its old cookie").toBe(401);
    await page.reload();
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  });

  test("signing in again as the same person reuses the same Account user, and the page they asked for is where they land", async ({ page }) => {
    const to = newEmail();
    await registerAndSignIn(page, to, "/profile");
    await expect(page).toHaveURL("http://account.localhost:3300/profile");
    await expect(page.getByLabel("Email")).toHaveValue(to);
    const first = (await (await page.request.get("/api/account/overview")).json()).overview.user.id;
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/security");
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("http://account.localhost:3300/security");
    expect((await (await page.request.get("/api/account/overview")).json()).overview.user.id).toBe(first);
  });
});

test.describe("Sign-in safety", () => {
  test("a wrong password and an unknown email get the same message; neither signs anyone in", async ({ page }) => {
    const to = newEmail();
    await registerAndSignIn(page, to);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/");
    const message = "The email or password is not right. Check them and try again.";
    await fill(page, "Email", to);
    await fill(page, "Password", "not the password 9");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator(".pl-auth-error")).toHaveText(message);
    await fill(page, "Email", newEmail());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator(".pl-auth-error")).toHaveText(message);
    await shot(page, "f4-7-wrong-password");
    expect((await page.request.get("http://account.localhost:3300/api/account/overview")).status()).toBe(401);
  });

  test("someone who has not verified their email is sent to the verification page, not signed in", async ({ page }) => {
    const to = newEmail();
    await openSignUpFromProduct(page);
    await fill(page, "First name", ("Unverified").split(" ")[0]);
    await fill(page, "Last name", ("Unverified").split(" ").slice(1).join(" ") || "Tester");
    await fill(page, "Phone", "9800000123");
    await fill(page, "Confirm password", PASSWORD);
    await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    expect((await page.request.get("http://account.localhost:3300/api/account/overview")).status()).toBe(401);
  });

  test("an unverified person who signs in is sent a fresh code, so someone who never got one (an imported user) can still verify", async ({ page }) => {
    const to = newEmail();
    const mailCount = async () => ((await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[] }[]).filter((m) => m.to.includes(to) && CODE_SUBJECT.test(m.subject)).length;
    await openSignUpFromProduct(page);
    await fill(page, "First name", ("Never Verified").split(" ")[0]);
    await fill(page, "Last name", ("Never Verified").split(" ").slice(1).join(" ") || "Tester");
    await fill(page, "Phone", "9800000123");
    await fill(page, "Confirm password", PASSWORD);
    await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await codeFor(page, to);
    expect(await mailCount()).toBe(1);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect.poll(mailCount, { message: "a second code is sent when they sign in", timeout: 8000 }).toBe(2);
    await fill(page, "Verification code", await codeFor(page, to));
    await verifyAndSignOut(page);
  });

  test("a wrong code is refused with a clear message", async ({ page }) => {
    const to = newEmail();
    await openSignUpFromProduct(page);
    await fill(page, "First name", ("Wrong Code").split(" ")[0]);
    await fill(page, "Last name", ("Wrong Code").split(" ").slice(1).join(" ") || "Tester");
    await fill(page, "Phone", "9800000123");
    await fill(page, "Confirm password", PASSWORD);
    await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    const real = await codeFor(page, to);
    await fill(page, "Verification code", real === "123456" ? "654321" : "123456");
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page.locator(".pl-auth-error")).toContainText("not right or has expired");
    await shot(page, "f4-8-wrong-code");
  });

  test("a short password is refused before anything is sent", async ({ page }) => {
    await openSignUpFromProduct(page);
    await fill(page, "First name", ("Short Pass").split(" ")[0]);
    await fill(page, "Last name", ("Short Pass").split(" ").slice(1).join(" ") || "Tester");
    await fill(page, "Phone", "9800000123");
    await fill(page, "Confirm password", "short1");
    await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
    await fill(page, "Email", newEmail());
    await fill(page, "Password", "short1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator(".pl-auth-error")).toContainText("at least 8 characters");
  });

  test("a forged Account cookie, a callback without a sign-in in progress, and an off-site next are all refused", async ({ page, context }) => {
    await context.addCookies([{ name: "platterly_account_session", value: "eyJ2IjoxfQ.forged", domain: "account.localhost", path: "/" }]);
    expect((await page.request.get("/api/account/overview")).status()).toBe(401);
    await page.goto("/auth/callback?code=abc&state=xyz");
    await expect(page.getByRole("heading", { name: "We could not sign you in" })).toBeVisible();
    await shot(page, "f4-9-callback-refused");
    const start = await page.request.get("/auth/start?next=https://evil.test/", { maxRedirects: 0 });
    expect(start.status()).toBe(303);
    expect(start.headers().location).toContain("auth.localhost:3300/api/auth/oauth2/authorize");
  });

  test("an off-site next never leaves the account host after a real sign-in", async ({ page }) => {
    const to = newEmail();
    await openSignUpFromProduct(page); // sign-up starts from a product; the off-site next is tried when signing in at the Account below
    await fill(page, "First name", ("Next Test").split(" ")[0]);
    await fill(page, "Last name", ("Next Test").split(" ").slice(1).join(" ") || "Tester");
    await fill(page, "Phone", "9800000123");
    await fill(page, "Confirm password", PASSWORD);
    await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await fill(page, "Verification code", await codeFor(page, to));
    await verifyAndSignOut(page);
    await page.goto("/auth/start?next=//evil.test/steal");
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("http://account.localhost:3300/");
  });

  test("the sign-in pages and the provider API exist only on the auth host, and the account routes only on the account host", async ({ request }) => {
    for (const p of ["/sign-in", "/sign-up", "/verify", "/forgot", "/reset", "/api/auth/ok", "/api/auth/.well-known/openid-configuration"]) {
      for (const host of ["account.localhost:3300", "store.localhost:3300"]) expect((await request.get(`http://${host}${p}`)).status(), `${host}${p}`).toBe(404);
    }
    for (const p of ["/auth/start", "/auth/callback", "/auth/error"]) {
      expect((await request.get(`http://auth.localhost:3300${p}`, { maxRedirects: 0 })).status(), `auth host ${p}`).toBe(404);
    }
    expect((await request.get("http://auth.localhost:3300/sign-in")).status()).toBe(200);
    const signout = await request.post("http://account.localhost:3300/auth/signout", { headers: { origin: "http://evil.test" }, maxRedirects: 0 });
    expect(signout.status(), "a cross-site page cannot sign anyone out").toBe(403);
  });

  test("the provider publishes discovery with PKCE S256 only, and refuses an authorize request for another redirect URI", async ({ request }) => {
    const doc = await (await request.get("http://auth.localhost:3300/api/auth/.well-known/openid-configuration")).json();
    expect(doc.issuer).toBe("http://auth.localhost:3300/api/auth");
    expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
    const q = new URLSearchParams({ response_type: "code", client_id: "platterly-account", redirect_uri: "http://evil.localhost:3300/auth/callback", scope: "openid", state: "s", code_challenge: "x".repeat(43), code_challenge_method: "S256" });
    const res = await request.get(`http://auth.localhost:3300/api/auth/oauth2/authorize?${q}`, { maxRedirects: 0 });
    expect(res.headers().location ?? "").not.toContain("evil.localhost");
  });
});

test.describe("Password reset", () => {
  test("forgot -> emailed code -> new password -> sign in with it; the old password no longer works", async ({ page }) => {
    const to = newEmail();
    await registerAndSignIn(page, to);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await fill(page, "Email", to);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await shot(page, "f4-10-reset-page");
    await fill(page, "Code", await codeFor(page, to), { exact: true });
    await fill(page, "New password", "a brand new pass 5", { exact: true });
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Your password was changed. Sign in with the new one.")).toBeVisible();
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator(".pl-auth-error")).toBeVisible();
    await fill(page, "Password", "a brand new pass 5");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("http://account.localhost:3300/");
    await expect(page.locator(".pa-acct-chip")).toContainText("E2E Person");
  });
});

async function signInSecondDevice(browser: Browser, to: string) {
  const context = await browser.newContext({ baseURL: "http://account.localhost:3300", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".pa-acct-chip")).toContainText("E2E Person");
  return { context, page };
}

test.describe("Signed-in devices (F4.3.1)", () => {
  test("lists this device and the other one, ends the other from here, and signs out everywhere", async ({ page, browser }) => {
    const to = newEmail();
    await registerAndSignIn(page, to);
    const phone = await signInSecondDevice(browser, to);

    await page.goto("/devices");
    const list = page.getByRole("list", { name: "Signed-in devices" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByText("Current device")).toHaveCount(1);
    await expect(list.getByText("Safari on an iPhone")).toBeVisible();
    await expect(page.getByText("Chrome on a Mac").or(page.getByText(/Chrome on/)).first()).toBeVisible();
    await shot(page, "f4-11-devices");

    // End the phone's session from this device: the phone is signed out at once, this device stays signed in.
    await list.getByRole("listitem").filter({ hasText: "Safari on an iPhone" }).getByRole("button", { name: /More about/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    expect((await phone.page.request.get("/api/account/overview")).status()).toBe(401);
    expect((await page.request.get("/api/account/overview")).status()).toBe(200);
    await phone.context.close();

    // Sign out everywhere ends this session too and returns to the start.
    const second = await signInSecondDevice(browser, to);
    await page.reload();
    await expect(page.getByRole("list", { name: "Signed-in devices" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Sign out of all devices" }).click();
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    expect((await second.page.request.get("/api/account/overview")).status()).toBe(401);
    await second.context.close();
  });

  test("the session routes refuse an anonymous caller, a cross-site caller, a malformed body, and another person's session id", async ({ page, browser, request }) => {
    expect((await request.get("/api/account/sessions")).status()).toBe(401);
    expect((await request.post("/api/account/sessions/revoke", { headers: { origin: "http://account.localhost:3300" }, data: { all: true } })).status()).toBe(401);
    expect((await request.post("/api/account/sessions/revoke", { headers: { origin: "http://evil.test" }, data: { all: true } })).status()).toBe(403);
    expect((await request.get("http://store.localhost:3300/api/account/sessions")).status()).toBe(404);

    const [a, b] = [newEmail(), newEmail()];
    await registerAndSignIn(page, a);
    const otherContext = await browser.newContext({ baseURL: "http://account.localhost:3300" });
    const other = { context: otherContext, page: await otherContext.newPage() };
    await registerAndSignIn(other.page, b);
    await expect(other.page.locator(".pa-acct-chip")).toContainText("E2E Person");
    const theirs = (await (await other.page.request.get("/api/account/sessions")).json()).devices[0].id as string;
    const post = (data: unknown, origin = "http://account.localhost:3300") => page.request.post("/api/account/sessions/revoke", { headers: { origin }, data });
    expect((await post({ id: theirs })).status(), "another person's session id").toBe(404);
    expect((await post({ nonsense: 1 })).status()).toBe(400);
    expect((await post({ id: 5 })).status()).toBe(400);
    expect((await other.page.request.get("/api/account/overview")).status(), "their session is untouched").toBe(200);
    await other.context.close();
  });
});
