import { test, expect } from "@playwright/test";

/**
 * A visitor with no session (never signed in, expired session, old bookmark) who opens a
 * page that needs a login must be sent to sign in, not shown a 500 error page. Single sign-in is Caterly's login, so
 * "sign in" is Platterly's central page (it looks like Caterly's own); this needs the Platform running on auth.localhost:3300.
 */

for (const path of ["/dashboard", "/orders", "/customers", "/settings"]) {
  test(`logged out, ${path} redirects to the caterer sign-in`, async ({ page }) => {
    await page.goto(path);
    // The caterer sign-in is Platterly's central page, which sends the person back to Caterly after signing in.
    await expect(page).toHaveURL(/^https?:\/\/auth\.[^/]+\/sign-in\?/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
  });
}
