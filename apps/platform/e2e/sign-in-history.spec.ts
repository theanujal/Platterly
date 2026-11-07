import { expect, test } from "@playwright/test";
import { PASSWORD, fill, newEmail, registerAndSignIn } from "./signed-in";

/** Sign-in history on the Security page, as a really signed-in person. */
test("the Security page lists this person's sign-ins and a refused password, newest first, with no address shown", async ({ page, browser }) => {
  const to = newEmail();
  await registerAndSignIn(page, to, "/security");
  await expect(page.getByRole("heading", { name: "Sign-in history" })).toBeVisible();
  const history = page.getByRole("list", { name: "Sign-in history" });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history.getByText("Signed in")).toBeVisible();

  // Another browser tries a wrong password, then signs in properly.
  const other = await (await browser.newContext()).newPage();
  await other.goto("/security");
  await fill(other, "Email", to);
  await fill(other, "Password", "not my password 1");
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.locator(".pl-auth-error")).toBeVisible();
  await fill(other, "Password", PASSWORD);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByRole("heading", { name: "Security" })).toBeVisible();

  await page.reload();
  const items = page.getByRole("list", { name: "Sign-in history" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Signed in");
  await expect(items.nth(1)).toContainText("Wrong password");
  await expect(items.nth(2)).toContainText("Signed in");
  await expect(page.getByRole("list", { name: "Sign-in history" })).not.toContainText(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|127\.0\.0\.1|::1/);
});

test("the sign-in history route answers 401 to a signed-out caller and accepts no user in the query", async ({ request }) => {
  expect((await request.get("/api/account/sign-in-history")).status()).toBe(401);
  expect((await request.get("/api/account/sign-in-history?userId=someone")).status()).toBe(401);
});
