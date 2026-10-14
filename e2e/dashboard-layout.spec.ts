import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, markPublicLinkClaimed } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** Dashboard layout (AJ, 2026-10-14): Order Activity with only Orders and Revenue; Event Insights then Public Menu / QR side by side; all three cards the same height. */
const emails: string[] = [];
test.afterEach(async () => { const e = emails.pop(); if (e) await cleanupOnboardingTestUser(e); });

test("Order Activity has Orders and Revenue only, and Event Insights and Public Menu / QR sit side by side, all three cards equally tall", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-dashlayout-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");

  // Metric selector: Orders and Revenue, no Guests; the Total Guests tile stays.
  const metric = page.getByRole("group", { name: "Metric" });
  await expect(metric.getByRole("button", { name: "Orders" })).toBeVisible();
  await expect(metric.getByRole("button", { name: "Revenue" })).toBeVisible();
  await expect(metric.getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("group", { name: "Range" })).toHaveCount(0); // 7D / 30D / 3M / 1Y are replaced by the date picker
  await expect(page.getByText("Total Guests")).toBeVisible();

  // Event Insights, then Public Menu / QR: same row, equal width; the chart card and both cards are the same height.
  const card = (title: string) => page.getByText(title, { exact: true }).locator("xpath=ancestor::*[@data-slot='card'][1]");
  const [activity, qr, events] = await Promise.all([card("Order Activity").boundingBox(), card("Public Menu / QR").boundingBox(), card("Event Insights").boundingBox()]);
  expect(Math.abs(qr!.y - events!.y)).toBeLessThan(2);
  expect(Math.abs(qr!.width - events!.width)).toBeLessThan(2);
  expect(Math.abs(qr!.height - events!.height)).toBeLessThan(2);
  expect(Math.abs(activity!.height - events!.height)).toBeLessThan(2);
  expect(Math.abs(activity!.y - events!.y)).toBeLessThan(2);
  expect(events!.x).toBeLessThan(qr!.x); // Event Insights is the left of the two
  expect(activity!.x + activity!.width).toBeLessThanOrEqual(events!.x);
  await expect(page.getByText("Event Type Distribution")).toHaveCount(0);
});

test("icon actions show a tooltip on hover: Public Menu / QR on the dashboard and Edit on the Staff page's team card", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-icontips-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email);
  await markPublicLinkClaimed(email);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/dashboard");

  for (const label of ["View public menu", "Copy link", "Download QR code", "Share on WhatsApp", "Manage public link"]) {
    await page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label })).hover();
    await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: label })).toBeVisible();
  }

  // Copy link: the tooltip stays on screen after the click and says "Copied!".
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: "Copied!" })).toBeVisible();

  await page.goto("/staff");
  await page.getByRole("button", { name: /in Team settings/ }).hover();
  await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: "Edit in Team settings" })).toBeVisible();
});
