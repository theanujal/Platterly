import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Event Types (pulled forward from dev plans/chunk-09-crm-core.md §9.1,
 * 2026-09-14; icon/sort-order added + relocated to /events/types when
 * Chunk 9's real Events Dashboard was built at /events, 2026-09-15) — a
 * caterer's catalog of the *types* of events they cater (e.g. "Wedding
 * Event"), each offering a set of eligible Menus.
 *
 * Updated 2026-09-16: the standalone Events Dashboard (transactional
 * Events, created/edited independent of an Order) was removed once every
 * Event started coming from an Order (AJ's decision — see
 * src/modules/orders/README.md and e2e/crm-core.spec.ts). Event Types moved
 * up to replace it: the sidebar's "Event Types" item now lands directly on
 * `/menu-catalog/event-types` (formerly `/menu-catalog/event-types/types`), with no dashboard in between.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("create an event type with an icon assigning a menu, then edit it", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-events-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Events", lastName: "Tester", closeClaimDialog: false });
  // A fresh account's Dashboard auto-opens the "Claim your custom link" dialog.
  await page.getByRole("button", { name: "Close" }).click();

  // --- A bare Menu for the event type to reference, via the "Add Menu Type" popup ---
  const menuName = `Wedding Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(menuName)).toBeVisible();

  // --- "Event Types" nav item lands directly on /events (no dashboard) ---
  await page.getByRole("link", { name: "Event Types" }).click();
  await expect(page).toHaveURL(/\/menu-catalog\/event-types$/);
  await expect(page.getByRole("heading", { name: "Event Types" })).toBeVisible();

  // --- Create Event Type, with an icon (Chunk 9 Group 9.1) ---
  const eventTypeName = `Wedding Event ${suffix}`;
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByLabel("Description").fill("Full wedding catering package");
  await page.getByLabel("Icon").click();
  await page.getByRole("option", { name: "Wedding" }).click();
  await page.getByLabel("Min Number of Guests").fill("50");
  await page.getByText(menuName).click();
  await page.getByRole("button", { name: "Create event" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(eventTypeName)).toBeVisible();
  await page.getByLabel("Grid view").click(); // pages open in List view by default (AJ, 2026-09-30)
  await expect(page.getByText("Min 50 guests")).toBeVisible();

  // --- Edit (a drawer now, not a page): confirm the menu assignment and icon round-trip ---
  await page.getByRole("button", { name: `Actions for ${eventTypeName}` }).click();
  await page.getByRole("menuitem", { name: "Edit Event Type" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Event Name")).toHaveValue(eventTypeName);
  await expect(page.getByRole("checkbox", { name: menuName })).toBeChecked();

  await page.getByLabel("Event Name").fill(`${eventTypeName} Updated`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(`${eventTypeName} Updated`)).toBeVisible();
});
