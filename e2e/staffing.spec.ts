import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderWithEvent, setMemberRole, setOrderStatus } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Staffing (AJ, 2026-10-14): the Event Manager is picked from team members and Event Manager staff (AJ, 2026-10-16); Cooking, Serving and Setup are numbers
 * only (no Delivery or Store). There is no task list, and the staffing and logistics notes live under Additional
 * Details on the order. The Staff page lists the next 3 days and pages after 10 events.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test.use({ viewport: { width: 1600, height: 1000 } });

test("enter staffing as numbers per duty, see them on the Staffing page, add the notes under Additional Details; the kitchen role can do it too", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-staffing-${Date.now()}@example.test`;
  cleanupEmails.push(email);

  await signUpCaterer(page, email, { firstName: "Staff", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // An upcoming event with nothing entered yet
  const { orderId, orderNumber } = await seedOrderWithEvent(email);
  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("row", { name: new RegExp(orderNumber) })).toContainText("Not started");
  // The Staff page keeps its directory of people
  await expect(page.getByRole("button", { name: "Add Staff Member" })).toBeVisible();
  // The Usual duty list has every duty, Event Manager included (AJ, 2026-10-16); an Event Manager staff member can be picked for an event.
  await page.getByRole("button", { name: "Add Staff Member" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Asha Rao");
  await page.getByLabel("Usual duty").click();
  for (const duty of ["Event Manager", "Cooking", "Serving", "Delivery", "Setup", "Store"]) await expect(page.getByRole("option", { name: duty, exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Event Manager", exact: true }).click();
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByRole("row", { name: /Asha Rao/ })).toBeVisible();

  // The order's Staffing & Logistics tab: just numbers, no person picker and no tasks card
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  // An older record with a bare 10-digit phone number must not trip the phone field's E.164 warning
  expect(consoleErrors.filter((m) => m.includes("E.164"))).toEqual([]);
  const card = page.getByTestId("staffing-counts-card");
  await expect(card).toContainText("Staffing (0 people)");
  await expect(page.getByTestId("tasks-card")).toHaveCount(0);
  await expect(card.getByLabel("Delivery")).toHaveCount(0);
  await expect(card.getByLabel("Store")).toHaveCount(0);
  await card.getByRole("button", { name: "Event Manager" }).click();
  // Only team members with access and Event Manager staff are offered; a typed name that is neither is not.
  await page.getByPlaceholder("Search team members and Event Managers…").fill("Nobody Here");
  await expect(page.getByRole("option", { name: /Nobody Here/ })).toHaveCount(0);
  await page.getByPlaceholder("Search team members and Event Managers…").fill("Asha Rao");
  await page.getByRole("option", { name: "Asha Rao", exact: true }).click();
  await card.getByLabel("Serving").fill("10");
  await card.getByRole("button", { name: "Save staffing" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();
  await expect(card).toContainText("Staffing (11 people)");
  // Manager and Serving only is not complete yet: Cooking is needed too
  await page.goto("/staff");
  await expect(page.getByRole("row", { name: new RegExp(orderNumber) })).toContainText("In progress");
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  await card.getByLabel("Cooking").fill("3");
  await card.getByRole("button", { name: "Save staffing" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();
  await card.getByLabel("Serving").fill("-3");
  await card.getByRole("button", { name: "Save staffing" }).click();
  await expect(card.getByRole("alert")).toContainText("whole number");
  await card.getByLabel("Serving").fill("10");
  await card.getByRole("button", { name: "Save staffing" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();
  await expect(card.getByRole("alert")).toHaveCount(0);

  // Logistics still holds the vehicle and dispatch details, without a notes box
  const logistics = page.getByTestId("logistics-card");
  await expect(logistics.getByTestId("delivery-address")).toBeVisible();
  await expect(logistics.getByLabel("Setup notes")).toHaveCount(0);
  // Staffing is full width with Logistics underneath; inside Staffing the manager sits left of the counts, and in Logistics Vehicle sits left of Driver
  const [sb, lb] = [await card.boundingBox(), await logistics.boundingBox()];
  expect((lb?.y ?? 0) - ((sb?.y ?? 0) + (sb?.height ?? 0))).toBeGreaterThan(0);
  expect(Math.abs((lb?.width ?? 0) - (sb?.width ?? 1))).toBeLessThan(4);
  const [mb, cb] = [await card.getByRole("button", { name: "Event Manager" }).boundingBox(), await card.getByLabel("Cooking").boundingBox()];
  expect((cb?.x ?? 0) - (mb?.x ?? 0)).toBeGreaterThan(150);
  const [vb, db] = [await logistics.getByLabel("Vehicle number").boundingBox(), await logistics.getByLabel("Driver name").boundingBox()];
  expect(Math.abs((vb?.y ?? 0) - (db?.y ?? 999))).toBeLessThan(80);
  expect((db?.x ?? 0) - (vb?.x ?? 0)).toBeGreaterThan(150);
  await expect(logistics.getByRole("heading", { name: "Schedule & Status" })).toBeVisible();
  // Logistics opens once the order is sent to the kitchen (AJ, 2026-10-18): until then it is read-only, with a note and no Save button.
  await expect(logistics.getByTestId("logistics-closed")).toContainText("once the order is sent to the kitchen");
  await expect(logistics.getByLabel("Vehicle number")).toBeDisabled();
  await expect(logistics.getByRole("button", { name: "Save logistics" })).toHaveCount(0);
  await setOrderStatus(orderId, "SENT_TO_KITCHEN");
  await page.reload();
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  await expect(logistics.getByTestId("logistics-closed")).toHaveCount(0);
  await logistics.getByLabel("Vehicle number").fill("ka01ab1234");
  await logistics.getByLabel("Dispatch status").click();
  await page.getByRole("option", { name: "On the way" }).click();
  await logistics.getByRole("button", { name: "Save logistics" }).click();
  await expect(logistics.getByText("Saved")).toBeVisible();

  // Staffing and logistics notes are under Additional Details (the order is back in a state the notes can be edited in)
  await setOrderStatus(orderId, "APPROVED");
  await page.reload();
  await page.getByRole("tab", { name: "Additional Details" }).click();
  await page.getByLabel("Staffing & Logistics Notes").fill("Two vans, crew meets at 6 am");
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")), page.getByTestId("order-save-top").click()]);
  await expect(page.getByTestId("order-save-top")).toBeDisabled(); // saved: nothing left to save
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Additional Details" }).click();
  await expect(page.getByLabel("Staffing & Logistics Notes")).toHaveValue("Two vans, crew meets at 6 am");
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  await expect(page.getByTestId("staffing-counts-card").getByLabel("Serving")).toHaveValue("10");

  // The Staffing page lists the numbers by duty
  await page.goto("/staff");
  const row = page.getByRole("row", { name: new RegExp(orderNumber) });
  await expect(row).toContainText("Asha Rao");
  await expect(row).toContainText("Complete");
  await expect(page.getByTestId("staff-paging")).toHaveCount(0);

  // The kitchen role can open the event page (it cannot open the order itself) and change the numbers
  await setMemberRole(email, "kitchen");
  await page.goto("/staff");
  await page.getByRole("row", { name: new RegExp(orderNumber) }).getByRole("button", { name: "Manage Staffing" }).click();
  await expect(page).toHaveURL(/\/staff\/events\//);
  const kitchenCard = page.getByTestId("staffing-counts-card");
  await kitchenCard.getByLabel("Serving").fill("8");
  await kitchenCard.getByRole("button", { name: "Save staffing" }).click();
  await expect(kitchenCard.getByText("Saved.")).toBeVisible();
  await expect(kitchenCard).toContainText("Staffing (12 people)");

  // More than 10 events in the window: the list pages
  for (let i = 0; i < 10; i++) await seedOrderWithEvent(email);
  await page.goto("/staff");
  await expect(page.getByTestId("staff-paging")).toContainText("Showing 1–10 of 11");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("staff-paging")).toContainText("Showing 11–11 of 11");
});
