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
  await page.getByRole("tab", { name: "Staffing" }).click();
  const card = page.getByTestId("staffing-card");
  await expect(card).toContainText("Nobody is scheduled yet");
  await card.getByLabel("Person").click();
  await page.getByRole("option", { name: person }).click();
  await card.getByLabel("Duty", { exact: true }).click();
  await page.getByRole("option", { name: "Delivery" }).click();
  await card.getByRole("button", { name: "Add" }).click();
  await expect(card.getByText(person)).toBeVisible();
  await expect(card).toContainText("Staff on this event (1)");

  // Change the duty, then the staff page shows them as assigned
  await card.getByLabel(`Duty for ${person}`).click();
  await page.getByRole("option", { name: "Setup" }).click();
  await expect(card.getByLabel(`Duty for ${person}`)).toContainText("Setup");
  await page.goto("/staff");
  await expect(page.getByRole("row", { name: new RegExp(orderNumber) })).toContainText("1 assigned");

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
