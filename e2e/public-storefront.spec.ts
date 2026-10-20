import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 8 — Public Storefront: Menu Link, Custom Slug & QR (view-only).
 * Signs up a fresh throwaway account, claims a custom slug via the
 * Dashboard's "Create Your Custom Link" dialog, then verifies the actual
 * public `/{slug}` page — no login, no cookies — renders the business info
 * and, per Chunk 11's 2026-09-18 redesign, the event-details intake form
 * directly (the storefront root no longer shows a browsable menu/item
 * listing at all — that only appears later, inside Menu Selection, after
 * this form is submitted). Also confirms an unclaimed slug still 404s.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("claim a custom link, then view the real public storefront page (unauthenticated)", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const email = `e2e-storefront-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const slug = `store-${suffix}`;

  await signUpCaterer(page, email, { firstName: "Storefront", lastName: "Tester", closeClaimDialog: false });

  // --- Claim the custom link via the auto-opened Dashboard dialog ---
  await expect(page.getByRole("dialog", { name: "Create Your Custom Link" })).toBeVisible();
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Create Link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Settings: real link shown, Copy button, and a downloadable QR ---
  await page.goto("/settings/integration/public-menu-link");
  // The Order QR stand preview repeats the link, so the Business URL box is the one asked for.
  await expect(page.getByText(`${new URL(page.url()).host}/${slug}`).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download QR code" })).toBeVisible();

  // --- The real public page, unauthenticated (a brand-new browser context, no cookies at all) ---
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const response = await publicPage.goto(`/${slug}`);
  expect(response?.status()).toBe(200);

  await expect(publicPage.getByRole("heading", { name: "Plan Your Event", level: 1 })).toBeVisible();
  await expect(publicPage.getByLabel("Your Name")).toBeVisible();
  await expect(publicPage.getByRole("textbox", { name: "Phone Number" })).toBeVisible();

  // Order Type comes first and drives the rest (AJ, 2026-10-19): the date opens once it is chosen, and a Single Order holds one meal.
  const orderTypeY = (await publicPage.getByRole("radiogroup", { name: "Order Type" }).boundingBox())!.y;
  expect((await publicPage.getByLabel("Event Date").boundingBox())!.y).toBeGreaterThan(orderTypeY);
  await expect(publicPage.getByLabel("Event Date")).toBeDisabled();
  await publicPage.getByRole("radio", { name: /Single Order/ }).click();
  await expect(publicPage.getByLabel("Event Date")).toBeEnabled();
  const single = publicPage.getByRole("radio", { name: /Single Order/ });
  const multi = publicPage.getByRole("radio", { name: /Multi Order/ });
  await expect(publicPage.getByLabel("Event end date")).toHaveCount(0); // one date for a Single Order
  // A second meal switches it to Multi by itself, with a popup; taking it away switches back, with another (the kitchen's Create Order does the same).
  const popup = publicPage.getByRole("alertdialog");
  await publicPage.getByRole("checkbox", { name: "Lunch" }).click();
  await expect(single).toHaveAttribute("aria-checked", "true");
  await expect(popup).toHaveCount(0);
  await publicPage.getByRole("checkbox", { name: "Dinner" }).click();
  await expect(popup).toContainText("Order Type changed to Multi Order");
  await expect(popup).toContainText("more than one meal");
  await popup.getByRole("button", { name: "Got it" }).click();
  await expect(multi).toHaveAttribute("aria-checked", "true");
  await expect(publicPage.getByRole("checkbox", { name: "Lunch" })).toHaveAttribute("aria-checked", "true");
  await publicPage.getByRole("checkbox", { name: "Lunch" }).click();
  await expect(popup).toContainText("Order Type changed to Single Order");
  await popup.getByRole("button", { name: "Got it" }).click();
  await expect(single).toHaveAttribute("aria-checked", "true");
  await expect(publicPage.getByRole("checkbox", { name: "Dinner" })).toHaveAttribute("aria-checked", "true");
  // Choosing Multi by hand says so too, and shows a start and an end date.
  await multi.click();
  await expect(popup).toContainText("Order Type changed to Multi Order");
  await popup.getByRole("button", { name: "Got it" }).click();
  await expect(publicPage.getByLabel("Event start date")).toBeVisible();
  await expect(publicPage.getByLabel("Event end date")).toBeVisible();
  // Going back to Single with a meal and a date range to lose asks first.
  await publicPage.getByRole("checkbox", { name: "Lunch" }).click(); // two meals: already Multi, nothing to announce
  await expect(popup).toHaveCount(0);
  await single.click();
  await expect(popup).toContainText("Change this order to Single Order?");
  await popup.getByRole("button", { name: "Keep Multi Order" }).click();
  await expect(multi).toHaveAttribute("aria-checked", "true");
  await single.click();
  await popup.getByRole("button", { name: "Switch and remove" }).click();
  await popup.getByRole("button", { name: "Got it" }).click();
  await expect(single).toHaveAttribute("aria-checked", "true");
  await expect(publicPage.getByLabel("Event end date")).toHaveCount(0);

  const jsonLdText = await publicPage.locator('script[type="application/ld+json"]').textContent();
  const jsonLd = JSON.parse(jsonLdText!);
  expect(jsonLd["@type"]).toBe("Restaurant");

  // --- An unclaimed/nonexistent slug still 404s ---
  const notFoundResponse = await publicPage.goto("/no-such-tenant-e2e-xyz");
  expect(notFoundResponse?.status()).toBe(404);

  await publicContext.close();
});
