import { test, expect, type Page } from "@playwright/test";
import { addInAppNotification, cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** Chunk 16.5: the header bell shows the signed-in person's own alerts, with an unread count they can clear. */

const cleanupEmails: string[] = [];

/** A new account is asked to claim its custom link on every dashboard load; close that so the header is clickable. */
async function closeClaimDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (await dialog.count()) await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toHaveCount(0);
}

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the bell shows an unread count, lists the alert, and marks it read", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-bell-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Bell", lastName: "Tester", phone: "9800000066" });

  await page.goto("/dashboard");
  await closeClaimDialog(page);
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.locator('[data-slot="popover-content"]').getByText("You're all caught up")).toBeVisible();
  await page.keyboard.press("Escape");

  await addInAppNotification(email, "New order", "Order ORD-1 from Asha Rao for 5 Dec 2026.");
  await page.reload();
  await closeClaimDialog(page);
  await expect(page.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
  await page.getByRole("button", { name: "Notifications, 1 unread" }).click();
  await expect(page.getByText("Order ORD-1 from Asha Rao for 5 Dec 2026.")).toBeVisible();

  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await closeClaimDialog(page);
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
});
