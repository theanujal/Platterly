import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, seedCalendarFixtures, type CalendarFixtureOrder } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 13 — Calendar & Scheduling Views. Seeds a tenant with a known set of
 * Orders/Events (raw SQL — see `seedCalendarFixtures`) and checks, against the
 * real dev DB and browser:
 *  - Group 13.2: a "Calendar" sidebar entry, the month grid's per-day counts
 *    matching the seeded rows exactly (multi-day spans on every day, cancelled
 *    left out), today alone filled in its legend colour, the others showing a
 *    line, the list view agreeing with the grid, event overlays, insights,
 *    and month navigation.
 *  - Group 13.1: Create Order's Event Date picker showing the same busy-ness
 *    lines + legend, plus year navigation.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

async function signUpSkipOnboarding(page: Page, email: string) {
  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Calendar");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("9800000077");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Close" }).click();
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

test("calendar page + order-count date picker agree with the Orders/Events tables", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-calendar-${Date.now()}@example.test`;
  cleanupEmails.push(email);

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const today = iso(y, m, now.getDate());
  const next = new Date(y, m, 1); // first of next month (JS months are 0-based, so `m` is already "next")
  const ny = next.getFullYear();
  const nm = next.getMonth() + 1;

  const orders: CalendarFixtureOrder[] = [
    { start: iso(y, m, 10), end: iso(y, m, 10), guests: 100 }, // 0 — has a linked Event
    { start: iso(y, m, 10), end: iso(y, m, 12), status: "PENDING_REVIEW" }, // 1 — multi-day: counts on 10, 11, 12
    { start: iso(y, m, 20), end: iso(y, m, 20), status: "CANCELLED" }, // 2 — never counted
    { start: today, end: today }, // 3 — makes today busy
    { start: iso(ny, nm, 5), end: iso(ny, nm, 5) }, // 4 — next month
  ];
  await signUpSkipOnboarding(page, email);
  await seedCalendarFixtures(email, {
    orders,
    events: [
      { name: "Linked Wedding Event", start: iso(y, m, 10), end: iso(y, m, 10), orderIndex: 0 },
      { name: "Standalone Tasting", start: iso(y, m, 25), end: iso(y, m, 25) },
    ],
  });

  // What the grid must show, computed independently from the seeded rows.
  const expected: Record<string, number> = {};
  for (const o of orders.filter((o) => o.status !== "CANCELLED")) for (const d of daysBetween(o.start, o.end)) expected[d] = (expected[d] ?? 0) + 1;

  // --- Sidebar entry ---
  // Already on /dashboard from sign-up — a fresh goto would re-open the "Claim your custom link" dialog.
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();

  // --- Month grid: every cell's count equals the seeded rows' expectation ---
  const cells = page.locator('[data-testid^="calendar-day-"]');
  await expect(cells).toHaveCount(42);
  const actual = await cells.evaluateAll((els) =>
    Object.fromEntries(els.map((el) => [el.getAttribute("data-testid")!.replace("calendar-day-", ""), Number(el.getAttribute("data-order-count"))])),
  );
  for (const [day, count] of Object.entries(actual)) expect(count, `count on ${day}`).toBe(expected[day] ?? 0);

  // Today is the only filled date, in its legend colour (1+ orders -> a band), with no line inside it.
  const todayPill = page.getByTestId(`calendar-day-${today}`).locator("span").first();
  await expect(todayPill).toHaveClass(/bg-(emerald|amber|orange|rose)-\d+ .*text-white/);
  await expect(todayPill.locator('span[aria-hidden="true"]')).toHaveCount(0);
  // A busy non-today date shows a line and is NOT filled; a quiet date shows neither.
  const busyDay = today === iso(y, m, 10) ? iso(y, m, 11) : iso(y, m, 10);
  const busyPill = page.getByTestId(`calendar-day-${busyDay}`).locator("span").first();
  await expect(busyPill.locator('span[aria-hidden="true"]')).toHaveCount(1);
  await expect(busyPill).not.toHaveClass(/text-white/);
  const quietDay = iso(y, m, 28);
  await expect(page.getByTestId(`calendar-day-${quietDay}`).locator('span[aria-hidden="true"]')).toHaveCount(0);

  // The cancelled order's day is not counted and shows no line.
  await expect(page.getByTestId(`calendar-day-${iso(y, m, 20)}`)).toHaveAttribute("data-order-count", String(expected[iso(y, m, 20)] ?? 0));

  // --- Event overlays ---
  await expect(page.getByTestId(`calendar-day-${iso(y, m, 25)}`).getByText("Standalone Tasting")).toBeVisible();
  // The Event that has its own Order shows as a marker on that Order's chip, not a second chip.
  await expect(page.getByText("Linked Wedding Event")).toHaveCount(0);
  await expect(page.getByTestId(`calendar-day-${iso(y, m, 10)}`).getByLabel("Has an Event")).toBeVisible();

  // --- Insights ---
  const liveThisMonth = orders.filter((o) => o.status !== "CANCELLED" && o.start.startsWith(`${y}-${pad(m)}`)).length;
  await expect(page.getByTestId("stat-orders-this-month")).toHaveText(String(liveThisMonth));
  await expect(page.getByTestId("stat-days-with-events")).toHaveText("2");
  await expect(page.getByTestId("watch-heavy-days")).toContainText("None in");
  await expect(page.getByTestId("watch-staffing")).toBeVisible();

  // --- List view agrees with the grid ---
  await page.getByRole("link", { name: "List", exact: true }).click();
  await expect(page).toHaveURL(/view=list/);
  const listOrderRows = await page.locator('[data-testid^="calendar-list-day-"] a[href^="/orders/"]').count();
  const gridTotalInMonth = Object.entries(expected)
    .filter(([d]) => d.startsWith(`${y}-${pad(m)}`))
    .reduce((n, [, c]) => n + c, 0);
  // Order rows + the (Order-linked) Event rows: the linked Event is a marker not a row here either, so only Order rows + standalone-Event-less links count.
  expect(listOrderRows).toBe(gridTotalInMonth);
  await expect(page.getByTestId(`calendar-list-day-${iso(y, m, 25)}`).getByText("Standalone Tasting")).toBeVisible();
  await expect(page.getByTestId(`calendar-list-day-${iso(y, m, 20)}`)).toHaveCount(0);

  // --- Month navigation ---
  await page.getByRole("link", { name: "Month", exact: true }).click();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByTestId("calendar-month-label")).toContainText(String(ny));
  await expect(page.getByTestId("stat-orders-this-month")).toHaveText("1");
  await expect(page.getByTestId(`calendar-day-${iso(ny, nm, 5)}`)).toHaveAttribute("data-order-count", "1");
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByTestId(`calendar-day-${today}`)).toBeVisible();

  // --- Group 13.1: Create Order's Event Date picker ---
  await page.goto("/orders/new");
  await page.getByLabel("Event Date").click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(popover.getByText("2-3 orders")).toBeVisible(); // legend
  // Day `busyDay` has 2 orders (or 1 if today is one of the multi-day days, which still shows a line/fill).
  const busyDayNumber = String(Number(busyDay.slice(8)));
  const busyButton = popover.getByRole("button", { name: busyDayNumber, exact: true });
  await expect(busyButton.locator('span[aria-hidden="true"]')).toHaveCount(1);
  await expect(busyButton).toHaveAttribute("title", /orders?$/);
  // Year navigation.
  const label = popover.locator("span.font-medium");
  await popover.getByRole("button", { name: "Next year" }).click();
  await expect(label).toContainText(String(y + 1));
  await popover.getByRole("button", { name: "Previous year" }).click();
  await expect(label).toContainText(String(y));
});
