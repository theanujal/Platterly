import "dotenv/config";
import { test, expect } from "@playwright/test";
import { activatePaidPlan, assignOrderEventToLocation, cleanupOnboardingTestUser, clearPlatformNotice, givePlanWithMultiLocation, seedOrderForBilling } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * AJ's navigation round (2026-10-04): Reports & Activity, Finance and Stock & Supplies are one menu entry each with the
 * old pages as tabs; Settings, Billing and Sign out live in the account menu at the top right; the green sidebar box is
 * the trial countdown by default and the Super Admin's own notice when one is switched on; the Order page keeps pricing
 * and payments in the Pricing & Payment tab, in two columns.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const OPS_URL = process.env.PW_OPS_URL ?? "http://ops.localhost:3000";

test("merged menus open as tabs, and Settings, Billing and Sign out are in the account menu", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-nav-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Nav", lastName: "Tester", phone: "9800000041" });

  const sidebar = page.locator("[data-sidebar='sidebar']").first();
  // One entry per merged section; the old separate entries are gone, and so are Settings and Sign out.
  for (const name of ["Reports & Activity", "Finance", "Stock & Supplies"]) await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Reports", "Audit Log", "Expenses", "Profitability", "Inventory", "Suppliers", "Purchasing", "Settings"]) {
    await expect(sidebar.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(sidebar.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  const tabs = async (section: string) => page.getByRole("navigation", { name: section });
  await sidebar.getByRole("link", { name: "Reports & Activity", exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports & Activity", exact: true })).toBeVisible();
  await (await tabs("Reports & Activity")).getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/audit-log$/);
  await expect(sidebar.getByRole("link", { name: "Reports & Activity", exact: true })).toHaveAttribute("data-active", "");

  await sidebar.getByRole("link", { name: "Finance", exact: true }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await (await tabs("Finance")).getByRole("link", { name: "Profitability" }).click();
  await expect(page).toHaveURL(/\/profitability$/);
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();

  await sidebar.getByRole("link", { name: "Stock & Supplies", exact: true }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  for (const tab of ["Suppliers", "Purchasing"]) {
    await (await tabs("Stock & Supplies")).getByRole("link", { name: tab }).click();
    await expect(page).toHaveURL(new RegExp(`/${tab.toLowerCase()}$`));
  }

  // The account menu: Settings, Billing (the Subscription tab) and Sign out.
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Billing" }).click();
  await expect(page).toHaveURL(/\/settings\/subscription$/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings(\/.*)?$/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in to your account" })).toBeVisible();
});

test("the Order page: no pricing or payments in the sidebar, payments beside the pricing in two columns, kitchen row only with locations", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-ordnav-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await signUpCaterer(page, email, { firstName: "Ord", lastName: "Nav", phone: "9800000042" });
  const { orderId } = await seedOrderForBilling(email, 20000);

  await page.goto(`/orders/${orderId}`);
  const sidebar = page.locator("aside").filter({ has: page.getByText("Order Summary") });
  await expect(sidebar).toBeVisible();
  // Single kitchen: no assigned kitchen row, no picker
  await expect(sidebar.getByText("Kitchen", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("event-operations-card")).toHaveCount(0);
  // Pricing and payments are not in the sidebar
  await expect(sidebar.getByText("Pricing Details")).toHaveCount(0);
  await expect(sidebar.getByTestId("order-billing")).toHaveCount(0);
  await expect(sidebar.getByText("Grand Total")).toHaveCount(0);

  // They are in the Pricing & Payment tab, side by side
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  const pricing = page.getByRole("heading", { name: "Pricing Details" });
  const payment = page.getByRole("heading", { name: "Payment Details" });
  await expect(pricing).toBeVisible();
  await expect(payment).toBeVisible();
  await expect(page.getByTestId("order-billing")).toBeVisible();
  const [a, b] = [await pricing.boundingBox(), await payment.boundingBox()];
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 100))).toBeLessThan(40); // same row
  expect((b?.x ?? 0) - (a?.x ?? 0)).toBeGreaterThan(300); // payment is to the right

  // Locations on: the kitchen row and the picker come back
  await givePlanWithMultiLocation(email);
  await page.goto("/settings/kitchen/kitchen-rules");
  await page.getByRole("switch", { name: /more than one location/i }).click();
  await expect(page.getByText("Main", { exact: true })).toBeVisible();
  await assignOrderEventToLocation(orderId, "Main");
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByTestId("event-operations-card")).toBeVisible();
  await expect(page.locator("aside").getByText("Kitchen", { exact: true })).toBeVisible();
});

test("the green box: trial countdown by default, nothing on a paid plan, the Super Admin's own notice for everyone, and hidden again when switched off", async ({ page, browser }) => {
  test.setTimeout(180_000);
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, "Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env to run this spec.");
  const email = `e2e-box-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await clearPlatformNotice();
  await signUpCaterer(page, email, { firstName: "Box", lastName: "Tester", phone: "9800000043" });

  // Default: the trial countdown with an Upgrade button
  const sidebar = page.locator("[data-sidebar='sidebar']").first();
  await expect(sidebar).toContainText(/days? left on your trial/);
  await expect(sidebar.getByRole("button", { name: "Upgrade Now" })).toBeVisible();

  // A paid plan hides it
  await activatePaidPlan(email, "premium", 30).catch(() => undefined);
  await page.goto("/dashboard");
  await expect(sidebar).not.toContainText(/left on your trial/);

  // The Super Admin writes a notice with a button and switches it on
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  try {
    await admin.goto(`${OPS_URL}/super`);
    await admin.getByLabel("Email").fill(SUPER_ADMIN_EMAIL!);
    await admin.getByLabel("Password").fill(SUPER_ADMIN_PASSWORD!);
    await admin.getByRole("button", { name: "Sign in" }).click();
    await expect(admin).toHaveURL(/\/super\/dashboard$/);
    await admin.getByRole("link", { name: "Sidebar notice" }).click();
    await expect(admin.getByRole("heading", { name: "Sidebar notice", exact: true })).toBeVisible();
    await admin.getByLabel("Title").fill("Diwali offer");
    await admin.getByLabel("Text").fill("20% off yearly plans until 31 Oct.");
    await admin.getByLabel("Button label (optional)").fill("See plans");
    await admin.getByLabel("Button link").fill("javascript:alert(1)");
    await admin.getByRole("switch", { name: "Show this box to every kitchen" }).click();
    await admin.getByRole("button", { name: "Save notice" }).click();
    await expect(admin.locator("p[role=alert]")).toContainText("must start with");
    await admin.getByLabel("Button link").fill("/subscribe");
    await admin.getByRole("button", { name: "Save notice" }).click();
    await expect(admin.getByRole("status")).toContainText("Saved");

    // Every kitchen sees it, even one on a paid plan
    await page.goto("/dashboard");
    const notice = page.getByTestId("sidebar-notice");
    await expect(notice).toContainText("Diwali offer");
    await expect(notice).toContainText("20% off yearly plans until 31 Oct.");
    await expect(notice.locator('a[href="/subscribe"]')).toContainText("See plans");

    // Switched off: gone again
    await admin.getByRole("switch", { name: "Show this box to every kitchen" }).click();
    await admin.getByRole("button", { name: "Save notice" }).click();
    await expect(admin.getByRole("status")).toContainText("Saved");
    await page.goto("/dashboard");
    await expect(page.getByTestId("sidebar-notice")).toHaveCount(0);
  } finally {
    await adminContext.close();
    await clearPlatformNotice();
  }
});
