import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { getLatestEmailOtp } from "./db";

/**
 * Every sign-up (fresh caterer or invited teammate) now lands on
 * `/kitchenlogin/verify-email` before reaching its real destination (AJ's
 * explicit ask, 2026-09-16). Delivery is log-only for now, so this reads
 * the plain-text code straight out of Better Auth's own `verification`
 * table (see `db.ts`'s `getLatestEmailOtp`) — the same way AJ has to for
 * now without a real inbox. Call this right after the sign-up form's
 * submit button, in place of whatever direct "land on the next page"
 * assertion used to follow it.
 */
export async function verifyEmailViaOtp(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(/\/kitchenlogin\/verify-email/);
  const otp = await getLatestEmailOtp(email);
  if (!otp) throw new Error(`No email-verification OTP found for ${email} — check the verification table.`);
  await page.getByLabel("Enter verification code").fill(otp);
  await page.getByRole("button", { name: "Verify Email" }).click();
}


export interface SignUpOptions {
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Dismiss the "Claim your custom link" dialog a fresh Dashboard opens. Default true; the storefront spec needs it open. */
  closeClaimDialog?: boolean;
}

/**
 * Sign up a fresh caterer through the real form, verify the email code, skip onboarding and land on
 * the Dashboard. Every spec used to carry its own copy of these ~15 steps (each one slowed by
 * `slowMo`), so this is the single place to change when the sign-up flow changes.
 */
export async function signUpCaterer(page: Page, email: string, options: SignUpOptions = {}): Promise<void> {
  const { firstName = "E2E", lastName = "Tester", phone = "9800000099", closeClaimDialog = true } = options;
  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone", { exact: true }).fill(phone);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  if (closeClaimDialog) await page.getByRole("button", { name: "Close" }).click();
}
