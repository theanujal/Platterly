import type { Page } from "@playwright/test";
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
