import { createHash, randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/** The sign-in system's code emails (approved Caterly layout): the code is read from the email body, not the subject. */
const CODE_SUBJECT = /Account Verification|Reset Your Platterly Password|Confirm Your New Platterly Email|Confirm Your Platterly Recovery Email|Sign-in Code/;


// Shared by the Account specs that need a really signed-in person: registers a new person through the pages, reads the 6-digit code from the local mail
// sink (port 3600) and signs in. `@auth.test` people are removed by apps/platform/scripts/clean-test-people.mjs --apply.
export const SINK = "http://localhost:3600";
export const PASSWORD = "correct horse 7";
/** A registered, plain-looking product to sign up from (sign-up is closed to anyone who does not start from a product). */
const SIGN_UP_PRODUCT = "stub-product";

/**
 * Opens the sign-up page the way a product does: through the identity provider's authorize step (PKCE, as a product sends it), which signs the sign-in page's
 * address, then the page's own "Create an account" link. Sign-up is refused without that signed address (a product name typed into the address is worth nothing).
 * Used by every spec that registers a person, so the product's own server need not be running.
 */
export async function openSignUpFromProduct(page: Page, clientId: string = SIGN_UP_PRODUCT, redirectUri = "http://stub.localhost:3500/auth/callback"): Promise<void> {
  const challenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid email profile", state: "e2e", code_challenge: challenge, code_challenge_method: "S256" });
  await page.goto(`http://auth.localhost:3300/api/auth/oauth2/authorize?${q}`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-up\?/);
}
let counter = 0;
export const newEmail = () => `acct-${Date.now()}-${counter++}@auth.test`;

/** Text typed before the page is interactive is lost when it becomes interactive, so every fill waits for the page's ready marker first. */
export async function fill(page: Page, label: string, value: string, options?: { exact?: boolean }) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true, ...options } : options).fill(value);
}

/** The newest 6-digit code mailed to this address, from the sink (retries while the background send finishes). `after` ignores older messages. */
export async function codeFor(page: Page, to: string, after = ""): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string; html: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && CODE_SUBJECT.test(m.subject) && m.receivedAt > after).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.html.replace(/<[^>]*>/g, " ").match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no code arrived for ${to}`);
}

export async function registerAndSignIn(page: Page, to: string, startPath = "/", name = "E2E Person") {
  // Sign-up is open only to a person who starts from a registered product (the rule of 2026-11-10), so the test person is created as if they came from one
  // (the plain-looking stub product), verifies by the emailed code, and then signs in at the Account like any existing person.
  await openSignUpFromProduct(page);
  await fill(page, "First name", (name).split(" ")[0]);
  await fill(page, "Last name", (name).split(" ").slice(1).join(" ") || "Tester");
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
  await page.goto(startPath);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}
