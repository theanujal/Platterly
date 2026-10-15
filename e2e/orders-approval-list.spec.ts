import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedReviewFixture, setOrderEventDay } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Menu Approvals + Orders merge, Phase 3: the Orders list's Menu Approval column and filter, "Not Started", and the Past view
 * (hidden by default; past-event orders whose approval is still outstanding). Orders are inserted straight into each state.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the list shows each order's menu approval, filters on it, and keeps past orders in their own view", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-approval-list-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "List", lastName: "Owner", phone: "9800000077" });

  const review = await seedReviewFixture(email, { ordinal: 81, customer: "Review Guest", status: "DRAFT" });
  const sent = await seedReviewFixture(email, { ordinal: 82, customer: "Sent Guest", status: "SENT_TO_CUSTOMER", versions: 1 });
  const none = await seedReviewFixture(email, { ordinal: 83, customer: "Fresh Guest", status: "DRAFT", noSelection: true });
  const pastOutstanding = await seedReviewFixture(email, { ordinal: 84, customer: "Late Guest", status: "CUSTOMER_APPROVED" });
  const pastDone = await seedReviewFixture(email, { ordinal: 85, customer: "Done Guest", status: "FINAL_LOCKED" });
  const pastNone = await seedReviewFixture(email, { ordinal: 86, customer: "Gone Guest", status: "DRAFT", noSelection: true });
  for (const past of [pastOutstanding, pastDone, pastNone]) await setOrderEventDay(past.orderId, "2026-09-01");

  const row = (name: string) => page.getByRole("row").filter({ hasText: name });

  // Default list: upcoming orders with their approval status; "Not Started" for the one without; no past order.
  await page.goto("/orders");
  await expect(row("Review Guest").getByTestId("order-approval-cell")).toHaveText("Needs Review");
  await expect(row("Sent Guest").getByTestId("order-approval-cell")).toHaveText("Awaiting Customer Approval");
  await expect(row("Fresh Guest").getByTestId("order-approval-cell")).toHaveText("Not Started");
  for (const hidden of ["Late Guest", "Done Guest", "Gone Guest"]) await expect(page.getByText(hidden)).toHaveCount(0);

  // The approval filter, by address (the same params the dropdown sets).
  await page.goto("/orders?approval=NOT_STARTED");
  await expect(page.getByText("Fresh Guest").first()).toBeVisible();
  await expect(page.getByText("Review Guest")).toHaveCount(0);
  await page.goto("/orders?approval=SENT_TO_CUSTOMER");
  await expect(page.getByText("Sent Guest").first()).toBeVisible();
  await expect(page.getByText("Fresh Guest")).toHaveCount(0);
  await page.goto("/orders?approval=bogus"); // an unknown value is ignored, not an empty list
  await expect(page.getByText("Review Guest").first()).toBeVisible();

  // The Past view: only the past order with outstanding approval work (not the sent-to-kitchen or the one without an approval).
  await page.goto("/orders?view=past");
  await expect(row("Late Guest").getByTestId("order-approval-cell")).toHaveText("Customer Approved");
  await expect(page.getByText("Done Guest")).toHaveCount(0);
  await expect(page.getByText("Gone Guest")).toHaveCount(0);
  await expect(page.getByText("Review Guest")).toHaveCount(0); // an upcoming order is not in the Past view
  expect(review.orderId && sent.orderId && none.orderId).toBeTruthy();

  // The view switch is reachable from the list itself.
  await page.goto("/orders");
  await page.getByRole("combobox", { name: "Orders view" }).click();
  await page.getByRole("option", { name: "Past: Approval Pending" }).click();
  await expect(page).toHaveURL(/view=past/);
  await expect(page.getByText("Late Guest").first()).toBeVisible();
});
