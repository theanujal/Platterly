import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, getPushPrompt, setPushPromptState } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 16.3: the "Stay updated with Platterly" popup. Asked the moment the account exists; "Maybe Later" brings it
 * back after 3 days, "Don't Ask Again" ends it. (Turning push on for real needs a browser push service, so that
 * part is covered by unit tests with a fake sender.)
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function closeClaimDialog(page: Page) {
  const claim = page.getByRole("dialog").filter({ hasText: "Claim your custom link" });
  await claim.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (await claim.count()) await claim.getByRole("button", { name: "Close" }).first().click();
  await expect(claim).toHaveCount(0);
}

test("a new account is asked about push, 'Maybe Later' returns in 3 days, 'Don't Ask Again' ends it", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-push-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  // Headless Chromium reports notifications as blocked, and the popup (rightly) never shows where they are blocked.
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default" }));
  await signUpCaterer(page, email, { firstName: "Push", lastName: "Tester", phone: "9800000044", closeClaimDialog: false, pushPrompt: true });

  // It waits for the "Claim your custom link" dialog, then asks.
  await closeClaimDialog(page);
  const prompt = page.getByTestId("push-prompt");
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  await expect(prompt.getByText("Stay updated with Platterly")).toBeVisible();
  await expect(prompt.getByText("Event reminders before your catering events")).toBeVisible();
  await expect(prompt.getByRole("button", { name: "Enable Notifications" })).toBeVisible();
  await expect(prompt.getByRole("link", { name: "notification settings" })).toHaveAttribute("href", "/settings/communication/push-notifications");

  // Maybe Later: stored as LATER, due again in about 3 days
  await prompt.getByRole("button", { name: "Maybe Later" }).click();
  await expect(prompt).toHaveCount(0);
  await expect.poll(async () => (await getPushPrompt(email)).state).toBe("LATER");
  const later = await getPushPrompt(email);
  expect(later.count).toBe(1);
  expect(later.daysUntilNext).toBeGreaterThan(2.9);
  expect(later.daysUntilNext).toBeLessThan(3.1);

  // Not due yet: a reload shows nothing
  await page.reload();
  await closeClaimDialog(page);
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("push-prompt")).toHaveCount(0);

  // Due again (as if 3 days passed): it comes back, and "Don't Ask Again" ends it for good
  await setPushPromptState(email, "LATER", -1);
  await page.reload();
  await closeClaimDialog(page);
  await expect(page.getByTestId("push-prompt")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("push-prompt").getByRole("button", { name: "Don't Ask Again" }).click();
  await expect.poll(async () => (await getPushPrompt(email)).state).toBe("NEVER");
  await page.reload();
  await closeClaimDialog(page);
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("push-prompt")).toHaveCount(0);
});
