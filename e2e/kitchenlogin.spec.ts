import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, getTrialSubscriptionStatus } from "./db";
import { centralFill, codeFromSink, fillWizardBusinessName, signInOnCentralPage, signOutFromMenu, signUpCaterer, signUpOnCentralPage } from "./auth-helpers";

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
  test.setTimeout(150_000);
  const email = `e2e-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const businessName = "Playwright Test Catering";
  // "pw-test-" (8 chars) + a 10-digit suffix keeps this at 18/60 chars —
  // the slug field's maxLength truncated a full Date.now() and broke this
  // assertion on the first pass.
  const claimedSlug = `pw-test-${Date.now().toString().slice(-10)}`;

  // Sign-up, email verification and sign-in all happen on Platterly's central pages (Caterly sends a signed-out visitor there); the person comes back
  // signed in, straight to the onboarding wizard.
  await page.goto("/");
  await signUpOnCentralPage(page, { email, firstName: "Priya", lastName: "Sharma", phone: "9800000099" });

  // Organization is already provisioned at signup — the wizard is reached
  // by an explicit client-side redirect to its own route, not by a
  // server-side "no org yet" check.
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  // Nothing to go back to on the first step (AJ, 2026-10-13).
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("First name")).toHaveValue("Priya");
  await expect(page.getByLabel("Last name")).toHaveValue("Sharma");
  // Left-panel stage list (redesigned onboarding, AJ 2026-09-14): step 1 is
  // the only one shown as the current stage on load.
  await expect(page.getByText("Getting Started")).toBeVisible();

  // The name carried over from sign-up is read-only but not faded: full-strength text so it can be read and copied (AJ, 2026-10-14).
  const firstName = page.getByLabel("First name");
  await expect(firstName).toHaveAttribute("readonly", "");
  await expect(firstName).toBeEnabled();
  await expect(firstName).toHaveCSS("opacity", "1");
  await fillWizardBusinessName(page, businessName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();

  // Every Contact & Address field is now mandatory (AJ, 2026-09-16) —
  // Continue stays disabled until all five are filled. The Mobile number
  // is back on this step (AJ, 2026-10-13), pre-filled with the sign-up phone.
  await expect(page.getByLabel("Mobile number")).toHaveValue("+91 98000 00099");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByLabel("Street address").fill("221B Baker Street");
  // City and State are plain fields: no map-pin (Street address, ZIP and Country keep theirs).
  await expect(page.locator("div:has(> #city) svg")).toHaveCount(0);
  await expect(page.locator("div:has(> #state) svg")).toHaveCount(0);
  await expect(page.locator("div:has(> #addressLine1) svg")).toHaveCount(1);
  await page.getByLabel("City").fill("Mumbai");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("ZIP code").fill("400001");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByLabel("Country", { exact: true }).fill("India");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();

  // The GST rate and type only appear once a GST number is typed; order numbering is always there.
  await expect(page.getByLabel("GST rate (%)")).toHaveCount(0);
  await page.getByLabel("GST number (optional)").fill("29ABCDE1234F1Z5");
  await expect(page.getByLabel("GST rate (%)")).toHaveValue("5");
  await page.getByLabel("GST rate (%)").fill("12");
  await page.getByLabel("GST type").click();
  await page.getByRole("option", { name: "IGST" }).click();
  await page.getByLabel("Prefix").fill("kit");
  await page.getByLabel("Starting number").fill("101");
  await expect(page.getByText("KIT-0101")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  // Online presence fields show where to type: an icon and an example in each (AJ, 2026-10-14).
  for (const [id, placeholder] of [["websiteUrl", "https://yourwebsite.com"], ["instagramUrl", "https://instagram.com/yourkitchen"], ["facebookUrl", "https://facebook.com/yourkitchen"], ["linkedinUrl", "https://linkedin.com/company/yourkitchen"]]) {
    await expect(page.locator(`#${id}`)).toHaveAttribute("placeholder", placeholder);
    await expect(page.locator(`div:has(> #${id}) svg`)).toHaveCount(1);
  }
  // A LinkedIn link typed here must be saved with the business (checked in Settings below).
  await page.locator("#linkedinUrl").fill("https://linkedin.com/company/onboarding-kitchen");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();

  await page.getByRole("button", { name: "Complete Setup" }).click();
  // Dedicated completion route (AJ's spec, point 10) — a fresh navigation,
  // not the same wizard shell swapping local state.
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding\/complete$/);
  // getByRole("heading", ...), not getByText (AJ, 2026-09-19) — Next.js's
  // #__next-route-announcer__ a11y live-region briefly mirrors this exact
  // text after the client-side redirect, so a bare getByText intermittently
  // strict-mode-fails against 2 elements. This is the 3rd occurrence of the
  // same flake (ISSUE-LOG.md) — fixed at the source this time instead of
  // just retrying.
  await expect(page.getByRole("heading", { name: "Your Platterly account is ready!" })).toBeVisible({ timeout: 10_000 });

  // Confirm the trial subscription was actually created, not just the UI text. With OPS_BILLING on, Ops owns the subscription and Caterly keeps no
  // local trial row (auto-provision.ts), so there is nothing to read here.
  if (process.env.OPS_BILLING !== "1") expect(await getTrialSubscriptionStatus(email)).toBe("TRIALING");

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
  await expect(page.getByRole("dialog", { name: "Create Your Custom Link" })).toBeVisible();
  // Seeded with a slugified suggestion from the real business name — never
  // the ugly auto-generated `biz-xxxx` placeholder slug.
  await expect(page.getByLabel("Your kitchen link")).not.toHaveValue(/^biz-/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Create Your Custom Link" })).not.toBeVisible();
  // Dashboard welcome heading greets the signed-in person by name (Priya
  // Sharma, filled in above), not the business name — AJ's explicit ask,
  // 2026-09-16, to match a richer dashboard reference design.
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Priya Sharma/ })).toBeVisible();
  // The date range picker (This Month by default) sits beside New Order, in place of the plain date (AJ, 2026-10-14).
  await expect(page.getByTestId("dashboard-range")).toContainText("This Month");
  await expect(page.getByText("You haven't set your public menu link yet.")).toBeVisible();
  await expect(page.getByAltText("QR code for your public menu link")).not.toBeVisible();

  // Sign out, then sign back in — a fresh session has no active org until
  // requireActiveOrganization() restores it from the existing Member row;
  // this proves that restoration path lands on the Dashboard directly,
  // never back at the onboarding wizard.
  await signOutFromMenu(page);
  // Signing out of Caterly also ends the central session, and the browser lands on the central sign-in page.
  await signInOnCentralPage(page, email);

  await expect(page).toHaveURL(/\/dashboard$/);
  // The custom-link popup still hasn't been satisfied, so it reopens here
  // too — this time, actually claim a link and confirm the Dashboard card
  // flips to the claimed state (real link + a real QR code image).
  await expect(page.getByRole("dialog", { name: "Create Your Custom Link" })).toBeVisible();
  await page.getByLabel("Your kitchen link").fill(claimedSlug);
  await page.getByRole("button", { name: "Create Link" }).click();
  await expect(page.getByRole("dialog", { name: "Create Your Custom Link" })).not.toBeVisible();
  await expect(page.getByText(claimedSlug)).toBeVisible();
  await expect(page.getByAltText("QR code for your public menu link")).toBeVisible();

  // Back from the Dashboard never returns to the wizard once it is finished.
  await page.goBack();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/kitchenlogin\/(onboarding|verify-email)/);

  // What the wizard collected landed in the same places Settings reads from.
  await page.goto("/settings/account/business-profile");
  await expect(page.getByText("+919800000099").first()).toBeVisible();
  await expect(page.getByText("KIT-0101").first()).toBeVisible();
  await expect(page.getByText("https://linkedin.com/company/onboarding-kitchen").first()).toBeVisible();
  await page.goto("/settings/integration/payments");
  await expect(page.getByLabel("GST rate (%)")).toHaveValue("12");
});

test("Caterly has no sign-in door of its own: the legacy address, the old pages and the old endpoints are all gone", async ({ page, request }) => {
  // The legacy address goes to the central sign-in like any signed-out visit.
  await page.goto("/?legacy=1");
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  // The old forgot-password and verify-email pages no longer exist.
  for (const path of ["/kitchenlogin/forgot-password", "/kitchenlogin/verify-email"]) expect((await request.get(path)).status(), path).toBe(404);
  // A hand-written request to Caterly's own email-and-password endpoints is refused: there is no password here, only the central sign-in.
  const origin = "http://catering.localhost:3000";
  const post = (path: string, data: unknown) => request.post(path, { headers: { origin }, data });
  const signIn = await post("/api/auth/sign-in/email", { email: "nobody@example.test", password: "wrong-password-123" });
  expect(signIn.status()).toBe(400);
  expect((await signIn.json()).code).toBe("EMAIL_PASSWORD_DISABLED");
  const signUp = await post("/api/auth/sign-up/email", { email: `e2e-door-${Date.now()}@example.test`, password: "correct-horse-battery", name: "No Door" });
  expect((await signUp.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  expect((await post("/api/auth/email-otp/send-verification-otp", { email: "nobody@example.test", type: "email-verification" })).status()).toBe(404);
});

test("Skip for now keeps what was typed, shows it in Settings, and Back from the Dashboard never returns to the wizard", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-onboard-skip-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const businessName = `Skip Kitchen ${Date.now().toString().slice(-6)}`;

  await page.goto("/");
  await signUpOnCentralPage(page, { email, firstName: "Skip", lastName: "Tester", phone: "9800000055" });
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);

  await fillWizardBusinessName(page, businessName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Street address").fill("12 Skip Road");
  await page.getByLabel("City").fill("Pune");
  // Skip from a half-filled step 2: Continue is still disabled, but Skip keeps what is there.
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // What was typed before skipping is saved, including the pre-filled phone.
  await page.goto("/settings/account/business-profile");
  await expect(page.getByText(businessName).first()).toBeVisible();
  await expect(page.getByText("12 Skip Road").first()).toBeVisible();
  await expect(page.getByText("Pune").first()).toBeVisible();
  await expect(page.getByText("+919800000055").first()).toBeVisible();

  // Back from there never lands on the wizard or the verify-email page.
  for (let i = 0; i < 4; i++) {
    await page.goBack().catch(() => undefined);
    await expect(page).not.toHaveURL(/\/kitchenlogin\/(onboarding|verify-email)/);
  }
  await page.goto("/kitchenlogin/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("the sign-up phone is already the business mobile, even if onboarding is abandoned", async ({ page }) => {
  const email = `e2e-onboard-leave-${Date.now()}@example.test`;
  cleanupEmails.push(email);

  await page.goto("/");
  await signUpOnCentralPage(page, { email, firstName: "Leave", lastName: "Tester", phone: "9800000088" });
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);

  // Leave the wizard without Skip or Finish (open the app directly), then look at Settings.
  await page.goto("/settings/account/business-profile");
  await expect(page.getByText("+919800000088").first()).toBeVisible();

  // The mobile number cannot be cleared in Settings: it must stay a valid number there too.
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await page.getByLabel("Brand name").fill("Leave Kitchen");
  const mobile = page.locator("input#mobileNumber");
  await expect(mobile).toHaveValue("+91 98000 00088");
  await mobile.fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  // The field keeps the "+91" calling code, so the browser's own check passes; the server refuses it and says so.
  await expect(page.getByText("Enter a valid mobile number.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Profile" })).toHaveCount(0); // still editing, nothing was saved
});

test("forgot password happens on the central page, not in Caterly: reset code from Platterly, new password, back into Caterly", async ({ page, request }) => {
  test.setTimeout(120_000);
  const email = `e2e-forgot-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  await signOutFromMenu(page);
  // The sign-in page is the central one in Caterly's look, and its "Forgot password?" link stays on the central host.
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/auth\.localhost:3300\/forgot\?/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await centralFill(page, "Email", email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  // The reset code is Platterly's approved reset email, sent by the central system.
  const code = await codeFromSink(page, email);
  const sent = ((await (await page.request.get("http://localhost:3600/api/messages")).json()) as { to: string[]; subject: string }[]).filter((m) => m.to.includes(email));
  expect(sent.some((m) => m.subject === "Reset Your Platterly Password")).toBe(true);
  await centralFill(page, "Code", code);
  await centralFill(page, "New password", "a brand new pass 5");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your password was changed. Sign in with the new one.")).toBeVisible();
  await signInOnCentralPage(page, email, "a brand new pass 5");
  await expect(page).toHaveURL(/catering\.localhost:3000\/dashboard/);
  // Caterly itself has no password reset: its own endpoints are gone.
  const origin = "http://catering.localhost:3000";
  for (const path of ["/api/auth/email-otp/reset-password", "/api/auth/forget-password/email-otp", "/api/auth/reset-password"]) {
    expect((await request.post(path, { headers: { origin }, data: { email, otp: "123456", password: "x".repeat(10) } })).status(), path).not.toBe(200);
  }
});
