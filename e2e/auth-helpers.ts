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
