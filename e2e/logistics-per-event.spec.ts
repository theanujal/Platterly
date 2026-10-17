import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedMealSlots, seedOrderWithEvent, setOrderStatus, setOrderVenuePerEvent } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Logistics of a multi-event order (AJ, 2026-10-18): one form when the venue is the same for all events; one record per event, in the same
 * list-and-form design as the event venues, when the venue differs by event. The whole card stays closed until the order is sent to the kitchen.
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("logistics is one form when the venue is the same, and one per event when it differs, opened once the order is sent to the kitchen", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-logev-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Logistics", lastName: "Events", phone: "9800000082" });
  const { orderId } = await seedOrderWithEvent(email);
  const day1 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const day2 = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  await seedMealSlots(orderId, [
    { date: day1, mealType: "DINNER" },
    { date: day2, mealType: "LUNCH" },
  ]);

  // Not sent to the kitchen yet: nothing can be entered. The venue is the same for all events, so it is one form.
  await page.goto(`/orders/${orderId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  const logistics = page.getByTestId("logistics-card");
  await expect(logistics.getByTestId("logistics-closed")).toContainText("once the order is sent to the kitchen");
  await expect(logistics.getByLabel("Driver name")).toBeDisabled();
  await expect(logistics.getByRole("navigation", { name: "Logistics events" })).toHaveCount(0);

  // Sent to the kitchen with the same venue: one form for the whole order.
  await setOrderStatus(orderId, "SENT_TO_KITCHEN");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  await expect(logistics.getByTestId("logistics-closed")).toHaveCount(0);
  await expect(logistics.getByRole("navigation", { name: "Logistics events" })).toHaveCount(0);
  await expect(logistics.getByRole("button", { name: "Save logistics" })).toBeVisible();

  // The venue now differs by event: one record per event.
  await setOrderVenuePerEvent(orderId, true);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  await expect(logistics.getByRole("navigation", { name: "Logistics events" }).getByRole("button")).toHaveCount(2);
  await expect(logistics.getByTestId("logistics-event-header")).toContainText("Day 1 · Dinner");

  // Event 1: its own vehicle and driver, on the way.
  await logistics.getByLabel("Vehicle number").fill("ka01ab1111");
  await logistics.getByLabel("Driver name").fill("Ravi");
  await logistics.getByLabel("Dispatch status").click();
  await page.getByRole("option", { name: "On the way" }).click();
  await logistics.getByRole("button", { name: /^Save Day 1/ }).click();
  await expect(logistics.getByText("Saved")).toBeVisible();

  // Event 2 starts empty; copy the vehicle and driver, then change the driver. Its status is its own.
  await logistics.getByRole("navigation", { name: "Logistics events" }).getByRole("button").nth(1).click();
  await expect(logistics.getByTestId("logistics-event-header")).toContainText("Day 2 · Lunch");
  await expect(logistics.getByLabel("Driver name")).toHaveValue("");
  await logistics.getByRole("button", { name: /Copy vehicle & driver/ }).click();
  await page.getByRole("menuitem", { name: /Day 1/ }).click();
  await expect(logistics.getByLabel("Vehicle number")).toHaveValue("KA01AB1111".toLowerCase() === "" ? "" : "ka01ab1111");
  await logistics.getByLabel("Driver name").fill("Meera");
  await logistics.getByRole("button", { name: /^Save Day 2/ }).click();
  await expect(logistics.getByText("Saved")).toBeVisible();

  // Saved: each event reads back its own details and status.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  await expect(logistics.getByLabel("Driver name")).toHaveValue("Ravi");
  await expect(logistics.getByRole("navigation", { name: "Logistics events" }).getByRole("button").nth(0)).toContainText("On the way");
  await logistics.getByRole("navigation", { name: "Logistics events" }).getByRole("button").nth(1).click();
  await expect(logistics.getByLabel("Driver name")).toHaveValue("Meera");
  await expect(logistics.getByRole("navigation", { name: "Logistics events" }).getByRole("button").nth(1)).toContainText("Not dispatched");
});
