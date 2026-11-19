import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** Chunk 17.2: owners (and managers) can read the audit log: plain-words entries, filters, and before / after details. */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the owner reads the audit log: entries in plain words, search, record filter and details", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-audit-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Audit", lastName: "Tester", phone: "9800000022" });

  // The sidebar shows it, and signing up already left entries behind.
  await page.getByRole("link", { name: "Reports & Activity", exact: true }).click();
  await page.getByRole("navigation", { name: "Reports & Activity" }).getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/audit-log$/);
  await expect(page.getByRole("heading", { name: "Reports & Activity", exact: true })).toBeVisible();
  const rows = page.getByTestId("audit-row");
  await expect(rows.first()).toBeVisible();
  await expect(page.getByText("Kitchen account created")).toBeVisible();
  await expect(page.getByTestId("audit-paging")).toContainText(/Showing 1–\d+ of \d+/);

  // Who did it: with single sign-up the Platform creates the kitchen before the owner's Caterly user exists, so that row reads System
  await expect(rows.filter({ hasText: "Kitchen account created" }).getByText("System")).toBeVisible();
  // ...and the owner is named on what they did themselves (onboarding saves the business profile)
  await expect(rows.filter({ hasText: "Business profile updated" }).getByText("Audit Tester")).toBeVisible();

  // A row with recorded changes opens to show the fields (the new kitchen's name)
  await rows.filter({ hasText: "Kitchen account created" }).first().click();
  await expect(page.getByTestId("audit-details")).toBeVisible();
  await expect(page.getByTestId("audit-details")).toContainText("Field");

  // Search narrows the list and lives in the address
  await page.getByLabel("Search").fill("update");
  await page.getByTestId("audit-filters").getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=update/);
  await expect(page.getByText("Kitchen account created")).toHaveCount(0);
  await expect(rows.first()).toContainText("Business profile updated");

  // Nothing matches a nonsense search, and Clear brings everything back
  await page.getByLabel("Search").fill("zzzz-nothing");
  await page.getByTestId("audit-filters").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("audit-empty")).toBeVisible();
  await page.getByTestId("audit-filters").getByRole("button", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/audit-log$/);
  await expect(page.getByText("Kitchen account created")).toBeVisible();
});
