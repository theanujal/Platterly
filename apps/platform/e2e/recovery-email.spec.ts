import { expect, test } from "@playwright/test";
import { PASSWORD, SINK, codeFor, fill, newEmail, registerAndSignIn } from "./signed-in";

type Mail = { to: string[]; subject: string; receivedAt: string };
const mails = async (page: import("@playwright/test").Page) => (await (await page.request.get(`${SINK}/api/messages`)).json()) as Mail[];

test("a recovery email is added with a code to that address, then a password reset can be sent to it instead of the main email", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const main = newEmail();
  const recovery = `recovery-${Date.now()}@auth.test`;
  await registerAndSignIn(page, main, "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();

  await page.getByRole("button", { name: "Add recovery email" }).click();
  await page.getByLabel("Recovery email address").fill(main);
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("The recovery email must be different from the email you sign in with.")).toBeVisible();
  await page.getByLabel("Recovery email address").fill(recovery);
  await page.getByLabel("Current password").fill("not my password 1");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("That is not your current password.")).toBeVisible();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  // The code goes to the recovery address; a wrong one is refused; the right one confirms it.
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("That code is not right.")).toBeVisible();
  await page.getByLabel("6-digit code").fill(await codeFor(page, recovery));
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Your recovery email is set.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(recovery)).toBeVisible();
  expect((await mails(page)).some((m) => m.to.includes(main) && m.subject === "Your Platterly recovery email changed")).toBe(true);

  // Forgot password on a fresh browser: "I cannot reach this email" sends the reset code to the recovery address only.
  const before = new Date().toISOString();
  const other = await (await browser.newContext()).newPage();
  await other.goto("http://auth.localhost:3300/forgot"); // a full page load, so the form is ready when the field is filled
  await fill(other, "Email", main);
  await other.getByRole("button", { name: "I cannot reach this email: use my recovery email" }).click();
  await expect(other.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(other.getByText("If that account has a recovery email, a code is on its way to it.")).toBeVisible();
  const code = await codeFor(other, recovery, before);
  expect((await mails(other)).filter((m) => m.to.includes(main) && m.receivedAt > before), "nothing new went to the main email").toEqual([]);
  await fill(other, "Code", code, { exact: true });
  await fill(other, "New password", "a brand new pass 5", { exact: true });
  await other.getByRole("button", { name: "Change password" }).click();
  await expect(other.getByText("Your password was changed. Sign in with the new one.")).toBeVisible();
  await fill(other, "Password", "a brand new pass 5");
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByRole("heading", { name: "You are signed in" })).toBeVisible();

  // Removing it: the password is asked (the reset changed it), and the recovery route then sends nothing.
  await other.goto("http://account.localhost:3300/security");
  await expect(other.getByRole("heading", { name: "Security" })).toBeVisible();
  await other.getByRole("button", { name: "Remove", exact: true }).click();
  await other.getByLabel("Current password").fill("a brand new pass 5");
  await other.getByRole("button", { name: "Remove recovery email" }).click();
  await expect(other.getByText("Your recovery email was removed.")).toBeVisible();
  const afterRemoval = new Date().toISOString();
  expect((await other.request.post("http://auth.localhost:3300/api/recovery/send", { headers: { origin: "http://auth.localhost:3300" }, data: { email: `${main}` } })).status()).toBe(200);
  await other.waitForTimeout(800);
  expect((await mails(other)).filter((m) => m.to.includes(recovery) && m.receivedAt > afterRemoval), "nothing more is sent to the removed address").toEqual([]);
});

test("the recovery route gives the same answer for everyone and mails nothing for a person with no recovery email", async ({ page, request }) => {
  const person = newEmail();
  await registerAndSignIn(page, person, "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const before = new Date().toISOString();
  const send = (email: string, origin = "http://auth.localhost:3300") => request.post("http://auth.localhost:3300/api/recovery/send", { headers: { origin }, data: { email } });
  for (const email of [person, `nobody-${Date.now()}@auth.test`, ""]) {
    const res = await send(email);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  }
  expect((await send(person, "http://evil.localhost:3300")).status()).toBe(403);
  expect((await request.post("http://account.localhost:3300/api/recovery/send", { headers: { origin: "http://account.localhost:3300" }, data: { email: person } })).status()).toBe(404);
  await page.waitForTimeout(800);
  expect((await mails(page)).filter((m) => m.receivedAt > before && m.subject.startsWith("Your Platterly code")), "no reset code was mailed to anyone").toEqual([]);
});

test("the recovery-email account route refuses a signed-out caller, a cross-site caller and an unknown action", async ({ page, request }) => {
  expect((await request.get("/api/account/recovery-email")).status()).toBe(401);
  expect((await request.post("/api/account/recovery-email", { data: { action: "start" } })).status()).toBe(403);
  expect((await request.post("/api/account/recovery-email", { headers: { origin: "http://account.localhost:3300" }, data: { action: "start" } })).status()).toBe(401);
  await registerAndSignIn(page, newEmail(), "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const post = (data: unknown, origin = "http://account.localhost:3300") => page.request.post("/api/account/recovery-email", { headers: { origin }, data });
  expect((await post({ action: "start", password: PASSWORD, email: "a@b.test" }, "http://evil.localhost:3300")).status()).toBe(403);
  expect((await post({ action: "explode" })).status()).toBe(400);
  expect((await post({ action: "start", password: PASSWORD, email: "not an email" })).status()).toBe(422);
  expect((await post({ action: "confirm", code: "123456" })).status()).toBe(409);
});
