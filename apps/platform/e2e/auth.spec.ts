import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * F4 sign-in, end to end in a real browser against the running Platform dev server (account.localhost:3300 and auth.localhost:3300), its identity
 * database and the local mail sink on port 3600 (no email leaves the machine). Nothing is intercepted and no user is faked: every test registers a
 * new person through the pages and reads the 6-digit code from the sink. Run with the F4 launcher (~/.platterly/f4dev/dev.sh); set
 * ACCOUNT_SHOTS=<dir> to save screenshots.
 */
const SINK = "http://localhost:3600";
const SHOTS = process.env.ACCOUNT_SHOTS;
const PASSWORD = "correct horse 7";
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};
/** Text typed before the page is interactive is lost when it becomes interactive, so every fill waits for the page's ready marker first. */
async function fill(page: Page, label: string, value: string, options?: { exact?: boolean }) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, options).fill(value);
}
let counter = 0;
const newEmail = () => `e2e-${Date.now()}-${counter++}@auth.test`;

/** The newest code mailed to this address, from the sink (retries while the background send finishes). */
async function codeFor(page: Page, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await page.request.get(`${SINK}/api/messages`);
    const messages = (await res.json()) as { to: string[]; subject: string; receivedAt: string }[];
    const mine = messages.filter((m) => m.to.includes(to)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.subject.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no code arrived for ${to}`);
}

/** From the Account's "Sign in" button to a registered, verified, signed-in person back on the Account. */
async function registerAndSignIn(page: Page, to: string, startPath = "/") {
  await page.goto(startPath);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "Full name", "E2E Person");
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

const cookiesFor = async (context: BrowserContext, host: string) => (await context.cookies()).filter((c) => c.domain === host || c.domain === `.${host}`);

test.describe("Sign-in journey", () => {
  test("not signed in -> register -> verify by emailed code -> sign in -> Account shows the real person -> sign out", async ({ page, context }) => {
    const to = newEmail();
    await page.goto("/");
    await expect(page.getByRole("region", { name: "You are not signed in" })).toBeVisible();
    await shot(page, "f4-1-account-not-signed-in");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await shot(page, "f4-2-sign-in-page");
    await page.getByRole("link", { name: "Create an account" }).click();
    await shot(page, "f4-3-sign-up-page");
    await fill(page, "Full name", "E2E Person");
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(`Enter the code we sent to ${to}.`)).toBeVisible();
    await expect(page.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
    await shot(page, "f4-4-verify-page");
    await fill(page, "Verification code", await codeFor(page, to));
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page.getByText("Your email is verified. You can sign in now.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Back on the Account, signed in, with the person's real email and no business yet.
    await expect(page).toHaveURL("http://account.localhost:3300/");
    await expect(page.getByRole("heading", { level: 3, name: to })).toBeVisible();
    await expect(page.locator(".pa-acct-chip")).toContainText(to);
    await expect(page.getByText("Email verified").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "No business yet" })).toBeVisible();
    await expect(page.getByRole("region", { name: "You are not signed in" })).toHaveCount(0);
    await shot(page, "f4-5-account-signed-in");
    for (const p of ["/business", "/products", "/profile", "/security"]) {
      await page.goto(p);
      await expect(page.locator(".pa-acct-chip")).toContainText(to);
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
    await expect(page.getByRole("region", { name: "You are not signed in" })).toBeVisible();
    expect((await cookiesFor(context, "account.localhost")).some((c) => c.name === "platterly_account_session")).toBe(false);
    await context.addCookies([mine]);
    expect((await page.request.get("/api/account/overview")).status(), "the signed-out session is dead even with its old cookie").toBe(401);
    await page.reload();
    await expect(page.getByRole("region", { name: "You are not signed in" })).toBeVisible();
  });

  test("signing in again as the same person reuses the same Account user, and the page they asked for is where they land", async ({ page }) => {
    const to = newEmail();
    await registerAndSignIn(page, to, "/profile");
    await expect(page).toHaveURL("http://account.localhost:3300/profile");
    await expect(page.getByLabel("Email")).toHaveValue(to);
    const first = (await (await page.request.get("/api/account/overview")).json()).overview.user.id;
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/security");
    await page.getByRole("link", { name: "Sign in" }).click();
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
    await page.getByRole("link", { name: "Sign in" }).click();
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
    await page.goto("/");
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByRole("link", { name: "Create an account" }).click();
    await fill(page, "Full name", "Unverified");
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

  test("a wrong code is refused with a clear message", async ({ page }) => {
    const to = newEmail();
    await page.goto("/");
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByRole("link", { name: "Create an account" }).click();
    await fill(page, "Full name", "Wrong Code");
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
    await page.goto("/");
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByRole("link", { name: "Create an account" }).click();
    await fill(page, "Full name", "Short Pass");
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
    await page.goto("/auth/start?next=//evil.test/steal");
    await page.getByRole("link", { name: "Create an account" }).click();
    await fill(page, "Full name", "Next Test");
    await fill(page, "Email", to);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await fill(page, "Verification code", await codeFor(page, to));
    await page.getByRole("button", { name: "Verify email" }).click();
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
    await page.getByRole("link", { name: "Sign in" }).click();
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
    await expect(page.locator(".pa-acct-chip")).toContainText(to);
  });
});

async function signInSecondDevice(browser: Browser, to: string) {
  const context = await browser.newContext({ baseURL: "http://account.localhost:3300", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".pa-acct-chip")).toContainText(to);
  return { context, page };
}

test.describe("Signed-in devices (F4.3.1)", () => {
  test("lists this device and the other one, ends the other from here, and signs out everywhere", async ({ page, browser }) => {
    const to = newEmail();
    await registerAndSignIn(page, to);
    const phone = await signInSecondDevice(browser, to);

    await page.goto("/security");
    const list = page.getByRole("list", { name: "Signed-in devices" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByText("This device")).toHaveCount(1);
    await expect(list.getByText("Safari on an iPhone")).toBeVisible();
    await expect(page.getByText("Chrome on a Mac").or(page.getByText(/Chrome on/)).first()).toBeVisible();
    await shot(page, "f4-11-devices");

    // End the phone's session from this device: the phone is signed out at once, this device stays signed in.
    await list.getByRole("listitem").filter({ hasText: "Safari on an iPhone" }).getByRole("button", { name: "Sign out" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    expect((await phone.page.request.get("/api/account/overview")).status()).toBe(401);
    expect((await page.request.get("/api/account/overview")).status()).toBe(200);
    await phone.context.close();

    // Sign out everywhere ends this session too and returns to the start.
    const second = await signInSecondDevice(browser, to);
    await page.reload();
    await expect(page.getByRole("list", { name: "Signed-in devices" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page.getByRole("region", { name: "You are not signed in" })).toBeVisible();
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
    await expect(other.page.locator(".pa-acct-chip")).toContainText(b);
    const theirs = (await (await other.page.request.get("/api/account/sessions")).json()).devices[0].id as string;
    const post = (data: unknown, origin = "http://account.localhost:3300") => page.request.post("/api/account/sessions/revoke", { headers: { origin }, data });
    expect((await post({ id: theirs })).status(), "another person's session id").toBe(404);
    expect((await post({ nonsense: 1 })).status()).toBe(400);
    expect((await post({ id: 5 })).status()).toBe(400);
    expect((await other.page.request.get("/api/account/overview")).status(), "their session is untouched").toBe(200);
    await other.context.close();
  });
});
