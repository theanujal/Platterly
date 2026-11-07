import { expect, test } from "@playwright/test";
import { PASSWORD, SINK, fill, newEmail, registerAndSignIn } from "./signed-in";

/** Change password in the Account, as a really signed-in person (nothing intercepted). */
test("changing the password needs the current one, signs the other device out, keeps this one, and only the new password signs in afterwards", async ({ page, browser }) => {
  const to = newEmail();
  await registerAndSignIn(page, to, "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();

  // A second device is signed in too.
  const other = await (await browser.newContext()).newPage();
  await registerOrSignIn(other, to);

  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByLabel("Current password").fill("not my password 1");
  await page.getByLabel("New password", { exact: true }).fill("a brand new pass 5");
  await page.getByLabel("Confirm new password").fill("a brand new pass 5");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("That is not your current password.")).toBeVisible();

  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("Confirm new password").fill("different pass 6");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The two new passwords do not match.")).toBeVisible();

  await page.getByLabel("Confirm new password").fill("a brand new pass 5");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password was changed. You were signed out on 1 other device.")).toBeVisible();
  // This device is still signed in; the other one is not.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await other.reload();
  await expect(other).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  // The person is told by email.
  const mails = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string }[];
  expect(mails.some((m) => m.to.includes(to) && m.subject === "Your Platterly password was changed")).toBe(true);

  // Only the new password signs in.
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto("/");
  await fill(fresh, "Email", to);
  await fill(fresh, "Password", PASSWORD);
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh.locator(".pl-auth-error")).toHaveText("The email or password is not right. Check them and try again.");
  await fill(fresh, "Password", "a brand new pass 5");
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("the password route refuses a signed-out caller, a cross-site caller and a missing body", async ({ page, request }) => {
  expect((await request.post("/api/account/password", { data: { current: "a", next: "b" } })).status()).toBe(403);
  expect((await request.post("/api/account/password", { headers: { origin: "http://account.localhost:3300" }, data: { current: "a", next: "b" } })).status()).toBe(401);
  await registerAndSignIn(page, newEmail(), "/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  const post = (headers: Record<string, string>, data: unknown) => page.request.post("/api/account/password", { headers, data });
  expect((await post({ origin: "http://evil.localhost:3300" }, { current: PASSWORD, next: "another pass 7" })).status()).toBe(403);
  expect((await post({ origin: "http://account.localhost:3300" }, { current: PASSWORD, next: "short" })).status()).toBe(422);
  expect((await post({ origin: "http://account.localhost:3300" }, { current: PASSWORD, next: PASSWORD })).status()).toBe(422);
});

/** Signs the same person in on another browser: the sign-in page, then the Account. */
async function registerOrSignIn(page: import("@playwright/test").Page, to: string) {
  await page.goto("/security");
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
}
