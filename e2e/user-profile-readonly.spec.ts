import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * AJ, 2026-11-10: a person's name, phone and email are managed in their Platterly Account only; Caterly just shows them. This covers Caterly's side:
 * the User Profile page shows the details, has no edit control, and points to the Account. (The Account -> Caterly delivery is covered by the
 * `person.profile` tests in src/modules/platform-link; a browser run of it would sign someone up through the real Platform and leave audit rows.)
 */
const emails: string[] = [];
test.afterEach(async () => {
  const email = emails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("User Profile shows name, phone and email, and cannot be edited here", async ({ page }) => {
  const email = `profile-readonly-${Date.now()}@auth.test`;
  emails.push(email);
  await signUpCaterer(page, email, { firstName: "Asha", lastName: "Rao", phone: "9800000123" });

  await page.goto("/settings/account/user-profile");
  await expect(page.getByRole("heading", { name: "User Profile", level: 1 })).toBeVisible();
  await expect(page.getByText("Asha", { exact: true })).toBeVisible();
  await expect(page.getByText("Rao", { exact: true })).toBeVisible();
  await expect(page.getByText(email).first()).toBeVisible();
  await expect(page.getByText(/9800000123/)).toBeVisible();

  await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("Managed in your Platterly Account")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open your Account/ })).toHaveAttribute("href", /\/profile$/);
});
