import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedReviewFixture, setMemberRole, setRoleGrants } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Menu Approvals + Orders merge, Phase 4: Orders is the way in. The old `/menu-approvals` queue and `/menu-approvals/[id]` page redirect
 * (to the Orders list and to the order's Menu Approval tab), the sidebar stops listing the old entry for roles that can open Orders, and
 * a role that can approve menus but not open Orders keeps the queue as its only way in. The public customer link is not touched.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the old pages redirect to Orders and the approval tab, and the sidebar entry is gone", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-redirect-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const sent = await seedReviewFixture(email, { ordinal: 61, customer: "Redirect Guest", status: "SENT_TO_CUSTOMER", versions: 2, link: true });

  await page.goto("/orders");
  await expect(page.getByRole("link", { name: "Orders", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Menu Approvals" })).toHaveCount(0);

  // The queue goes to the Orders list; a status in the address becomes the approval filter; an unknown one is dropped.
  await page.goto("/menu-approvals");
  await expect(page).toHaveURL(/\/orders$/);
  await page.goto("/menu-approvals?status=SENT_TO_CUSTOMER");
  await expect(page).toHaveURL(/\/orders\?approval=SENT_TO_CUSTOMER$/);
  await page.goto("/menu-approvals?status=bogus");
  await expect(page).toHaveURL(/\/orders$/);

  // The review page goes to the order's tab, keeping a version being viewed; a bad version is dropped.
  await page.goto(`/menu-approvals/${sent.selectionId}`);
  await expect(page).toHaveURL(new RegExp(`/orders/${sent.orderId}\\?tab=approval$`));
  await expect(page.locator("#order-panel-approval")).toBeVisible();
  await page.goto(`/menu-approvals/${sent.selectionId}?version=1`);
  await expect(page).toHaveURL(new RegExp(`/orders/${sent.orderId}\\?tab=approval&version=1$`));
  await expect(page.getByText(/Viewing Version 1/)).toBeVisible();
  await page.goto(`/menu-approvals/${sent.selectionId}?version=abc`);
  await expect(page).toHaveURL(new RegExp(`/orders/${sent.orderId}\\?tab=approval$`));

  // An approval that does not exist is refused, not redirected.
  expect((await page.goto("/menu-approvals/ms_does_not_exist"))?.status()).toBe(404);
});

test("a role that approves menus but cannot open Orders keeps the queue, and its links still reach the order", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-redirect-only-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const draft = await seedReviewFixture(email, { ordinal: 62, customer: "Queue Guest", status: "DRAFT" });
  await setRoleGrants(email, "salesEvents", { menus: ["view", "approve"] });
  await setMemberRole(email, "salesEvents");

  // No Orders entry (they cannot open the list), so the queue is their way in and stays in the sidebar.
  await page.goto("/menu-approvals");
  await expect(page).toHaveURL(/\/menu-approvals$/);
  await expect(page.getByText("Queue Guest").first()).toBeVisible();
  // The queue shows names and events only: no phone, email, amount or payment detail for this role.
  const queueHtml = await page.content();
  expect(queueHtml).not.toContain(draft.customerPhone);
  expect(queueHtml).not.toContain("40,000");
  await expect(page.getByRole("link", { name: "Menu Approvals" })).toBeVisible();
  expect((await page.goto("/orders"))?.status()).toBe(403);

  // The review link from the queue lands on the restricted order view, with the approval tab.
  await page.goto(`/menu-approvals/${draft.selectionId}`);
  await expect(page).toHaveURL(new RegExp(`/orders/${draft.orderId}\\?tab=approval$`));
  await expect(page.getByTestId("approval-only-order")).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(draft.customerPhone);
});
