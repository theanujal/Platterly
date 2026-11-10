import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { totpFromUri } from "../src/modules/auth/__tests__/totp-util";
import { PASSWORD, SINK, codeFor, fill, newEmail, registerAndSignIn } from "./signed-in";

// Ops' own database (the "Account reviews" list lives there). Read from apps/ops/.env unless OPS_DATABASE_URL is given.
const opsUrl = () => process.env.OPS_DATABASE_URL ?? /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(__dirname, "../../ops/.env"), "utf8"))![1];
const opsPool = new Pool({ connectionString: opsUrl(), max: 2 });
test.afterAll(async () => { await opsPool.end(); });

type Mail = { to: string[]; subject: string; receivedAt: string; html: string };
const mails = async (page: Page) => (await (await page.request.get(`${SINK}/api/messages`)).json()) as Mail[];

test("a person changes their sign-in email: password and code asked, every device signed out, old address told and able to cancel with a reason, which holds the account until Ops verifies", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const oldEmail = newEmail();
  const other = newEmail(); // a second person, whose address cannot be taken
  const next = `moved-${Date.now()}@auth.test`;
  const bystander = await (await browser.newContext()).newPage();
  await registerAndSignIn(bystander, other, "/security");
  await expect(bystander.getByRole("heading", { name: "Security" })).toBeVisible();

  await registerAndSignIn(page, oldEmail, "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  // A second device of the same person.
  const second = await (await browser.newContext()).newPage();
  await second.goto("/security");
  await fill(second, "Email", oldEmail);
  await fill(second, "Password", PASSWORD);
  await second.getByRole("button", { name: "Sign in" }).click();
  await expect(second.getByRole("heading", { name: "Security" })).toBeVisible();

  await page.getByRole("button", { name: "Change email" }).first().click();
  await page.getByLabel("New email address").fill(other);
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("That address cannot be used. Try another.")).toBeVisible();
  await page.getByLabel("New email address").fill(oldEmail);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("That is already your sign-in email.")).toBeVisible();
  await page.getByLabel("New email address").fill(next);
  await page.getByLabel("Current password").fill("not my password 1");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("That is not your current password.")).toBeVisible();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(page.getByText("That code is not right.")).toBeVisible();
  await page.getByLabel("6-digit code").fill(await codeFor(page, next));
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(page.getByText("Your sign-in email was changed.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /cancel the change for 24 hours/ })).toBeVisible();
  // Every device is signed out, this one too: the person signs in again with the new address.
  await page.getByRole("link", { name: "Sign in again" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await second.reload();
  await expect(second).toHaveURL(/auth\.localhost:3300\/sign-in\?/);

  // The old address got the notice with a cancel link; the new one got a welcome.
  const all = await mails(page);
  const notice = all.find((m) => m.to.includes(oldEmail) && m.subject === "Your Platterly sign-in email was changed");
  expect(notice, "the old address was told").toBeTruthy();
  expect(all.some((m) => m.to.includes(next) && m.subject === "This is now your Platterly sign-in email")).toBe(true);
  const link = notice!.html.match(/http:\/\/account\.localhost:3300\/email-change\/cancel\?token=[A-Za-z0-9_%-]+/)?.[0];
  expect(link, "the notice holds a cancel link").toBeTruthy();

  // Only the new address signs in now.
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto("http://auth.localhost:3300/sign-in");
  await fill(fresh, "Email", oldEmail);
  await fill(fresh, "Password", PASSWORD);
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh.locator(".pl-auth-error")).toBeVisible();
  await fill(fresh, "Email", next);
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh.getByRole("heading", { name: "You are signed in" })).toBeVisible();

  // The cancel link: opening it changes nothing; it asks WHY, and only then puts the old address back, signs everyone out and puts the account on hold.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(link!);
  await expect(visitor.getByRole("heading", { name: "Cancel the email change?" })).toBeVisible();
  await visitor.getByRole("button", { name: "Yes, cancel the change" }).click();
  await expect(visitor.getByText("Choose why you are cancelling.")).toBeVisible();
  await visitor.getByLabel("Other").check();
  await visitor.getByRole("button", { name: "Yes, cancel the change" }).click();
  await expect(visitor.getByText("Choose why you are cancelling.")).toBeVisible(); // Other needs a few words
  await visitor.getByLabel("This was not me").check();
  await visitor.getByLabel(/Anything else/).fill("I never asked for this");
  await visitor.getByRole("button", { name: "Yes, cancel the change" }).click();
  await expect(visitor.getByRole("heading", { name: "Email change cancelled" })).toBeVisible();
  await expect(visitor.getByText(/on hold/)).toBeVisible();

  // Ops was told, with the reason.
  const reviewId = (await opsPool.query('select "reviewId", "oldEmail", "newEmail", "reason", "note", "status" from account_review where "oldEmail" = $1', [oldEmail])).rows;
  await expect.poll(async () => (await opsPool.query('select count(*)::int as n from account_review where "oldEmail" = $1', [oldEmail])).rows[0].n, { timeout: 15_000 }).toBe(1);
  void reviewId;
  const review = (await opsPool.query('select "newEmail", "reason", "note", "status" from account_review where "oldEmail" = $1', [oldEmail])).rows[0];
  expect(review).toEqual({ newEmail: next, reason: "not_me", note: "I never asked for this", status: "OPEN" });

  // The signed-in device is out, and the old address cannot sign in: the account is under review.
  await page.reload();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  const again = await (await browser.newContext()).newPage();
  await again.goto("http://auth.localhost:3300/sign-in");
  await fill(again, "Email", oldEmail);
  await fill(again, "Password", PASSWORD);
  await again.getByRole("button", { name: "Sign in" }).click();
  await expect(again.getByText("Your account is under review.")).toBeVisible();
  await expect(again.getByRole("heading", { name: "You are signed in" })).toHaveCount(0);

  // Ops staff verify the person (the "Account reviews" button sets exactly this); the next sign-in works and the hold is gone for good.
  await opsPool.query(`update account_review set status = 'CLEARED', "clearedAt" = now() where "oldEmail" = $1`, [oldEmail]);
  await again.getByRole("button", { name: "Sign in" }).click();
  await expect(again.getByRole("heading", { name: "You are signed in" })).toBeVisible();
  // The same link works only once.
  await visitor.goto(link!);
  await visitor.getByLabel("This was not me").check();
  await visitor.getByRole("button", { name: "Yes, cancel the change" }).click();
  await expect(visitor.getByText("This change was already cancelled.")).toBeVisible();
  await opsPool.query('delete from account_review where "oldEmail" = $1', [oldEmail]);
  await opsPool.query(`delete from notification where kind = 'account.review' and body like $1`, [`%${oldEmail}%`]);
});

test("with two-step verification on, the change needs the authenticator code too; a wrong one is refused", async ({ page }) => {
  test.setTimeout(120_000);
  const to = newEmail();
  await registerAndSignIn(page, to, "/security");
  await page.getByRole("button", { name: "Set up" }).click();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = (await page.locator("code").first().textContent())!.trim();
  const now = () => totpFromUri(`otpauth://totp/x?secret=${secret}`);
  await page.getByLabel("6-digit code").fill(now());
  await page.getByRole("button", { name: "Turn on" }).click();
  await page.getByRole("button", { name: "I have saved them" }).click();

  await page.getByRole("button", { name: "Change email" }).first().click();
  await page.getByLabel("New email address").fill(`moved-${Date.now()}@auth.test`);
  await page.getByLabel("Current password").fill(PASSWORD);
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send code" })).toBeDisabled();
  await page.getByLabel("Authenticator code").fill("000000");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("That authenticator code is not right.")).toBeVisible();
  await page.getByLabel("Authenticator code").fill(now());
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible(); // the code went to the new address
});

test("a change whose code is never entered changes nothing, and the old address is told once", async ({ page, request }) => {
  test.setTimeout(90_000);
  const to = newEmail();
  await registerAndSignIn(page, to, "/security");
  await page.getByRole("button", { name: "Change email" }).first().click();
  await page.getByLabel("New email address").fill(`unused-${Date.now()}@auth.test`);
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  // The code runs out unused.
  const identity = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 1 });
  await identity.query(`update "emailChange" set "codeExpiresAt" = now() - interval '1 minute' where "oldEmail" = $1 and "status" = 'pending'`, [to]).finally(() => identity.end());
  const cron = () => request.post("http://auth.localhost:3300/api/cron/account", { headers: { authorization: `Bearer ${readFileSync(process.env.CRON_SECRET_FILE!, "utf8").trim()}` } });
  expect(((await (await cron()).json()) as { expiredChangeNotices: number }).expiredChangeNotices).toBeGreaterThanOrEqual(1);
  expect(((await (await cron()).json()) as { expiredChangeNotices: number }).expiredChangeNotices).toBe(0); // only once
  const sent = (await mails(page)).filter((m) => m.to.includes(to) && m.subject === "Someone tried to change your Platterly sign-in email");
  expect(sent).toHaveLength(1);
  // Nothing changed: the person still signs in with the old address.
  await page.goto("/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
});

test("the email routes refuse a signed-out caller, a cross-site caller and bad input; the cancel page needs no session but a real token", async ({ page, request }) => {
  expect((await request.get("/api/account/email")).status()).toBe(401);
  expect((await request.post("/api/account/email", { data: { action: "start" } })).status()).toBe(403);
  expect((await request.post("/api/account/email", { headers: { origin: "http://account.localhost:3300" }, data: { action: "start" } })).status()).toBe(401);
  const cancel = (token: unknown, origin = "http://account.localhost:3300") => request.post("/api/email-change/cancel", { headers: { origin }, data: { token, reason: { code: "not_me", note: "" } } });
  expect((await cancel("x".repeat(43), "http://evil.localhost:3300")).status()).toBe(403);
  expect((await cancel("x".repeat(43))).status()).toBe(404);
  expect((await cancel(5)).status()).toBe(404);
  // A real-looking token without a reason is refused before anything is looked up.
  expect((await request.post("/api/email-change/cancel", { headers: { origin: "http://account.localhost:3300" }, data: { token: "x".repeat(43) } })).status()).toBe(422);
  await registerAndSignIn(page, newEmail(), "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const post = (data: unknown, origin = "http://account.localhost:3300") => page.request.post("/api/account/email", { headers: { origin }, data });
  expect((await post({ action: "start", password: PASSWORD, email: "a@b.test" }, "http://evil.localhost:3300")).status()).toBe(403);
  expect((await post({ action: "explode" })).status()).toBe(400);
  expect((await post({ action: "start", password: PASSWORD, email: "not an email" })).status()).toBe(422);
  expect((await post({ action: "start", password: "not mine 1", email: "ok@y.test" })).status()).toBe(403);
  expect((await post({ action: "confirm", code: "123456" })).status()).toBe(409);
});
