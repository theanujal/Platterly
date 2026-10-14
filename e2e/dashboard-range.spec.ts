import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, seedApprovedOrderForShare } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * The Dashboard date range (AJ, 2026-10-14): a picker with presets, a calendar and Apply / Cancel; the figures that follow
 * the range are computed for it by the server, the current-state ones are not.
 */
const emails: string[] = [];
test.afterEach(async () => {
  const e = emails.pop();
  if (e) await cleanupOnboardingTestUser(e);
});

// An unclaimed link reopens its pop-up on every Dashboard visit, so claim one first.
async function signUpAndClaim(page: Page, email: string) {
  await signUpCaterer(page, email, { closeClaimDialog: false });
  await page.locator("#custom-slug").fill(`range-${Math.random().toString(36).slice(2, 10)}`);
  await page.getByRole("button", { name: "Create Link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

const dayInIndia = (offset: number) => new Date(Date.now() + offset * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);

test("pick a range with presets and the calendar: Apply moves the figures that follow it, Cancel and bad ranges change nothing", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-range-${Date.now()}@example.test`;
  emails.push(email);
  await signUpAndClaim(page, email);
  // One order placed today whose event is 3 days away, 100 guests, ₹1,000 unpaid.
  await seedApprovedOrderForShare(email);
  const today = dayInIndia(0);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const tile = (label: string) => page.locator("main a[href]").filter({ has: page.getByText(label, { exact: true }) });
  const picker = page.getByTestId("dashboard-range");

  // Default: This Month, and the tiles say what they cover.
  await page.goto("/dashboard");
  await expect(picker).toContainText("This Month");
  await expect(tile("Active Orders")).toContainText("Right now");
  await expect(tile("Total Guests")).toContainText("Events in the range");
  await expect(tile("Pending Revenue")).toContainText("Orders placed in the range");
  await expect(tile("Quotations")).toContainText("Created in the range");

  // Yesterday (preset): nothing was placed or held then; Active Orders and Upcoming Events are not date-filtered.
  await picker.click();
  await page.getByRole("radio", { name: "Yesterday" }).click();
  await expect(page.getByTestId("dashboard-range-draft")).toContainText(/\d{4}/);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(new RegExp(`from=${dayInIndia(-1)}&to=${dayInIndia(-1)}`));
  await expect(picker).toContainText("Yesterday");
  await expect(tile("Total Guests")).toContainText("0");
  await expect(tile("Pending Revenue")).toContainText("₹0");
  await expect(tile("Active Orders")).toContainText("1"); // current, unchanged
  await expect(page.getByTestId("activity-range")).toContainText("By order date");
  await expect(page.getByText("No orders in this date range.")).toBeVisible();
  await expect(page.getByText("No events in this date range.")).toBeVisible();

  // Today: the order placed today counts (₹1,000); its event is in 3 days, so the guests do not.
  await picker.click();
  await page.getByRole("radio", { name: "Today" }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(tile("Pending Revenue")).toContainText("₹1,000");
  await expect(tile("Total Guests")).toContainText("0");

  // A custom range from today to a week ahead, through the URL the picker builds: now the event's 100 guests are in it.
  await page.goto(`/dashboard?from=${today}&to=${dayInIndia(7)}`);
  await expect(picker).toContainText("Custom Range");
  await expect(tile("Total Guests")).toContainText("100");
  await expect(page.getByTestId("insights-range")).toContainText("By event date");
  await expect(page.getByTestId("event-type-donut")).toBeVisible(); // the event is in the range

  // Calendar: a later day then an earlier one restarts the range (the end can never be before the start); Apply needs both days.
  await picker.click();
  await page.getByRole("radio", { name: "Custom Range" }).click();
  const popup = page.getByTestId("dashboard-range-popup");
  const days = popup.getByRole("button", { name: /^\d{1,2} \w{3} \d{4}$/ });
  await days.nth(19).click();
  await expect(popup.getByRole("button", { name: "Apply" })).toBeDisabled(); // only the start so far
  await days.nth(9).click(); // earlier than the start: starts over from here
  await expect(popup.getByRole("button", { name: "Apply" })).toBeDisabled();
  await days.nth(14).click();
  await expect(popup.getByRole("button", { name: "Apply" })).toBeEnabled();
  // Cancel keeps what was applied.
  await popup.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(new RegExp(`from=${today}&to=${dayInIndia(7)}`));
  await expect(picker).toContainText("Custom Range");

  // A bad range in the address falls back to This Month and says why; the dashboard still works.
  await page.goto(`/dashboard?from=${dayInIndia(5)}&to=${dayInIndia(1)}`);
  await expect(page.getByTestId("range-error")).toContainText("before the start date");
  await expect(picker).toContainText("This Month");
  await page.goto("/dashboard?from=nope&to=2026-01-01");
  await expect(page.getByTestId("range-error")).toContainText("isn't valid");
});

test("the range picker fits a phone", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-range2-${Date.now()}@example.test`;
  emails.push(email);
  await signUpAndClaim(page, email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByTestId("dashboard-range").click();
  const popup = page.getByTestId("dashboard-range-popup");
  await expect(popup).toBeVisible();
  const box = (await popup.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("radio", { name: "Last 7 Days" }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("dashboard-range")).toContainText("Last 7 Days");
});
