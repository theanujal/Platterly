import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 8 — Public Storefront: Menu Link, Custom Slug & QR (view-only).
 * Signs up a fresh throwaway account, claims a custom slug via the
 * Dashboard's "Claim your custom link" dialog, builds a small real catalog,
 * then verifies the actual public `/{slug}` page — no login, no cookies —
 * renders the business info and that catalog, and that an unclaimed slug
 * still 404s.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("claim a custom link, build a menu, then view the real public storefront page (unauthenticated)", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const email = `e2e-storefront-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const slug = `store-${suffix}`;

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Storefront");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Claim the custom link via the auto-opened Dashboard dialog ---
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Build a small real catalog: a Menu Type, then a Category assigned to it
  // (Category-to-Menu assignment is only ever created from the Category
  // screen, per Chunk 6's ownership rule — so the Menu must exist first),
  // then a Food Item tagged into both. ---
  await page.goto("/menu-catalog/menus");
  const menuName = `Storefront Menu ${suffix}`;
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("250");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const categoryName = `Starters ${suffix}`;
  await page.goto("/menu-catalog/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category Name").fill(categoryName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.goto("/menu-catalog/items");
  const itemName = `Veg Spring Rolls ${suffix}`;
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("120");
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("checkbox", { name: categoryName }).check();
  await expect(page.getByRole("checkbox", { name: menuName })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: categoryName })).toBeChecked();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Settings: real link shown, Copy button, and a downloadable QR ---
  await page.goto("/settings/integration/public-menu-link");
  await expect(page.getByText(`localhost:3000/${slug}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download QR code" })).toBeVisible();

  // --- The real public page, unauthenticated (a brand-new browser context, no cookies at all) ---
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const response = await publicPage.goto(`/${slug}`);
  expect(response?.status()).toBe(200);

  await expect(publicPage.getByRole("heading", { name: menuName, level: 2 })).toBeVisible();
  await expect(publicPage.getByText(itemName)).toBeVisible();
  await expect(publicPage.getByText(`Starters ${suffix}`)).toBeVisible();
  await expect(publicPage.getByText("₹250.00 / plate")).toBeVisible();

  const jsonLdText = await publicPage.locator('script[type="application/ld+json"]').textContent();
  const jsonLd = JSON.parse(jsonLdText!);
  expect(jsonLd["@type"]).toBe("Restaurant");
  expect(jsonLd.hasMenu.hasMenuItem.some((item: { name: string }) => item.name === itemName)).toBe(true);

  // --- An unclaimed/nonexistent slug still 404s ---
  const notFoundResponse = await publicPage.goto("/no-such-tenant-e2e-xyz");
  expect(notFoundResponse?.status()).toBe(404);

  await publicContext.close();
});
