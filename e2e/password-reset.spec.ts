import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, getLatestResetOtp } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Forgot password (AJ, 2026-10-04): a signed-out person asks for a 6-digit code by email, then chooses a new password.
 * The code is read from the database, as the sign-up spec does, so no inbox is needed.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("forgot password: code by email, new password, sign in with it; a wrong code is refused", async ({ page, context }) => {
  test.setTimeout(150_000);
  const email = `e2e-reset-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Reset", lastName: "Tester", phone: "9800000033" });

  await context.clearCookies(); // signed out
  await page.goto("/");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/kitchenlogin\/forgot-password$/);

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByText(/Resend code in \d+s/)).toBeVisible();

  // A wrong code is refused and the password is not changed
  await page.getByLabel("Enter the code").fill("000000");
  await page.getByLabel("New password", { exact: true }).fill("brand-new-password-1");
  await page.getByLabel("Confirm new password").fill("brand-new-password-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();

  const otp = await getLatestResetOtp(email);
  if (!otp) throw new Error("No password-reset code found");
  await page.getByLabel("Enter the code").clear();
  await page.getByLabel("Enter the code").fill(otp);
  await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible({ timeout: 45_000 });

  await page.getByText("Back to sign in").click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("brand-new-password-1");
  await page.getByRole("button", { name: "Sign in to your account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
});

test("an unsubscribe link that was edited is refused", async ({ page }) => {
  await page.goto("/unsubscribe/not-a-real-customer.abcdefghijklmnopqrstuv");
  await expect(page.getByRole("heading", { name: "This link is not valid" })).toBeVisible();
});
