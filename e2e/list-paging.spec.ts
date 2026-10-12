import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedCustomers } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * List paging (AJ, 2026-10-12): paging shows once a list has more than 10 entries, 10 per page by default, with a
 * Rows per page dropdown (10, 25, 50) beside Previous / Next and "Page x of y".
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("no paging up to 10 entries; 10 per page after; rows per page 25 and 50; Previous and Next", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-paging-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Paging", lastName: "Tester", phone: "9800000088" });

  await seedCustomers(email, 10);
  await page.goto("/customers");
  await expect(page.getByText("Paging Customer 01").first()).toBeVisible();
  await expect(page.getByTestId("catalog-paging")).toHaveCount(0); // exactly 10: nothing to page

  await seedCustomers(email, 26, 11); // 26 more makes 36
  await page.goto("/customers");
  const paging = page.getByTestId("catalog-paging");
  await expect(paging).toContainText("Showing 1–10 of 36");
  await expect(paging).toContainText("Page 1 of 4");
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(paging).toContainText("Showing 11–20 of 36");
  await expect(paging).toContainText("Page 2 of 4");

  // Rows per page: 25 goes back to page 1.
  await page.getByLabel("Rows per page").click();
  await page.getByRole("option", { name: "25", exact: true }).click();
  await expect(paging).toContainText("Showing 1–25 of 36");
  await expect(paging).toContainText("Page 1 of 2");

  // 50 shows everything: no Previous / Next, only the count and the dropdown.
  await page.getByLabel("Rows per page").click();
  await page.getByRole("option", { name: "50", exact: true }).click();
  await expect(paging).toContainText("Showing 1–36 of 36");
  await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);

  // The choice is remembered on the next load.
  await page.reload();
  await expect(page.getByTestId("catalog-paging")).toContainText("Showing 1–36 of 36");
});
