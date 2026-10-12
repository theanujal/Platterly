import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer, selectOption } from "./auth-helpers";

/**
 * Settings -> Account -> Currency & Time Zone (AJ, 2026-10-12): one page with two independent panels.
 * Time zone starts on India time and a change survives a reload.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("one Currency & Time Zone page: India by default, time zone editable, currency untouched", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-tz-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Zone", lastName: "Tester", phone: "9800000066" });

  // The sidebar has one entry, not two.
  await page.goto("/settings/account/currency-preferences");
  await expect(page.getByRole("heading", { name: "Currency & Time Zone" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Currency & Time Zone" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Time Zone", exact: true })).toHaveCount(0);

  // Both panels are on the page; time zone defaults to India.
  await expect(page.getByText("Display Format")).toBeVisible();
  await expect(page.getByText("India (IST, UTC+5:30)")).toBeVisible();

  // Editing the time zone leaves the currency panel alone.
  await page.getByRole("button", { name: "Edit Time Zone" }).click();
  await expect(page.getByRole("button", { name: "Edit Preferences" })).toBeVisible();
  await selectOption(page, page.locator("#timeZone"), /London/);
  await expect(page.getByRole("listbox")).toBeHidden();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: "Edit Time Zone" })).toBeVisible();
  await expect(page.getByText("London (GMT/BST)")).toBeVisible();

  // It stays after a reload.
  await page.reload();
  await expect(page.getByText("London (GMT/BST)")).toBeVisible();

  // And back to India.
  await page.getByRole("button", { name: "Edit Time Zone" }).click();
  await selectOption(page, page.locator("#timeZone"), /India/);
  await expect(page.getByRole("listbox")).toBeHidden();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: "Edit Time Zone" })).toBeVisible();
  await expect(page.getByText("India (IST, UTC+5:30)")).toBeVisible();
});
