import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, countInvoicesForOrder, getApprovalState, getOrderKind, getOrderRow, seedReviewFixture, setMemberRole, setRoleGrants } from "./db";
import { signUpCaterer } from "./auth-helpers";
import { openApprovalHistory, submitVenueDetailsAsCustomer, waitForHydration } from "./approval-helpers";

/**
 * The order's Menu Approval tab and the restricted view for an approval-only person (Menu Approvals + Orders merge, Phase 2).
 * Orders are inserted straight into each state; the real pages and the real server actions do the rest. The permission, location and
 * stage rules themselves are proved in `src/modules/menu-approvals/__tests__/` against the real database; this checks what the pages show.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

const tabPanel = (page: Page) => page.locator("#order-panel-approval, #order-approval-sidebar");

async function openOrderTab(page: Page, orderId: string, query = "?tab=approval") {
  await page.goto(`/orders/${orderId}${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The heading is server-rendered, so it shows before the page is interactive; a click in that gap is lost (dev server, heavy order form).
  await page.waitForLoadState("networkidle");
  await waitForHydration(page); // networkidle is only a proxy; this waits for React's own handlers
}

test("the tab: opens by address, runs the whole approval from the order, keeps the customer link and versions, and the price is frozen outside Needs Review", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `e2e-ordertab-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const draft = await seedReviewFixture(email, { ordinal: 11, customer: "Tab Draft", status: "DRAFT" });
  const sent = await seedReviewFixture(email, { ordinal: 12, customer: "Tab Sent", status: "SENT_TO_CUSTOMER", versions: 1, link: true });

  // ---- by address: ?tab=approval opens the tab, an unknown tab falls back to the first ----
  await openOrderTab(page, draft.orderId);
  await expect(page.getByRole("tab", { name: "Menu Approval" })).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page).getByTestId("approval-tab-status")).toHaveText("Needs Review");
  await openOrderTab(page, draft.orderId, "?tab=nonsense");
  await expect(page.getByRole("tab", { name: "Order Details" })).toHaveAttribute("aria-selected", "true");

  // ---- send from the tab, then the customer's link works (no login) ----
  await openOrderTab(page, draft.orderId);
  await expect(tabPanel(page).getByRole("button", { name: "Send Menu for Approval" })).toBeVisible();
  await tabPanel(page).getByRole("button", { name: "Send Menu for Approval" }).click();
  await expect(tabPanel(page).getByText(/Version 1 is with the customer/)).toBeVisible();
  const linkV1 = new URL((await tabPanel(page).locator("code").filter({ hasText: "/menu-approval/" }).first().innerText()).trim()).pathname;
  const customerContext = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const customerPage = await customerContext.newPage();
  await customerPage.goto(linkV1);
  await expect(customerPage.getByRole("heading", { name: "Review & Approve Your Menu" })).toBeVisible();
  await customerPage.getByRole("button", { name: "Request Changes" }).click();
  await customerPage.getByLabel("What would you like to change?").fill("Please make it lighter.");
  await customerPage.getByRole("button", { name: "Submit Request" }).click();
  await expect(customerPage.getByText("Request sent — thank you!")).toBeVisible();

  // ---- changes requested: the note is in the tab, resend (v2), v1's link is dead, history keeps both ----
  await openOrderTab(page, draft.orderId);
  await expect(tabPanel(page).getByTestId("menu-note")).toContainText("Please make it lighter.");
  await tabPanel(page).getByRole("button", { name: "Send Updated Menu for Approval" }).click();
  await expect(tabPanel(page).getByText(/Version 2 is with the customer/)).toBeVisible();
  const linkV2 = new URL((await tabPanel(page).locator("code").filter({ hasText: "/menu-approval/" }).first().innerText()).trim()).pathname;
  expect(linkV2).not.toBe(linkV1);
  await customerPage.goto(linkV1);
  await expect(customerPage.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();
  const versionsDialog = await openApprovalHistory(page, tabPanel(page));
  await expect(versionsDialog.getByTestId("menu-version-row")).toHaveCount(2);

  // a version opens in the same tab, with Compare, and Back to current keeps the tab
  await versionsDialog.getByTestId("menu-version-row").last().getByRole("button", { name: "View version" }).click();
  await expect(page).toHaveURL(/tab=approval&version=1/);
  await expect(page.getByRole("tab", { name: "Menu Approval" })).toHaveAttribute("aria-selected", "true");
  await expect(tabPanel(page).getByText(/Viewing Version 1/)).toBeVisible();
  await tabPanel(page).getByRole("button", { name: "Back to current" }).click();
  await expect(page).toHaveURL(/tab=approval$/);

  // ---- recall, then edit and resend, then the customer approves the latest version ----
  await tabPanel(page).getByRole("button", { name: "Recall to Edit" }).click();
  await expect(tabPanel(page).getByRole("button", { name: /^Send/ })).toBeVisible(); // recalled: back with the team, no banner on a Draft
  await expect(tabPanel(page).getByText("Check the dishes and the guest count")).toHaveCount(0);
  await tabPanel(page).getByRole("button", { name: "Send Updated Menu for Approval" }).click();
  await expect(tabPanel(page).getByText(/Version 3 is with the customer/)).toBeVisible();
  const linkV3 = new URL((await tabPanel(page).locator("code").filter({ hasText: "/menu-approval/" }).first().innerText()).trim()).pathname;
  await customerPage.goto(linkV3);
  await customerPage.getByRole("button", { name: "Approve Menu" }).click();
  await submitVenueDetailsAsCustomer(customerPage, { building: "Green Villa", address: "12 Green Villa Road", contact: "Ravi", phone: "9000000002", door: "12" });
  await customerContext.close();

  // ---- approved: Approve & Send to Kitchen from the tab hands the order over (Draft invoice, kitchen) ----
  await openOrderTab(page, draft.orderId);
  await expect(tabPanel(page).getByTestId("approval-tab-status")).toHaveText("Customer Approved");
  await tabPanel(page).getByRole("button", { name: "Approve & Send to Kitchen" }).click();
  await expect(tabPanel(page).getByTestId("approval-tab-status")).toHaveText("Approved & Sent to Kitchen");
  await expect.poll(() => getApprovalState(draft.orderId)).toEqual({ selection: "FINAL_LOCKED", order: "SENT_TO_KITCHEN" });
  expect(await countInvoicesForOrder(draft.orderId)).toBe(1); // the Draft invoice was written with the hand-off

  // ---- the price is frozen in the order form while the menu is with the customer ----
  await openOrderTab(page, sent.orderId, "");
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.locator("#order-panel-pricing").getByTestId("order-locked-fields")).toBeVisible();
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.locator("#order-panel-details").getByTestId("order-locked-fields")).toBeVisible(); // the guest counts
  // Saving the order with a change that is not a price still works while the price is frozen: the form re-submits every price field unchanged.
  await page.getByRole("tab", { name: "Additional Details" }).click();
  await page.getByLabel("Additional Notes").fill("Gate code 4411");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")),
    page.getByTestId("order-save-top").click(),
  ]);
  await expect(page.locator("p[role=alert]"), await page.locator("p[role=alert]").allInnerTexts().then((t) => t.join(" | "))).toHaveCount(0);
  await expect.poll(async () => (await getOrderRow(sent.orderId)).notes).toBe("Gate code 4411");
  // ...and is open again once the menu is recalled
  await page.getByRole("tab", { name: "Menu Approval" }).click();
  await tabPanel(page).getByRole("button", { name: "Recall to Edit" }).click();
  await expect(tabPanel(page).getByRole("button", { name: /^Send/ })).toBeVisible(); // recalled: back with the team, no banner on a Draft
  await expect(tabPanel(page).getByText("Check the dishes and the guest count")).toHaveCount(0);
  await openOrderTab(page, sent.orderId, "");
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.locator("#order-panel-pricing").getByTestId("order-locked-fields")).toHaveCount(0);
});

test("when the customer's page is older than the order the tab says so, lists what differs, and Resend updated menu sends the current order as a new version", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-ordertab-stale-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  // The seeded order and its hand-made version 1 do not match each other: the customer's copy is older than the order.
  const sent = await seedReviewFixture(email, { ordinal: 14, customer: "Stale Link", status: "SENT_TO_CUSTOMER", versions: 1, link: true });
  await openOrderTab(page, sent.orderId);
  const notice = page.getByTestId("approval-stale-notice");
  await expect(notice).toContainText("Send the menu again to update it.");
  await expect(notice.getByRole("listitem").first()).toBeVisible();
  const before = await getApprovalState(sent.orderId);

  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")),
    notice.getByRole("button", { name: "Resend updated menu" }).click(),
  ]);
  await expect(page.getByTestId("approval-stale-notice")).toHaveCount(0);
  const after = await getApprovalState(sent.orderId);
  expect(JSON.stringify(after)).not.toBe(JSON.stringify(before)); // a new version exists
  await expect(page.getByText("Version 2").first()).toBeVisible();
});

test("guests cannot be edited while the menu is with the customer (and the page says why), and sending is refused while the order has unsaved edits", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-ordertab-unsaved-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const sent = await seedReviewFixture(email, { ordinal: 16, customer: "Frozen Guests", status: "SENT_TO_CUSTOMER", versions: 1, link: true });
  const draft = await seedReviewFixture(email, { ordinal: 17, customer: "Unsaved Guests", status: "DRAFT", versions: 0 });

  // With the customer: no Edit button, a note instead.
  await page.goto(`/orders/${sent.orderId}`);
  await page.getByRole("tab", { name: "Order Details" }).click();
  await expect(page.getByTestId("order-frozen-banner")).toContainText("Recall the menu"); // one notice for the whole page, not one per card
  await expect(page.getByTestId("guests-frozen-note")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit customer details" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit event information" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit guest information" })).toHaveCount(0);
  // The Individual / Custom Pricing switch is not a native control, so the locked fieldset alone would not stop it: it is disabled itself.
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.locator("#order-panel-pricing").getByRole("switch", { name: "Individual / Custom Pricing" })).toBeDisabled();

  // Needs Review: change the adults without saving, then try to send: refused with the reason; after saving it sends.
  await page.goto(`/orders/${draft.orderId}`);
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByRole("button", { name: "Edit guest information" }).click();
  await page.getByLabel("Adults", { exact: true }).fill("81");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Menu Approval" }).click();
  await tabPanel(page).getByRole("button", { name: "Send Menu for Approval" }).click();
  await expect(tabPanel(page).getByRole("alert").filter({ hasText: "unsaved changes" })).toBeVisible();
  await expect(tabPanel(page).getByTestId("approval-tab-status")).toHaveText("Needs Review");

  // The unsaved edit stays announced on every tab, with a Save button, so it can't be forgotten after switching.
  const banner = page.getByTestId("unsaved-note");
  await expect(banner).toContainText("Unsaved changes in the order details");
  for (const tab of ["Order Details", "Pricing & Payment", "Inventory", "Additional Details", "Menu Approval"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(banner).toBeVisible();
  }
  // Saving from the banner works from the Menu Approval tab, where the page's own Save only knows the meal plan.
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")), page.getByTestId("unsaved-note-save").click()]);
  await expect(banner).toHaveCount(0);
  await tabPanel(page).getByRole("button", { name: "Send Menu for Approval" }).click();
  await expect(tabPanel(page).getByText(/Version 1 is with the customer/)).toBeVisible();
});

test("orders with no menu approval, a Completed order and a Cancelled order", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-ordertab-none-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const notStarted = await seedReviewFixture(email, { ordinal: 21, customer: "Not Started", status: "DRAFT", noSelection: true });
  const noType = await seedReviewFixture(email, { ordinal: 22, customer: "No Type", status: "DRAFT", noEventType: true });
  const completed = await seedReviewFixture(email, { ordinal: 23, customer: "Done Order", status: "FINAL_LOCKED", versions: 1, orderStatus: "COMPLETED", venueSubmitted: true });
  const closedNoMenu = await seedReviewFixture(email, { ordinal: 24, customer: "Cancelled Order", status: "DRAFT", noSelection: true, orderStatus: "CANCELLED" });

  // not started, with an Event Type: offered, nothing is sent, and a second start adds nothing
  await openOrderTab(page, notStarted.orderId);
  await expect(tabPanel(page).getByTestId("approval-not-started")).toContainText("Menu approval not started");
  await tabPanel(page).getByRole("button", { name: "Start menu approval" }).click();
  await expect(tabPanel(page).getByTestId("approval-tab-status")).toHaveText("Needs Review");
  expect((await getApprovalState(notStarted.orderId)).selection).toBe("DRAFT");

  // no Event Type: explained, no start button
  await openOrderTab(page, noType.orderId);
  await expect(tabPanel(page).getByTestId("approval-not-started")).toContainText("needs an Event Type");
  await expect(tabPanel(page).getByRole("button", { name: "Start menu approval" })).toHaveCount(0);

  // Completed: read-only, no stage buttons, no new notes
  await openOrderTab(page, completed.orderId);
  await expect(tabPanel(page).getByTestId("approval-tab-status")).toHaveText("Approved & Sent to Kitchen");
  await expect(tabPanel(page).getByRole("button", { name: /Send|Recall|Approve|Save Changes/ })).toHaveCount(0);
  await expect(tabPanel(page).getByRole("button", { name: "Add Note" })).toHaveCount(0);
  const closedDialog = await openApprovalHistory(page, tabPanel(page));
  await expect(closedDialog.getByLabel("Change status")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Cancelled with no menu approval: closed, no start button
  await openOrderTab(page, closedNoMenu.orderId);
  await expect(tabPanel(page).getByTestId("approval-not-started")).toContainText("closed");
  await expect(tabPanel(page).getByRole("button", { name: "Start menu approval" })).toHaveCount(0);
});

test("a person who can approve menus but not edit orders gets the restricted view, and cannot quote a price", async ({ page }) => {
  test.setTimeout(240_000);
  const email = `e2e-approvalonly-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const draft = await seedReviewFixture(email, { ordinal: 31, customer: "Only Draft", status: "DRAFT" });
  const custom = await seedReviewFixture(email, { ordinal: 32, customer: "Only Custom", status: "DRAFT", customMenu: true });
  const sent = await seedReviewFixture(email, { ordinal: 33, customer: "Only Sent", status: "SENT_TO_CUSTOMER", versions: 1, link: true });
  await setRoleGrants(email, "salesEvents", { orders: ["view"], menus: ["view", "approve"], customers: ["view"] });
  await setMemberRole(email, "salesEvents");

  // the restricted view: header, summary, status history and the tab; no order form, none of the private fields
  await page.goto(`/orders/${draft.orderId}`);
  await expect(page.getByTestId("approval-only-order")).toBeVisible();
  await expect(page.getByTestId("approval-only-banner")).toContainText("view-only for your role");
  await expect(page.getByRole("tablist", { name: "Sections" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Save changes|Discard changes|Delete Order/ })).toHaveCount(0);
  const restrictedDialog = await openApprovalHistory(page);
  await expect(restrictedDialog.getByLabel("Change status")).toHaveCount(1); // only the menu's own status; the order's status control is not offered
  await page.keyboard.press("Escape");
  const html = await page.content();
  expect(html).not.toContain(draft.customerPhone); // the customer's phone never reaches this page
  expect(html).not.toContain("Pricing & Payment");

  // planner editable in Needs Review (Decision 7); the approval actions work
  await expect(page.getByRole("button", { name: "Edit Items" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Menu for Approval" })).toBeVisible();

  // a custom menu: the quote is not theirs to enter, and sending is blocked with the reason
  await page.goto(`/orders/${custom.orderId}`);
  await expect(page.getByTestId("custom-price-readonly")).toContainText("No price has been quoted yet");
  await expect(page.locator("#ma-price")).toHaveCount(0);
  await page.getByRole("button", { name: "Send Menu for Approval" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("no price yet");
  expect((await getApprovalState(custom.orderId)).selection).toBe("DRAFT");

  // with the customer: read-only planner, Recall works, and the order itself cannot be changed from here
  await page.goto(`/orders/${sent.orderId}`);
  await expect(page.getByRole("button", { name: "Edit Items" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recall to Edit" })).toBeVisible();
  await page.getByRole("button", { name: "Recall to Edit" }).click();
  await expect.poll(async () => (await getApprovalState(sent.orderId)).selection).toBe("DRAFT");
  const before = await getOrderRow(sent.orderId);
  expect(before.notes).toBeNull();
});

test("a person who can edit orders but not approve menus sees the tab read-only; someone with neither is refused", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-editonly-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const sent = await seedReviewFixture(email, { ordinal: 41, customer: "Edit Only", status: "SENT_TO_CUSTOMER", versions: 1, link: true, notes: [{ authorType: "CUSTOMER", body: "Looks fine so far." }] });
  await setRoleGrants(email, "manager", { orders: ["view", "create", "edit"], menus: ["view"], customers: ["view"] });
  await setMemberRole(email, "manager");

  await openOrderTab(page, sent.orderId);
  await expect(page.getByRole("tab", { name: "Order Details" })).toBeVisible(); // the editable order page
  await expect(tabPanel(page).getByText("View only")).toBeVisible();
  await expect(tabPanel(page).getByTestId("approval-tab-status")).toHaveText("Awaiting Customer Approval");
  const readOnlyDialog = await openApprovalHistory(page, tabPanel(page));
  await expect(readOnlyDialog.getByTestId("menu-version-row")).toHaveCount(1); // version history is readable
  await expect(readOnlyDialog.getByLabel("Change status")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(tabPanel(page).getByTestId("menu-note")).toContainText("Looks fine so far.");
  await expect(tabPanel(page).getByRole("button", { name: /Send|Recall|Approve|Save Changes|Add Note/ })).toHaveCount(0);
  await expect(tabPanel(page).getByLabel("Change status")).toHaveCount(0);
  await expect(tabPanel(page).getByPlaceholder("Add a note for the team…")).toHaveCount(0);

  // neither permission: refused, as before
  await setRoleGrants(email, "manager", { orders: ["view"], menus: ["view"], customers: ["view"] });
  const response = await page.goto(`/orders/${sent.orderId}`);
  expect(response?.status()).toBe(403);
});

test("the Pricing Summary and the Order Status card agree with the rest of the order", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-ordertab-pricing-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const draft = await seedReviewFixture(email, { ordinal: 61, customer: "Pricing Match", status: "DRAFT", versions: 0 });
  await openOrderTab(page, draft.orderId);
  const grandTotal = async (scope: ReturnType<typeof page.locator>) => (await scope.getByText("Grand Total", { exact: true }).filter({ visible: true }).locator("xpath=ancestor::div[1]").innerText()).replace(/[^0-9.]/g, "");
  const summaryTotal = await grandTotal(page.locator("#order-approval-sidebar"));
  // the order's own Pricing Details (Pricing & Payment tab) shows the same total
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  expect(await grandTotal(page.locator("main"))).toBe(summaryTotal);
  // the Order Status card is in the sidebar on the other tabs and opens its history in a drawer
  for (const tab of ["Order Details", "Pricing & Payment", "Staffing & Logistics"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.locator("aside").getByRole("button", { name: "View status history" })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Order Details" }).click();
  await page.getByRole("button", { name: "Edit order status" }).count().then((n) => expect(n).toBe(0)); // no inline Edit any more
  await page.getByRole("tab", { name: "Menu Approval" }).click();
  await expect(page.locator("aside").getByRole("button", { name: "View status history" })).toBeHidden(); // Approval Status takes its place here
});

test("a second meal asks to make it a Multi Order, removing back to one asks for Single, the type follows the save, and one meal always stays", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-ordertab-kind-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const draft = await seedReviewFixture(email, { ordinal: 62, customer: "Kind Sync", status: "DRAFT", versions: 0 });
  await openOrderTab(page, draft.orderId);
  const panel = tabPanel(page);
  expect(await getOrderKind(draft.orderId)).toBe("SINGLE");

  // the only meal can't be removed
  await expect(panel.getByRole("button", { name: /^Remove / })).toBeDisabled();

  // a second meal type asks first; Cancel leaves the plan alone
  await panel.getByRole("button", { name: "Lunch", exact: true }).click();
  const multi = page.getByRole("alertdialog", { name: "This will be a Multi Order" });
  await expect(multi).toBeVisible();
  await multi.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByRole("button", { name: "Remove Lunch" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Lunch", exact: true }).click();
  await page.getByRole("alertdialog", { name: "This will be a Multi Order" }).getByRole("button", { name: "Add meal" }).click();
  await expect(panel.getByRole("button", { name: "Remove Lunch" })).toBeVisible();

  // saving moves the order type with it
  await page.getByTestId("order-save-top").click();
  await expect.poll(() => getOrderKind(draft.orderId)).toBe("MULTI");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await waitForHydration(page);
  await expect(page.getByText("Multi Order").first()).toBeVisible();

  // removing it always asks, and says the order goes back to Single
  await panel.getByRole("button", { name: "Remove Lunch" }).click();
  const remove = page.getByRole("alertdialog", { name: /Remove Lunch/ });
  await expect(remove).toContainText("Single Order");
  await remove.getByRole("button", { name: "Remove" }).click();
  await page.getByTestId("order-save-top").click();
  await expect.poll(() => getOrderKind(draft.orderId)).toBe("SINGLE");
});

test("Pricing Details: per-plate prices follow the menu until Individual / Custom Pricing is on, then they can be edited and saved", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-ordertab-custom-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const draft = await seedReviewFixture(email, { ordinal: 63, customer: "Custom Price", status: "DRAFT", versions: 0 });
  await openOrderTab(page, draft.orderId, "");
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  const toggle = page.getByRole("switch", { name: "Individual / Custom Pricing" });
  const rows = page.getByTestId("per-plate-row");

  // Off: the menu's own per-plate price, read-only
  await expect(toggle).not.toBeChecked();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole("spinbutton")).toHaveCount(0);
  await expect(rows.first()).toContainText("/ plate");
  // On: an editable per-plate price per meal, starting at the menu's price
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(rows.first().getByRole("spinbutton")).not.toHaveValue("");
  const price = rows.first().getByRole("spinbutton");
  await price.fill("500");
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")), page.getByTestId("order-save-top").click()]);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Pricing & Payment" }).click();
  await expect(page.getByTestId("per-plate-row").first().getByRole("spinbutton")).toHaveValue("500");
});
