import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, SINK, codeFor, fill, newEmail, registerAndSignIn } from "./signed-in";

type Mail = { to: string[]; subject: string; receivedAt: string; html: string };
const mails = async (page: Page) => (await (await page.request.get(`${SINK}/api/messages`)).json()) as Mail[];

test("a person changes their sign-in email: password and code asked, other devices signed out, old address told and able to cancel, new email signs in", async ({ page, browser }) => {
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
  await page.getByRole("button", { name: "Done" }).click();
  // The page now shows the new address and the hold; this device stays signed in, the other one is signed out.
  await expect(page.getByText(next, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/ownership transfers and billing-contact changes are on hold/)).toBeVisible();
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

  // The cancel link: opening it changes nothing; the button puts the old address back and signs everyone out.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(link!);
  await expect(visitor.getByRole("heading", { name: "Cancel the email change?" })).toBeVisible();
  await visitor.getByRole("button", { name: "Yes, cancel the change" }).click();
  await expect(visitor.getByRole("heading", { name: "Email change cancelled" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  const again = await (await browser.newContext()).newPage();
  await again.goto("http://auth.localhost:3300/sign-in");
  await fill(again, "Email", oldEmail);
  await fill(again, "Password", PASSWORD);
  await again.getByRole("button", { name: "Sign in" }).click();
  await expect(again.getByRole("heading", { name: "You are signed in" })).toBeVisible();
  // The same link works only once.
  await visitor.goto(link!);
  await visitor.getByRole("button", { name: "Yes, cancel the change" }).click();
  await expect(visitor.getByText("This change was already cancelled.")).toBeVisible();
});

test("the email routes refuse a signed-out caller, a cross-site caller and bad input; the cancel page needs no session but a real token", async ({ page, request }) => {
  expect((await request.get("/api/account/email")).status()).toBe(401);
  expect((await request.post("/api/account/email", { data: { action: "start" } })).status()).toBe(403);
  expect((await request.post("/api/account/email", { headers: { origin: "http://account.localhost:3300" }, data: { action: "start" } })).status()).toBe(401);
  const cancel = (token: unknown, origin = "http://account.localhost:3300") => request.post("/api/email-change/cancel", { headers: { origin }, data: { token } });
  expect((await cancel("x".repeat(43), "http://evil.localhost:3300")).status()).toBe(403);
  expect((await cancel("x".repeat(43))).status()).toBe(404);
  expect((await cancel(5)).status()).toBe(404);
  await registerAndSignIn(page, newEmail(), "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const post = (data: unknown, origin = "http://account.localhost:3300") => page.request.post("/api/account/email", { headers: { origin }, data });
  expect((await post({ action: "start", password: PASSWORD, email: "a@b.test" }, "http://evil.localhost:3300")).status()).toBe(403);
  expect((await post({ action: "explode" })).status()).toBe(400);
  expect((await post({ action: "start", password: PASSWORD, email: "not an email" })).status()).toBe(422);
  expect((await post({ action: "start", password: "not mine 1", email: "ok@y.test" })).status()).toBe(403);
  expect((await post({ action: "confirm", code: "123456" })).status()).toBe(409);
});
