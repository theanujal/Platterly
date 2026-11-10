import { expect, test, type Page } from "@playwright/test";
import { totpFromUri } from "../src/modules/auth/__tests__/totp-util";
import { PASSWORD, SINK, fill, newEmail, registerAndSignIn } from "./signed-in";

const codeNow = (secret: string) => totpFromUri(`otpauth://totp/x?secret=${secret}`);

async function turnOn(page: Page): Promise<{ secret: string; backup: string[] }> {
  await page.goto("/security");
  await page.getByRole("button", { name: "Set up" }).click();
  await page.getByLabel("Current password").fill("not my password 1");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That is not your current password.")).toBeVisible();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const secret = (await page.locator("code").first().textContent())!.trim();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("That code is not right.")).toBeVisible();
  await page.getByLabel("6-digit code").fill(codeNow(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Two-step verification is on. Save these backup codes")).toBeVisible();
  const backup = await page.getByRole("list", { name: "Backup codes" }).getByRole("listitem").allTextContents();
  expect(backup.length).toBeGreaterThanOrEqual(5);
  await page.getByRole("button", { name: "I have saved them" }).click();
  return { secret, backup };
}

/** Signs out through the Account and comes back to the sign-in page. */
async function signOut(page: Page) {
  await page.goto("/profile"); // the sidebar's Sign out button is the only one on this page (Security also lists a Sign out per device)
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
}
async function passwordStep(page: Page, to: string) {
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("two-step verification: set up, still signed in, then a code is asked at sign-in; wrong code refused; right code, backup code and 'trust this device' work; turn off", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const to = newEmail();
  await registerAndSignIn(page, to, "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const { secret, backup } = await turnOn(page);
  // Setting it up replaced the provider session, but the person stays signed in at the Account.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  const mails = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string }[];
  expect(mails.some((m) => m.to.includes(to) && m.subject.includes("Two-step verification was turned on"))).toBe(true);

  // A fresh browser: the password alone no longer signs in.
  const other = await (await browser.newContext()).newPage();
  await other.goto("/security");
  await passwordStep(other, to);
  await expect(other.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Security" })).toHaveCount(0);
  await fill(other, "Authentication code", "000000");
  await other.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(other.getByText("That code is not right.")).toBeVisible();
  await other.getByLabel("Authentication code").fill(codeNow(secret));
  await other.getByLabel(/^Trust this device/).check();
  await other.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(other.getByRole("heading", { name: "Security" })).toBeVisible();
  // Trusted device: signing out and in again on that browser skips the code.
  await signOut(other);
  await passwordStep(other, to);
  await expect(other.getByRole("navigation", { name: "Account" })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Two-step verification" })).toHaveCount(0);

  // The trusted device is listed under Security and can be removed; after that the code is asked again.
  await other.goto("/devices");
  const trusted = other.getByRole("region", { name: "Trusted devices" });
  await expect(trusted.getByRole("listitem")).toHaveCount(1);
  await expect(trusted.getByRole("listitem")).toContainText("Chrome");
  await trusted.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(trusted.getByText("No trusted devices.")).toBeVisible();
  await signOut(other);
  await passwordStep(other, to);
  await expect(other.getByRole("heading", { name: "Two-step verification" })).toBeVisible();

  // Another browser that is not trusted: a backup code works once.
  const third = await (await browser.newContext()).newPage();
  await third.goto("/security");
  await passwordStep(third, to);
  await third.getByRole("button", { name: "Use a backup code" }).click();
  await third.getByLabel("Backup code").fill(backup[0].trim());
  await third.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(third.getByRole("heading", { name: "Security" })).toBeVisible();
  await signOut(third);
  await passwordStep(third, to);
  await third.getByRole("button", { name: "Use a backup code" }).click();
  await third.getByLabel("Backup code").fill(backup[0].trim());
  await third.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(third.getByText("That backup code is not right, or it was already used.")).toBeVisible();

  // Turn it off: the password is asked, and then the password alone signs in again.
  await page.getByRole("button", { name: "Turn off" }).click();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Turn off two-step verification" }).click();
  await expect(page.getByText("Two-step verification is off.")).toBeVisible();
  const fourth = await (await browser.newContext()).newPage();
  await fourth.goto("/security");
  await passwordStep(fourth, to);
  await expect(fourth.getByRole("heading", { name: "Security" })).toBeVisible();
});

test("the two-step route refuses a signed-out caller, a cross-site caller and an unknown action", async ({ page, request }) => {
  expect((await request.get("/api/account/two-factor")).status()).toBe(401);
  expect((await request.post("/api/account/two-factor", { data: { action: "start", password: "x" } })).status()).toBe(403);
  expect((await request.post("/api/account/two-factor", { headers: { origin: "http://account.localhost:3300" }, data: { action: "start", password: "x" } })).status()).toBe(401);
  await registerAndSignIn(page, newEmail(), "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const post = (data: unknown, origin = "http://account.localhost:3300") => page.request.post("/api/account/two-factor", { headers: { origin }, data });
  expect((await post({ action: "start", password: PASSWORD }, "http://evil.localhost:3300")).status()).toBe(403);
  expect((await post({ action: "explode" })).status()).toBe(400);
  expect((await post({ action: "start", password: "not mine 1" })).status()).toBe(403);
  expect((await post({ action: "confirm", code: "abc" })).status()).toBe(422);
  expect(await (await page.request.get("/api/account/two-factor")).json()).toMatchObject({ enabled: false });
});

test("changing the sign-in email accepts a backup code once, and refuses a wrong or used one", async ({ page }) => {
  test.setTimeout(60_000);
  const to = newEmail();
  await registerAndSignIn(page, to, "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const { backup } = await turnOn(page);
  const origin = "http://account.localhost:3300";
  const start = (extra: Record<string, string>) =>
    page.request.post("/api/account/email", { headers: { origin }, data: { action: "start", password: PASSWORD, email: newEmail(), ...extra } });
  // No second step at all: refused.
  expect((await start({})).status()).toBe(403);
  // A wrong backup code is refused; a real one is accepted; the same one cannot be used again.
  const wrong = await start({ backupCode: "0000-0000" });
  expect(wrong.status()).toBe(403);
  expect((await wrong.json()).status).toBe("wrong_backup_code");
  expect((await start({ backupCode: backup[0].trim() })).status()).toBe(200);
  expect((await start({ backupCode: backup[0].trim() })).status()).toBe(403);
});
