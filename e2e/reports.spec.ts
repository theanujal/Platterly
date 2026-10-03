import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderForBilling } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 17.1 (PRD §51): the Sales and Events reports for a kitchen, and the platform-wide version for Super Admin.
 */

const OPS_URL = process.env.PW_OPS_URL ?? "http://ops.localhost:3000";
const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("a kitchen reads its Sales and Events reports and filters them by date", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-reports-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Report", lastName: "Tester", phone: "9800000011" });
  await seedOrderForBilling(email, 50_000);
  await seedOrderForBilling(email, 25_000);

  await page.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();

  // Sales (the default tab): two orders just placed
  const tile = (id: string) => page.getByTestId(id);
  await expect(tile("sales-revenue")).toContainText("₹75,000.00");
  await expect(tile("sales-orders")).toContainText("2");
  await expect(tile("sales-aov")).toContainText("₹37,500.00");
  await expect(tile("sales-enquiries")).toContainText("2");
  await expect(tile("sales-conversion")).toContainText("100%");
  await expect(page.getByTestId("bar-list").getByText("2 orders")).toBeVisible();

  // Events: by the date of the event
  await page.getByRole("tab", { name: "Events" }).click();
  await expect(page).toHaveURL(/tab=events/);
  await expect(tile("events-count")).toContainText("2");
  await expect(tile("events-guests")).toContainText("200");
  await expect(tile("events-average")).toContainText("100");
  await expect(page.getByTestId("events-by-type")).toContainText("No event type");
  await expect(page.getByTestId("events-top").getByRole("link").first()).toBeVisible();

  // A period with nothing in it shows zeros, and the tab keeps the dates
  await page.goto("/reports?tab=events&from=2020-01-01&to=2020-01-31");
  await expect(tile("events-count")).toContainText("0");
  await expect(page.getByTestId("report-period")).toContainText("from 2020-01-01 to 2020-01-31");
  await page.getByRole("tab", { name: "Sales" }).click();
  await expect(page).toHaveURL(/from=2020-01-01/);
  await expect(tile("sales-orders")).toContainText("0");
  await expect(tile("sales-conversion")).toContainText("—");
});

test("Super Admin reads the platform-wide reports", async ({ page }: { page: Page }) => {
  test.setTimeout(120_000);
  const [user, password] = [process.env.SUPER_ADMIN_EMAIL, process.env.SUPER_ADMIN_PASSWORD];
  if (!user || !password) throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env to run this spec.");
  await page.goto(`${OPS_URL}/super`);
  await page.getByLabel("Email").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/super\/dashboard$/);

  await page.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/super\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await expect(page.getByTestId("sales-revenue")).toBeVisible();
  await expect(page.getByTestId("platform-caterers")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kitchens" })).toBeVisible();

  await page.getByRole("tab", { name: "Events" }).click();
  await expect(page).toHaveURL(/tab=events/);
  await expect(page.getByTestId("events-count")).toBeVisible();
  await expect(page.getByTestId("events-by-type")).toBeVisible();
});

test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto("/reports");
  await expect(page).not.toHaveURL(/\/reports/);
});
