import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Event Types (pulled forward from dev plans/chunk-09-crm-core.md §9.1,
 * 2026-09-14; icon/sort-order added + relocated to /events/types when
 * Chunk 9's real Events Dashboard was built at /events, 2026-09-15) — a
 * caterer's catalog of the *types* of events they cater (e.g. "Wedding
 * Event"), each offering a set of eligible Menus.
 *
 * Updated 2026-09-16: the standalone Events Dashboard (transactional
 * Events, created/edited independent of an Order) was removed once every
 * Event started coming from an Order (AJ's decision — see
 * src/modules/orders/README.md and e2e/crm-core.spec.ts). Event Types moved
 * up to replace it: the sidebar's "Event Types" item now lands directly on
 * `/events` (formerly `/events/types`), with no dashboard in between.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create an event type with an icon assigning a menu, then edit it", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-events-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Events");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // A fresh account's Dashboard auto-opens the "Claim your custom link" dialog.
  await page.getByRole("button", { name: "Close" }).click();

  // --- A bare Menu for the event type to reference, via the "Add Menu Type" popup ---
  const menuName = `Wedding Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(menuName)).toBeVisible();

  // --- "Event Types" nav item lands directly on /events (no dashboard) ---
  await page.getByRole("link", { name: "Event Types" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("heading", { name: "Event Types" })).toBeVisible();

  // --- Create Event Type, with an icon (Chunk 9 Group 9.1) ---
  const eventTypeName = `Wedding Event ${suffix}`;
  await page.getByRole("link", { name: "Add New Event Type" }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByLabel("Description").fill("Full wedding catering package");
  await page.getByLabel("Icon").click();
  await page.getByRole("option", { name: "Wedding" }).click();
  await page.getByLabel("Min Number of Guests").fill("50");
  await page.getByText(menuName).click();
  await page.getByRole("button", { name: "Create event" }).click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByText(eventTypeName)).toBeVisible();
  await expect(page.getByText("Min 50 guests")).toBeVisible();

  // --- Edit: confirm the menu assignment and icon round-trip ---
  await page.getByText(eventTypeName).click();
  await expect(page).toHaveURL(/\/events\/.+/);
  await expect(page.getByLabel("Event Name")).toHaveValue(eventTypeName);
  await expect(page.getByText(menuName)).toBeVisible();

  await page.getByLabel("Event Name").fill(`${eventTypeName} Updated`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByText(`${eventTypeName} Updated`)).toBeVisible();
});
