import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, getTrialSubscriptionStatus, getLatestEmailOtp } from "./db";
import { maskEmail } from "../src/lib/auth/mask-email";

/**
 * Chunk 4 — first real Playwright coverage in the repo. Runs against the
 * real dev Postgres DB (same convention as the Vitest suite, no mocking);
 * each test cleans up the account/org it creates in `afterEach`.
 *
 * Chunk 5 — deliberately does NOT call `closeDbPool()`: `db.ts`'s pool is a
 * shared module singleton across every spec file in this Playwright worker
 * process (`workers: 1`), and closing it here (this file ran first) left it
 * dead for every spec file that ran afterward, breaking their own db calls.
 * A short-lived test-runner process doesn't need a graceful pool shutdown —
 * the OS reclaims the connections when the process exits.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("sign up, complete the redesigned onboarding wizard, claim a public link, sign out, and sign back in", async ({ page }) => {
  // Longer than the 30s default: the full 5-step wizard + sign-out/sign-in
  // round trip, each action slowed by launchOptions.slowMo (350ms, AJ's
  // standing "watch it run" preference), plus the sidebar shell's added
  // hydration weight on every /dashboard visit this test makes.
  test.setTimeout(100_000);
  const email = `e2e-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const businessName = "Playwright Test Catering";
  // "pw-test-" (8 chars) + a 10-digit suffix keeps this at 18/20 chars —
  // the slug field's maxLength truncated a full Date.now() and broke this
  // assertion on the first pass.
  const claimedSlug = `pw-test-${Date.now().toString().slice(-10)}`;

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Priya");
  await page.getByLabel("Last name").fill("Sharma");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  // Password show/hide toggle (AJ's explicit ask, 2026-09-16) — flip it on
  // and confirm the raw value is actually readable, not just that a click
  // handler exists.
  await page.getByRole("button", { name: "Show password" }).first().click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("correct-horse-battery");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).first().click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();

  // Email OTP verification (AJ's explicit ask, 2026-09-16) — sits between
  // sign-up and onboarding for every new account. Delivery is log-only for
  // now (real provider wiring is Chunk 16's job), so the test reads the
  // plain-text code straight out of Better Auth's own `verification` table,
  // the same way AJ would have to for now without a real inbox.
  await expect(page).toHaveURL(/\/kitchenlogin\/verify-email/);
  await expect(page.getByText(maskEmail(email))).toBeVisible();
  const otp = await getLatestEmailOtp(email);
  expect(otp).toMatch(/^\d{6}$/);
  await page.getByLabel("Enter verification code").fill(otp!);
  await page.getByRole("button", { name: "Verify Email" }).click();

  // Organization is already provisioned at signup — the wizard is reached
  // by an explicit client-side redirect to its own route, not by a
  // server-side "no org yet" check.
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("Priya");
  await expect(page.getByLabel("First name")).toBeDisabled();
  await expect(page.getByLabel("Last name")).toHaveValue("Sharma");
  // Left-panel stage list (redesigned onboarding, AJ 2026-09-14): step 1 is
  // the only one shown as the current stage on load.
  await expect(page.getByText("Getting Started")).toBeVisible();

  await page.getByLabel("Company / business name").fill(businessName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();

  // Every Contact & Address field is now mandatory (AJ, 2026-09-16) —
  // Continue stays disabled until all six are filled.
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByLabel("Street address").fill("221B Baker Street");
  await page.getByLabel("City").fill("Mumbai");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("ZIP code").fill("400001");
  await page.getByLabel("Country", { exact: true }).fill("India");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  // Country-flag phone field (AJ's explicit ask) — defaults to India.
  await page.getByLabel("Mobile number").fill("9876543210");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();

  await page.getByRole("button", { name: "Complete Setup" }).click();
  // Dedicated completion route (AJ's spec, point 10) — a fresh navigation,
  // not the same wizard shell swapping local state.
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding\/complete$/);
  await expect(page.getByText("Your Platterly account is ready!")).toBeVisible({ timeout: 10_000 });

  // Confirm the trial subscription was actually created, not just the UI text.
  expect(await getTrialSubscriptionStatus(email)).toBe("TRIALING");

  await page.getByRole("button", { name: "Take me to my Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // A brand-new org has never claimed a custom link (slugChangeCount === 0),
  // so the Dashboard's custom-link popup auto-opens on this first visit, and
  // the public-menu card shows nothing but a claim prompt — no link, no QR,
  // since there's no real link to show yet (AJ, 2026-09-14). Dismiss the
  // dialog without claiming here (it reappears on the *next* visit, by
  // design) — the claim happens on the second appearance below. While it's
  // open, the modal correctly marks the rest of the page aria-hidden
  // (confirmed accessible-dialog behavior), so role-based queries against
  // the page behind it won't resolve until it's closed.
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  // Seeded with a slugified suggestion from the real business name — never
  // the ugly auto-generated `biz-xxxx` placeholder slug.
  await expect(page.getByLabel("platterly.com/")).not.toHaveValue(/^biz-/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: `Welcome back, ${businessName}` })).toBeVisible();
  await expect(page.getByText("You haven't set your public menu link yet.")).toBeVisible();
  await expect(page.getByAltText("QR code for your public menu link")).not.toBeVisible();

  // Sign out, then sign back in — a fresh session has no active org until
  // requireActiveOrganization() restores it from the existing Member row;
  // this proves that restoration path lands on the Dashboard directly,
  // never back at the onboarding wizard.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in to your account" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in to your account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  // The custom-link popup still hasn't been satisfied, so it reopens here
  // too — this time, actually claim a link and confirm the Dashboard card
  // flips to the claimed state (real link + a real QR code image).
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.getByLabel("platterly.com/").fill(claimedSlug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).not.toBeVisible();
  await expect(page.getByText(claimedSlug)).toBeVisible();
  await expect(page.getByAltText("QR code for your public menu link")).toBeVisible();
});

test("sign-in with the wrong password shows an inline error, not a crash", async ({ page }) => {
  await page.goto("/kitchenlogin");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in to your account" }).click();

  // Next.js's own route announcer (#__next-route-announcer__) is also
  // role="alert", so a bare role query is ambiguous — scope to our own
  // error <p> by its actual text.
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});
