import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Scrolling the mouse wheel over a focused number field used to change its value (250 became 249 or 251) while the
 * person only meant to scroll the drawer. No number field on the platform may change on a wheel scroll.
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("scrolling the mouse wheel over a focused number field does not change its value", async ({ page }) => {
  const email = `e2e-wheel-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Wheel", lastName: "Tester" });

  await page.goto("/menu-catalog/add-ons");
  await page.getByRole("button", { name: "Add Add-on" }).click();
  const price = page.getByRole("dialog").getByLabel("Price", { exact: true });
  await price.fill("250");
  await price.click();
  await price.hover();
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, -240);
  await expect(price).toHaveValue("250");
});
