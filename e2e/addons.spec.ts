import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Add-ons Management (2026-09-14, AJ's own field-level spec) — a standalone
 * catalog of Live Counters and Special Add-ons, each priced Per Plate or
 * Fixed. A new top-level sidebar section (a peer of Menu Catalog and
 * Events), not a tab inside Menu Catalog.
 *
 * Reworked again 2026-09-14 (UI/UX redesign round): Add and Edit are now
 * popup dialogs (a top-right "Add Add-on" button, a pencil icon per card) —
 * there is no more /new or /[id] page route. Signs up a fresh throwaway
 * account, skips onboarding, then drives the Add-ons flow.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create a Live Counter (Per Plate) and a Special Add-on (Fixed), then edit one", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-addons-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Addon");
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

  // A fresh account's Dashboard auto-opens the "Claim your custom link"
  // dialog, which overlays the whole page (including the sidebar) until
  // dismissed — close it before interacting with anything else.
  await page.getByRole("button", { name: "Close" }).click();

  // --- Add-ons is a top-level sidebar item, a peer of Menu Catalog/Events, not nested under Menu Catalog. ---
  await page.getByRole("link", { name: "Add-ons" }).click();
  await expect(page).toHaveURL(/\/addons$/);
  await expect(page.getByRole("heading", { name: "Add-ons" })).toBeVisible();

  // --- Live Counter, priced Per Plate, via the "Add Add-on" popup ---
  const liveCounterName = `Live Chaat Counter ${suffix}`;
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Name").fill(liveCounterName);
  await page.getByLabel("Description").fill("Fresh chaat made to order");
  // Type defaults to Live Counter, Price Type defaults to Per Plate.
  await page.getByLabel("Price", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Create add-on" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(liveCounterName)).toBeVisible();
  await expect(page.getByText("Live Counter").first()).toBeVisible();
  await expect(page.getByText("₹150.00 / plate")).toBeVisible();

  // --- Special Add-on, priced Fixed ---
  const specialAddonName = `Custom Cake Topper ${suffix}`;
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Name").fill(specialAddonName);
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Special Add-on" }).click();
  await page.getByLabel("Price Type").click();
  await page.getByRole("option", { name: "Fixed" }).click();
  await page.getByLabel("Price", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Create add-on" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(specialAddonName)).toBeVisible();
  await expect(page.getByText("Special Add-on").first()).toBeVisible();
  await expect(page.getByText("₹5000.00 flat")).toBeVisible();

  // --- Search + grid/list toggle (shared CatalogBrowser) ---
  await page.getByLabel("Search").fill("no-such-addon-xyz");
  await expect(page.getByText(liveCounterName)).not.toBeVisible();
  await page.getByLabel("Search").fill("");
  await expect(page.getByText(liveCounterName)).toBeVisible();
  await page.getByLabel("List view").click();
  await expect(page.getByRole("cell", { name: liveCounterName, exact: true })).toBeVisible();
  await page.getByLabel("Grid view").click();

  // --- Edit via the pencil-icon popup: confirm fields persisted, then update and verify ---
  await page.getByRole("button", { name: `Edit ${liveCounterName}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(liveCounterName);
  await expect(page.getByLabel("Price", { exact: true })).toHaveValue("150");

  await page.getByLabel("Name").fill(`${liveCounterName} Updated`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(`${liveCounterName} Updated`)).toBeVisible();
});
