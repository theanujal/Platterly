import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";

/**
 * New Events section (pulled forward from dev plans/chunk-09-crm-core.md
 * §9.1, 2026-09-14) — a caterer's catalog of the *types* of events they
 * cater (e.g. "Wedding Event"), each offering a set of eligible Menus.
 * Signs up a fresh throwaway account, skips onboarding, creates a bare Menu
 * (no items/categories needed for this), then drives the Events flow.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create an event type assigning a menu, then edit it", async ({ page }) => {
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
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- A bare Menu for the event type to reference ---
  const menuName = `Wedding Menu ${suffix}`;
  await page.goto("/menu-catalog/menus/new");
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page).toHaveURL(/\/menu-catalog\/menus$/);

  // --- Events nav item (peer of Menu Catalog, not nested under it) ---
  await page.getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();

  // --- Create Event Type ---
  const eventName = `Wedding Event ${suffix}`;
  await page.getByRole("link", { name: "Add New Event" }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  await page.getByLabel("Event Name").fill(eventName);
  await page.getByLabel("Description").fill("Full wedding catering package");
  await page.getByLabel("Min Number of Guests").fill("50");
  await page.getByText(menuName).click();
  await page.getByRole("button", { name: "Create event" }).click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByText(eventName)).toBeVisible();
  await expect(page.getByText("Min 50 guests")).toBeVisible();

  // --- Edit: confirm the menu assignment round-trips ---
  await page.getByText(eventName).click();
  await expect(page).toHaveURL(/\/events\/.+/);
  await expect(page.getByLabel("Event Name")).toHaveValue(eventName);
  await expect(page.getByText(menuName)).toBeVisible();

  await page.getByLabel("Event Name").fill(`${eventName} Updated`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByText(`${eventName} Updated`)).toBeVisible();
});
