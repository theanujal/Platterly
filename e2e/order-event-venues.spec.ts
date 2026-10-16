import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, seedApprovedOrderForShare, seedMealSlots } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Order Details of a multi-event order: the same "is the venue the same for all events?" question and per-event venue editor the
 * customer gets on the approval link (AJ, 2026-10-17). Each event keeps its own venue, copy from another event works, a missing
 * required field names the event, and the saved venues read back one per event.
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function fillEventVenue(page: Page, building: string, contact: string) {
  await page.getByRole("combobox", { name: "Venue Type" }).click();
  await page.getByRole("option", { name: "Home", exact: true }).click();
  await page.getByLabel("Venue / Building Name", { exact: true }).fill(building);
  await page.getByLabel("Complete Venue Address", { exact: true }).fill(`${building}, Whitefield`);
  await page.getByLabel("Venue Contact Person", { exact: true }).fill(contact);
  await page.getByRole("textbox", { name: "Contact Number" }).fill("9000000002");
}

test("a multi-event order: the team gives each event its own venue on Order Details", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-ovenue-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Event", lastName: "Venues", phone: "9800000079" });
  const { orderId } = await seedApprovedOrderForShare(email, { stage: "VENUE", multi: true });
  const day1 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const day2 = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  await seedMealSlots(orderId, [
    { date: day1, mealType: "DINNER" },
    { date: day2, mealType: "LUNCH" },
  ]);

  await page.goto(`/orders/${orderId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByRole("button", { name: "Edit event information" }).click();

  // The question, then one venue per event.
  await expect(page.getByTestId("venue-same-question")).toBeVisible();
  await expect(page.getByTestId("event-venues")).toHaveCount(0);
  await page.getByRole("radio", { name: /different for each event/ }).click();
  await expect(page.getByRole("navigation", { name: "Events" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("event-header")).toContainText("Day 1 · Dinner");

  // Event 1 filled, Event 2 not: saving names the event and moves to it.
  await fillEventVenue(page, "Green Villa", "Ravi");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("order-save-top").click();
  await expect(page.getByText("Event 2: Venue Type is required.")).toBeVisible();

  // Copy event 1 into event 2, then change what differs.
  await page.getByRole("button", { name: "Edit event information" }).click();
  await page.getByRole("navigation", { name: "Events" }).getByRole("button").nth(1).click();
  await expect(page.getByTestId("event-header")).toContainText("Day 2 · Lunch");
  await page.getByRole("button", { name: "Copy from another event" }).click();
  await page.getByRole("menuitem", { name: /Day 1/ }).click();
  await expect(page.getByLabel("Venue / Building Name", { exact: true })).toHaveValue("Green Villa");
  await page.getByLabel("Venue / Building Name", { exact: true }).fill("Palm Hall");
  await page.getByLabel("Venue Contact Person", { exact: true }).fill("Meera");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("order-save-top").click();
  await expect(page.getByTestId("unsaved-note-save")).toHaveCount(0); // saved: nothing left unsaved

  // Saved: read back one venue per event.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Order Details" }).click();
  const view = page.getByTestId("event-venues-view");
  await expect(view).toContainText("Day 1 · Dinner");
  await expect(view).toContainText("Green Villa");
  await expect(view).toContainText("Ravi");
  await expect(view).toContainText("Day 2 · Lunch");
  await expect(view).toContainText("Palm Hall");
  await expect(view).toContainText("Meera");
});
