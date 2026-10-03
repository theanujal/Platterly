import { test, expect } from "@playwright/test";

/**
 * A visitor with no session (never signed in, expired session, old bookmark) who opens a
 * page that needs a login must be sent to sign in, not shown a 500 error page.
 */
const OPS_URL = process.env.PW_OPS_URL ?? "http://ops.localhost:3000";

for (const path of ["/dashboard", "/orders", "/customers", "/settings"]) {
  test(`logged out, ${path} redirects to the caterer sign-in`, async ({ page }) => {
    await page.goto(path);
    // The caterer sign-in is the catering root (AJ, 2026-10-03), no longer /kitchenlogin.
    await expect(page).toHaveURL(/^https?:\/\/catering\.[^/]+\/$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
  });
}

test("logged out, a Super Admin page redirects to the ops sign-in", async ({ page }) => {
  await page.goto(`${OPS_URL}/super/dashboard`);
  await expect(page).toHaveURL(/\/super$/);
  await expect(page.getByText("This page couldn't load")).toHaveCount(0);
});
