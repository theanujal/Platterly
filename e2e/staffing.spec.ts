import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderWithEvent, setMemberRole } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 19.2 — floor staff with no login, scheduled onto an order's event by hand. The kitchen team does the filling in;
 * nothing is suggested from the guest count.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("add staff with no login, schedule them on an event, change the duty, remove; the kitchen role can do it too", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-staffing-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const person = `Ravi ${suffix}`;

  await signUpCaterer(page, email, { firstName: "Staff", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // Add floor staff
  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await page.getByRole("button", { name: "Add Staff Member" }).click();
  await page.getByLabel("Name", { exact: true }).fill(person);
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("cell", { name: person, exact: true })).toBeVisible();

  // An upcoming event with nobody on it yet
  const { orderId, orderNumber } = await seedOrderWithEvent(email);
  await page.goto("/staff");
  await expect(page.getByRole("row", { name: new RegExp(orderNumber) })).toContainText("No staff yet");

  // Schedule them from the order's Staffing tab
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  const card = page.getByTestId("staffing-card");
  await expect(card).toContainText("Nobody is scheduled yet");
  await card.getByLabel("Person").click();
  await page.getByRole("option", { name: person }).click();
  await card.getByLabel("Duty", { exact: true }).click();
  await page.getByRole("option", { name: "Delivery" }).click();
  await card.getByRole("button", { name: "Add" }).click();
  await expect(card.getByText(person)).toBeVisible();
  await expect(card).toContainText("Staff on this event (1)");

  // Tasks: add two, give one to Ravi, tick one off
  const tasks = page.getByTestId("tasks-card");
  await tasks.getByLabel("Task", { exact: true }).fill("Load the chafing dishes");
  await tasks.getByLabel("Give to").click();
  await page.getByRole("option", { name: person }).click();
  await tasks.getByRole("button", { name: "Add task" }).click();
  await expect(tasks).toContainText("Load the chafing dishes");
  await expect(tasks).toContainText(person);
  await tasks.getByLabel("Task", { exact: true }).fill("Check the vehicle");
  await tasks.getByLabel("Task", { exact: true }).press("Enter"); // Enter adds the task, it does not submit the order
  await expect(tasks).toContainText("Check the vehicle");
  await expect(tasks).toContainText("Tasks (2 open)");
  await tasks.getByRole("checkbox", { name: "Done: Check the vehicle" }).click();
  await expect(tasks).toContainText("Tasks (1 open, 1 done)");

  // Logistics: the order's delivery address is shown; save vehicle, driver and move the dispatch status
  const logistics = page.getByTestId("logistics-card");
  await expect(logistics.getByTestId("delivery-address")).toBeVisible();
  await logistics.getByLabel("Vehicle number").fill("ka01ab1234");
  await logistics.getByLabel("Driver", { exact: true }).fill("Suresh");
  await logistics.getByLabel("Dispatch status").click();
  await page.getByRole("option", { name: "On the way" }).click();
  await logistics.getByRole("button", { name: "Save logistics" }).click();
  await expect(logistics.getByText("Saved")).toBeVisible();
  await expect(logistics).toContainText(/Left .*20/);
  await page.reload();
  await page.getByRole("tab", { name: "Staffing & Logistics" }).click();
  await expect(page.getByTestId("logistics-card").getByLabel("Vehicle number")).toHaveValue("KA01AB1234");

  // Change the duty, then the staff page shows them as assigned
  await card.getByLabel(`Duty for ${person}`).click();
  await page.getByRole("option", { name: "Setup" }).click();
  await expect(card.getByLabel(`Duty for ${person}`)).toContainText("Setup");
  await page.goto("/staff");
  const row = page.getByRole("row", { name: new RegExp(orderNumber) });
  await expect(row).toContainText("1 assigned");
  await expect(row).toContainText("1/2 done");
  await expect(row).toContainText("On the way");

  // The kitchen role can open Staff, add people and schedule them on the event page (it cannot open the order itself)
  await setMemberRole(email, "kitchen");
  await page.goto("/staff");
  await expect(page.getByRole("button", { name: "Add Staff Member" })).toBeVisible();
  await expect(page.getByText("Team members with a login")).toHaveCount(0);
  await page.getByRole("link", { name: new RegExp(orderNumber) }).click(); // from the upcoming events list: a page the kitchen role can open
  await expect(page).toHaveURL(/\/staff\/events\//);
  await page.getByTestId("staffing-card").getByRole("button", { name: `Remove ${person}` }).click();
  await expect(page.getByTestId("staffing-card")).toContainText("Nobody is scheduled yet");
});
