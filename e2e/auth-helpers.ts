import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { setPushPromptState } from "./db";

/** The sign-in system's code emails (approved Caterly layout): the code is read from the email body, not the subject. */
const CODE_SUBJECT = /Account Verification|Reset Your Platterly Password|Confirm Your New Platterly Email|Confirm Your Platterly Recovery Email|Sign-in Code/;


/**
 * Caterly has no sign-in, sign-up, forgot-password or email-verification form of its own (AJ, 2026-11-10): all four happen on Platterly's central pages, which
 * look like Caterly's. These helpers drive those pages in a real browser. The 6-digit codes are read from the local mail sink (port 3600, `npm run mail-sink`),
 * and the Platform must be running (auth.localhost:3300). Run the Caterly browser tests with Caterly's link to the Platform switched off
 * (`PLATFORM_ANSWER_SECRET=` empty for the dev server), so a test sign-up leaves no business or audit rows in the Platform. Test people in the central
 * identity database are removed by `cleanupOnboardingTestUser` when `IDENTITY_DATABASE_URL` is given.
 */
export const SINK = "http://localhost:3600";
export const CENTRAL_PASSWORD = "correct-horse-battery";

/** Text typed before the page is interactive is lost when it becomes interactive, so every fill waits for the page's ready marker first. */
export async function centralFill(page: Page, label: string, value: string) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true } : undefined).fill(value);
}

/** The newest 6-digit code mailed to this address, from the sink (retries while the background send finishes). */
export async function codeFromSink(page: Page, to: string, after = ""): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string; html: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && CODE_SUBJECT.test(m.subject) && m.receivedAt > after).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.html.replace(/<[^>]*>/g, " ").match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no verification code arrived for ${to} - is the mail sink running (npm run mail-sink)?`);
}

/** On the central sign-in page: sign in with an existing person's email and password. */
export async function signInOnCentralPage(page: Page, email: string, password = CENTRAL_PASSWORD): Promise<void> {
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await centralFill(page, "Email", email);
  await centralFill(page, "Password", password);
  await page.getByRole("button", { name: /^Sign in( to your account)?$/ }).click();
}

/** On the central sign-in page: create the account, verify the emailed code, and sign in, which sends the browser back to where it came from. */
export async function signUpOnCentralPage(page: Page, person: { email: string; firstName?: string; lastName?: string; phone?: string; password?: string }): Promise<void> {
  const { email, firstName = "E2E", lastName = "Tester", phone = "9800000099", password = CENTRAL_PASSWORD } = person;
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await centralFill(page, "First name", firstName);
  await centralFill(page, "Last name", lastName);
  await centralFill(page, "Phone", phone);
  await centralFill(page, "Confirm password", password);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await centralFill(page, "Email", email);
  await centralFill(page, "Password", password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await centralFill(page, "Verification code", await codeFromSink(page, email));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Your email is verified. You can sign in now.")).toBeVisible();
  await centralFill(page, "Password", password);
  await page.getByRole("button", { name: /^Sign in( to your account)?$/ }).click();
}

export interface SignUpOptions {
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Dismiss the "Create Your Custom Link" dialog a fresh Dashboard opens. Default true; the storefront spec needs it open. */
  closeClaimDialog?: boolean;
  /** Leave the "Stay updated" push popup schedule alone, so it shows. Default false (marked "Don't ask again"). */
  pushPrompt?: boolean;
}

/**
 * Sign up a fresh caterer through the central pages (Caterly sends a signed-out visitor there), verify the emailed code, sign in, skip onboarding and land on
 * the Dashboard. Every spec carries its own caterer through this, so it is the single place to change when the sign-up flow changes.
 */
export async function signUpCaterer(page: Page, email: string, options: SignUpOptions = {}): Promise<void> {
  const { firstName, lastName, phone, closeClaimDialog = true } = options;
  await page.goto("/");
  await signUpOnCentralPage(page, { email, firstName, lastName, phone });
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  // The "Stay updated" push popup would sit over the page under test; push-prompt.spec.ts covers it itself.
  if (!options.pushPrompt) await setPushPromptState(email, "NEVER");
  // The wizard is on screen before its click handlers are attached (several workers share one dev server that compiles on first visit).
  await waitUntilInteractive(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  if (closeClaimDialog) await page.getByRole("button", { name: "Close" }).click();
}

/**
 * Open a dropdown and pick an option, retrying until it works. With several workers sharing one dev
 * server a page can be on screen before its click handlers are attached, so the first click on the
 * trigger does nothing and a plain `click()` then waits for an option that never appears. The option
 * is only clicked once it is showing, and the trigger only clicked while it is not.
 */
/** Signs out through the account menu at the top right (Settings, Billing and Sign out live there). */
export async function signOutFromMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

export async function selectOption(page: Page, trigger: Locator, optionName: string | RegExp): Promise<void> {
  await expect(async () => {
    const option = page.getByRole("option", { name: optionName });
    if (!(await option.first().isVisible())) await trigger.click();
    await option.first().click({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Pick one day in the app's calendar popover (the same `DateRangePicker` the Create Order page uses; on the
 * public form it is single-day). Steps the month forward until the target month shows, then clicks the day.
 */
export async function pickCalendarDate(page: Page, trigger: Locator, isoDate: string): Promise<void> {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  await trigger.click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  for (let i = 0; i < 24 && (await popover.locator("span.font-medium").textContent()) !== monthLabel; i++) {
    await popover.getByRole("button", { name: "Next month" }).click();
  }
  await popover.getByRole("button", { name: String(day), exact: true }).click();
  await expect(popover).not.toBeVisible();
}

/**
 * Waits until React has attached to the page's inputs (the first input carries React's own props key). A full page load shows the form before its click
 * handlers and state exist, and anything typed or clicked before that is lost, so specs wait for this before typing.
 */
export async function waitUntilInteractive(page: Page, timeout = 60_000): Promise<void> {
  await page.waitForFunction(() => Array.from(document.querySelectorAll("input,button")).some((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), undefined, { timeout });
}

/** Step 1 of the onboarding wizard: waits for the page to be interactive, types the business name and waits until the page has kept it (Continue turns on). */
export async function fillWizardBusinessName(page: Page, name: string): Promise<void> {
  await waitUntilInteractive(page);
  await page.getByLabel("Company / business name").fill(name);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
}
