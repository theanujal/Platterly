import { expect, test } from "@playwright/test";
import { PASSWORD, SINK, fill, newEmail, registerAndSignIn } from "./signed-in";

/** The optional "new sign-in to account" alert, as really signed-in people. Needs the F4 launcher, the identity database and the mail sink. */
const SUBJECT = "New sign-in to your Platterly account";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:120.0) Gecko/20100101 Firefox/120.0";

async function alertsFor(page: import("@playwright/test").Page, to: string) {
  const mails = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string }[];
  return mails.filter((m) => m.to.includes(to) && m.subject === SUBJECT).length;
}
async function signInFromFirefox(browser: import("@playwright/test").Browser, to: string) {
  const other = await (await browser.newContext({ userAgent: FIREFOX })).newPage();
  await other.goto("/security");
  await fill(other, "Email", to);
  await fill(other, "Password", PASSWORD);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByRole("heading", { name: "Security" })).toBeVisible();
  return other;
}

test("a sign-in from a browser not seen before sends the alert, unless the person switched it off", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const to = newEmail();
  await registerAndSignIn(page, to, "/security");
  // The first ever sign-in has nothing to compare with: no alert.
  expect(await alertsFor(page, to)).toBe(0);

  // The same browser again: no alert. A different browser: one alert.
  await signInFromFirefox(browser, to);
  await expect.poll(() => alertsFor(page, to)).toBe(1);

  // Switch it off, then yet another new browser sends nothing.
  await page.goto("/notifications");
  await page.getByRole("switch", { name: "New sign-in to account alert" }).uncheck();
  await page.reload();
  await expect(page.getByRole("switch", { name: "New sign-in to account alert" })).not.toBeChecked();
  const edge = await (await browser.newContext({ userAgent: FIREFOX.replace("Firefox/120.0", "Edg/120.0 Chrome/120.0 Safari/537.36") })).newPage();
  await edge.goto("/security");
  await fill(edge, "Email", to);
  await fill(edge, "Password", PASSWORD);
  await edge.getByRole("button", { name: "Sign in" }).click();
  await expect(edge.getByRole("heading", { name: "Security" })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await alertsFor(page, to)).toBe(1);
});

test("the notifications API refuses a signed-out caller, a cross-site write and a bad body", async ({ request, page }) => {
  expect((await request.get("/api/account/notifications")).status()).toBe(401);
  expect((await request.post("/api/account/notifications", { data: { newsletter: true }, headers: { origin: "http://evil.example" } })).status()).toBe(403);
  await registerAndSignIn(page, newEmail(), "/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  const origin = "http://account.localhost:3300";
  expect((await page.request.post("/api/account/notifications", { data: { newsletter: "yes" }, headers: { origin } })).status()).toBe(400);
  expect((await page.request.post("/api/account/notifications", { data: { userId: "someone-else" }, headers: { origin } })).status()).toBe(400);
});
