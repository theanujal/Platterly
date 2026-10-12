import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Order QR stand (AJ, 2026-10-12), the part that does not depend on Platterly Ops: Settings -> Platterly Link shows a live
 * preview of the printed design (the kitchen's name, "Powered by Platterly" at the bottom) and the warning that changing the
 * link breaks printed stands. Ordering, payment, invoice and shipping are checked against a real Ops by hand and by the
 * stand module tests (catering and ops), since they need Ops and Razorpay.
 */

const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("Platterly Link shows the stand preview with the kitchen's name and the keep-your-link warning", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-standpreview-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Stand", lastName: "Preview", phone: "9800000044" });

  await page.goto("/settings/integration/public-menu-link");
  const section = page.getByTestId("stand-section");
  await expect(section).toBeVisible();
  await expect(page.getByRole("heading", { name: "Order QR stand" })).toBeVisible();
  const preview = page.getByTestId("stand-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByAltText("Platterly")).toBeVisible(); // "Powered by Platterly" is always at the bottom
  await expect(preview).toContainText("Scan to see our menu and order");
  await expect(section.getByText("Keep your link the same")).toBeVisible();
  await expect(section.getByText("the stands you have already printed will stop working")).toBeVisible();

  // No horizontal scroll on a phone.
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
