import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, seedApprovedOrderForShare } from "./db";
import { selectOption, signUpCaterer } from "./auth-helpers";

/**
 * A multi-event order on the approval link (AJ, 2026-10-17): the Price Summary lists every menu on its own line, the guests read
 * "N Guests (adults · under 5 · aged 5–10)", and the customer says whether the venue is the same for all events. When it differs
 * every event day gets its own venue form, with "Copy from another event", and the confirmation shows each day's venue.
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function fillVenue(page: Page, building: string, contact: string) {
  await page.getByLabel("Venue / Building Name").fill(building);
  await page.getByLabel("Complete Venue Address").fill(`${building}, Whitefield`);
  await page.getByLabel("Contact Person").fill(contact);
  await page.getByRole("textbox", { name: "Contact Number" }).fill("9000000002");
  await selectOption(page, page.getByLabel("Venue Type"), "Home");
}

test("a multi-event order: menus itemised, guests spelled out, and a venue for each event", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = `e2e-vpe-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Multi", lastName: "Venue", phone: "9800000078" });
  const { approvalToken } = await seedApprovedOrderForShare(email, { stage: "VENUE", multi: true, kidsBelow5: 5, kids5To10: 20 });

  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await expect(customer.getByRole("heading", { name: "Venue & Delivery Details" })).toBeVisible();

  // Both menus and the guest breakdown, not just the first menu.
  const rows = customer.getByTestId("price-rows");
  await expect(rows).toContainText("Royal Dinner");
  await expect(rows).toContainText("Garden Lunch");
  await expect(customer.getByTestId("selected-menus")).toContainText("Garden Lunch");
  await expect(customer.getByTestId("order-number")).toContainText("ORD-");

  // The question, then one form per event.
  await expect(customer.getByTestId("venue-same-question")).toBeVisible();
  await expect(customer.getByTestId("event-list")).toHaveCount(0);
  await customer.getByRole("radio", { name: /different for each event/ }).click();
  await expect(customer.getByRole("navigation", { name: "Events" }).getByRole("button")).toHaveCount(2);
  await expect(customer.getByTestId("event-header")).toContainText("Day 1");
  await expect(customer.getByTestId("event-header")).toContainText("Royal Dinner");

  await fillVenue(customer, "Green Villa", "Ravi");
  await customer.getByRole("button", { name: "Continue" }).click();
  // Day 2 is still empty: the form moves there and says so.
  await expect(customer.getByText("Event 2: Venue Type is required.")).toBeVisible();
  await expect(customer.getByTestId("event-header")).toContainText("Day 2");
  await expect(customer.getByTestId("event-header")).toContainText("Garden Lunch");

  // Copy day 1, then change what differs.
  await customer.getByRole("button", { name: "Copy from another event" }).click();
  await customer.getByRole("menuitem", { name: /Day 1/ }).click();
  await expect(customer.getByLabel("Venue / Building Name")).toHaveValue("Green Villa");
  await customer.getByLabel("Venue / Building Name").fill("Grand Orchid");
  await customer.getByLabel("Contact Person").fill("Meera");

  await customer.getByRole("button", { name: "Continue" }).click();
  await expect(customer.getByTestId("venue-confirmation")).toBeVisible();
  await expect(customer.getByRole("heading", { name: "Thank You!" })).toBeVisible();
  // One event at a time, with arrows between them.
  const day = customer.getByTestId("venue-summary-day");
  await expect(customer.getByTestId("venue-position")).toHaveText("1 of 2");
  await expect(day).toContainText("Green Villa");
  await expect(day).toContainText("Ravi");
  await expect(customer.getByRole("button", { name: "Previous event" })).toBeDisabled();
  await customer.getByRole("button", { name: "Next event" }).click();
  await expect(customer.getByTestId("venue-position")).toHaveText("2 of 2");
  await expect(day).toContainText("Grand Orchid");
  await expect(day).toContainText("Meera");
});

test("a single-event order has no per-event question", async ({ page, browser }) => {
  const email = `e2e-vpe1-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Single", lastName: "Venue", phone: "9800000079" });
  const { approvalToken } = await seedApprovedOrderForShare(email, { stage: "VENUE" });
  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await expect(customer.getByRole("heading", { name: "Venue & Delivery Details" })).toBeVisible();
  await expect(customer.getByTestId("venue-same-question")).toHaveCount(0);
});
