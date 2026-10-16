import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { selectOption } from "./auth-helpers";

/**
 * The customer's Venue & Delivery step on the approval link (it opens right after "Approve Menu"). Leaves the Venue Type
 * empty first to prove the form refuses that, then fills the required fields and continues to the Confirmation.
 */
export async function submitVenueDetailsAsCustomer(page: Page, details: { building: string; address: string; contact: string; phone: string; door?: string }) {
  await expect(page.getByRole("heading", { name: "Venue & Delivery Details" })).toBeVisible();
  await expect(page.getByText("Menu ready to approve", { exact: true })).toBeVisible();

  await page.getByLabel("Venue / Building Name").fill(details.building);
  await page.getByLabel("Complete Venue Address").fill(details.address);
  await page.getByLabel("Contact Person").fill(details.contact);
  await page.getByRole("textbox", { name: "Contact Number" }).fill(details.phone);
  if (details.door) await page.getByLabel("Door / Flat / House No.").fill(details.door);

  // Venue Type is required.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Venue Type is required.")).toBeVisible();
  await selectOption(page, page.getByLabel("Venue Type"), "Home");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Thank You!" })).toBeVisible();
  await expect(page.getByTestId("venue-summary")).toContainText(details.building);
}

/**
 * Opens the Approval Status card's "View approval history" drawer (status timeline, hand-made status change, every menu version) from the
 * tab's panel or the page, and returns it. Close it with Escape before using the page behind it.
 */
export async function openApprovalHistory(page: Page, scope: Locator | Page = page) {
  await scope.getByRole("button", { name: "View approval history" }).click();
  const dialog = page.getByRole("dialog", { name: /approval history/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Opens the sidebar Order Status card's "View status history" drawer (timeline and the hand-made status change) and returns it. */
export async function openOrderStatusHistory(page: Page) {
  await page.getByRole("button", { name: "View status history" }).click();
  const dialog = page.getByRole("dialog", { name: /status history/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Opens an order's Menu Approval tab from the Orders list (the way in since Phase 4 of the Menu Approvals + Orders merge; the old
 * `/menu-approvals` queue now redirects to /orders). Returns the tab's panel, so a spec scopes its locators to it.
 */
export async function openOrderApprovalTab(page: Page, customerName: string) {
  await page.goto("/orders");
  await page.getByRole("link", { name: customerName }).first().click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+$/);
  await page.goto(`${page.url()}?tab=approval`);
  // The panel plus the sidebar beside it: the status, notes, history and pricing cards sit in the sidebar (AJ, 2026-10-16).
  const panel = page.locator("#order-panel-approval, #order-approval-sidebar");
  await expect(page.locator("#order-panel-approval")).toBeVisible();
  return panel;
}
