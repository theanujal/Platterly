import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, cleanupInviteeUser, getPendingInvitationId } from "./db";
import { pickCalendarDate, selectOption, signUpCaterer, verifyEmailViaOtp } from "./auth-helpers";

/**
 * The whole order journey in one run, across the three people who touch it
 * (AJ, 2026-10-01): a customer, the caterer's owner, and a Kitchen Team member.
 *
 *   customer orders on the public storefront (no login)
 *   -> owner sees it Pending Review, sends the menu for approval
 *   -> customer approves through the no-login link
 *   -> owner sends it to the kitchen
 *   -> owner invites a Kitchen Team member, who joins (verify once, straight to the Dashboard)
 *   -> kitchen member is kept out of Menu Approvals and Orders editing, but runs the Kitchen Dashboard:
 *      Pending -> In Preparation -> Ready -> Delivered
 *   -> the owner's order reads Completed, and the customer's old link stays dead
 *   -> the kitchen member signs out and back in with no second code
 *
 * `menu-approvals.spec.ts` goes deeper on each screen (change requests, versions, manual status);
 * this one is about the hand-offs between people and what each role may and may not do.
 */

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const cleanupOwnerEmails: string[] = [];
const cleanupKitchenEmails: string[] = [];

test.afterEach(async () => {
  const kitchenEmail = cleanupKitchenEmails.pop();
  if (kitchenEmail) await cleanupInviteeUser(kitchenEmail);
  const ownerEmail = cleanupOwnerEmails.pop();
  if (ownerEmail) await cleanupOnboardingTestUser(ownerEmail);
});

test("customer orders, owner sends the menu, customer approves, the kitchen team cooks and delivers, and the order completes", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString().slice(-6);
  const ownerEmail = `e2e-journey-owner-${Date.now()}@example.test`;
  const kitchenEmail = `e2e-journey-kitchen-${Date.now()}@example.test`;
  cleanupOwnerEmails.push(ownerEmail);
  cleanupKitchenEmails.push(kitchenEmail);
  const slug = `journey-${suffix}`;
  const customerName = `Journey Customer ${suffix}`;

  // ===== Owner: sign up, claim the link, and build the smallest catalog the storefront needs =====
  await signUpCaterer(page, ownerEmail, { firstName: "Journey", lastName: "Owner", closeClaimDialog: false });
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const menuName = `Journey Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("400");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const categoryName = `Mains ${suffix}`;
  await page.goto("/menu-catalog/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category Name").fill(categoryName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByPlaceholder("Max selection").fill("1");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("150");
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("checkbox", { name: categoryName }).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // ===== Customer: the public order flow, no login =====
  // The public form allows 15 draft starts an hour per address, and every run shares one, so each run presents its own.
  const customerContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  const customerPage = await customerContext.newPage();

  await customerPage.goto(`/${slug}`);
  await customerPage.getByLabel("Your Name").fill(customerName);
  await customerPage.getByLabel("Email Address").fill(`journey-customer-${suffix}@example.test`);
  await customerPage.getByRole("textbox", { name: "Phone Number" }).fill("9876500123");
  // Two days out: the 2-day notice rule, and still inside the Kitchen Dashboard's today-through-+2-days board.
  await pickCalendarDate(customerPage, customerPage.getByLabel("Event Date"), toLocalIsoDate(new Date(Date.now() + 2 * 86_400_000)));
  await customerPage.getByLabel("Event Type").click();
  await customerPage.getByRole("option", { name: eventTypeName }).click();
  await customerPage.getByLabel("Number of Guests").fill("100");
  await customerPage.getByRole("checkbox", { name: "Dinner" }).click();
  await customerPage.getByRole("radio", { name: /^Vegetarian/ }).click();
  await customerPage.getByRole("button", { name: "Continue to Menu Selection" }).click();

  const menuCard = customerPage.getByTestId("menu-card").filter({ hasText: menuName });
  await menuCard.getByRole("button", { name: "Select", exact: true }).click();
  await customerPage.getByRole("button", { name: "Continue to Menu Items" }).click();

  await customerPage.getByTestId("item-card").filter({ hasText: itemName }).getByRole("button", { name: "Select", exact: true }).click();
  await customerPage.getByRole("button", { name: "Continue to Add-ons" }).click();
  await customerPage.getByRole("button", { name: "Continue to Venue & Delivery" }).click(); // add-ons are optional

  await customerPage.getByLabel("Venue Type").click();
  await customerPage.getByRole("option", { name: "Home" }).click();
  await customerPage.getByLabel("Venue / Building Name").fill("Journey Villa");
  await customerPage.getByLabel("Door / Flat / House No.").fill("7");
  await customerPage.getByLabel("Complete Venue Address").fill("7 Journey Road");
  await customerPage.getByLabel("Venue Contact Person").fill("Meera");
  await customerPage.getByRole("textbox", { name: "Contact Number" }).fill("9000000007");
  await customerPage.getByLabel("Vehicle Access").click();
  await customerPage.getByRole("option", { name: "Vehicle can enter venue & parking available" }).click();
  await customerPage.getByRole("button", { name: "Review Order" }).click();

  await expect(customerPage.getByTestId("review-total")).toHaveText("₹40,000.00"); // 400 x 100 guests
  await customerPage.getByRole("button", { name: "Submit Request" }).click();
  await expect(customerPage.getByTestId("confirmation")).toContainText("Request Submitted Successfully!");

  // ===== Owner: the order arrived, and the menu goes out for approval =====
  const orderCard = () => page.getByTestId("order-card").filter({ hasText: customerName });
  await page.goto("/orders");
  await page.getByLabel("Grid view").click();
  await expect(orderCard()).toContainText("Pending Review");

  await page.goto("/menu-approvals");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Send Menu for Approval" }).click();
  await expect(page.getByText(/Version 1 is with the customer/)).toBeVisible();
  const approvalPath = new URL((await page.locator("code").filter({ hasText: "/menu-approval/" }).innerText()).trim()).pathname;

  await page.goto("/orders");
  await page.getByLabel("Grid view").click();
  await expect(orderCard()).toContainText("Awaiting Customer Approval");

  // ===== Customer: approves through the no-login link =====
  await customerPage.goto(approvalPath);
  await expect(customerPage.getByRole("heading", { name: "Review & Approve Menu" })).toBeVisible();
  await expect(customerPage.getByText(itemName)).toBeVisible();
  await customerPage.getByRole("button", { name: "Approve Menu" }).click();
  await expect(customerPage.getByText("Menu approved — thank you!")).toBeVisible();

  // ===== Owner: the order is Approved, and goes to the kitchen =====
  await page.goto("/orders");
  await page.getByLabel("Grid view").click();
  await expect(orderCard()).toContainText("Approved");
  await page.goto("/menu-approvals");
  await expect(page.getByText("Customer Approved")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Approve & Send to Kitchen" }).click();
  await expect(page.getByText(/Approved and sent to the kitchen on/)).toBeVisible();
  await page.goto("/orders");
  await page.getByLabel("Grid view").click();
  await expect(orderCard()).toContainText("Sent to Kitchen");

  // ===== Owner: invites a Kitchen Team member =====
  await page.goto("/settings/team");
  await page.getByRole("tab", { name: "Invite Member" }).click();
  await page.getByLabel("Email Address").fill(kitchenEmail);
  await selectOption(page, page.getByLabel("Role", { exact: true }), "Kitchen Team");
  await expect(page.getByText("Permissions included:")).toBeVisible();
  await page.getByRole("button", { name: "Send Invitation" }).click();
  await expect(page.getByText(kitchenEmail)).toBeVisible();
  const invitationId = await getPendingInvitationId(kitchenEmail);
  expect(invitationId).not.toBeNull();

  // ===== Kitchen member: joins with one email code and lands on the Dashboard, nothing in between =====
  const kitchenContext = await browser.newContext();
  const kitchenPage = await kitchenContext.newPage();
  await kitchenPage.goto(`/invitations/${invitationId}/accept`);
  await kitchenPage.getByLabel("First name").fill("Kitchen");
  await kitchenPage.getByLabel("Last name").fill("Cook");
  await kitchenPage.getByLabel("Phone", { exact: true }).fill("9800000055");
  await kitchenPage.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await kitchenPage.getByLabel("Confirm password").fill("correct-horse-battery");
  await kitchenPage.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await kitchenPage.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(kitchenPage, kitchenEmail);
  await expect(kitchenPage).toHaveURL(/\/dashboard$/);

  // ===== Kitchen member: what the role may NOT do =====
  // Menu Approvals is the sales team's pipeline, closed to the kitchen role (permissions.ts).
  await kitchenPage.goto("/menu-approvals");
  await expect(kitchenPage.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await expect(kitchenPage.getByRole("button", { name: "Review" })).toHaveCount(0);
  await expect(kitchenPage.getByText(customerName, { exact: true })).toHaveCount(0);

  // Orders is view-only for the kitchen role: it can open the order but not change its status.
  await kitchenPage.goto("/orders");
  await kitchenPage.getByLabel("Grid view").click();
  await kitchenPage.getByTestId("order-card").filter({ hasText: customerName }).getByRole("link", { name: customerName }).click();
  await expect(kitchenPage).toHaveURL(/\/orders\/.+/);
  await expect(kitchenPage.getByRole("combobox", { name: "Change status" })).toHaveCount(0);

  // ===== Kitchen member: runs the Kitchen Dashboard =====
  await kitchenPage.goto("/kitchen-dashboard");
  const pendingColumn = kitchenPage.locator('[data-stage="PENDING"]');
  await expect(pendingColumn.getByText(customerName, { exact: true })).toBeVisible();

  // The prep sheet: what to cook, for how many (100 guests + the 10% extra the kitchen rules add).
  await pendingColumn.getByRole("button", { name: "View Details" }).click();
  await expect(kitchenPage.getByRole("heading", { name: customerName })).toBeVisible();
  await expect(kitchenPage.getByText("Cook for 110 portions (10% extra)")).toBeVisible();
  await kitchenPage.goto("/kitchen-dashboard");

  const stageDropdown = (column: ReturnType<typeof kitchenPage.locator>) => column.getByRole("combobox", { name: "Kitchen production stage" });
  await stageDropdown(pendingColumn).click();
  await kitchenPage.getByRole("option", { name: "In Preparation" }).click();
  const preparingColumn = kitchenPage.locator('[data-stage="IN_PREPARATION"]');
  await expect(preparingColumn.getByText(customerName, { exact: true })).toBeVisible();

  await stageDropdown(preparingColumn).click();
  await kitchenPage.getByRole("option", { name: "Ready" }).click();
  const readyColumn = kitchenPage.locator('[data-stage="READY"]');
  await expect(readyColumn.getByText(customerName, { exact: true })).toBeVisible();

  await stageDropdown(readyColumn).click();
  await kitchenPage.getByRole("option", { name: "Delivered" }).click();
  await expect(kitchenPage.locator('[data-stage="DELIVERED"]').getByText(customerName, { exact: true })).toBeVisible();

  // ===== Owner: the order is Completed, and the customer's approval link is dead =====
  await page.goto("/orders");
  await page.getByLabel("Grid view").click();
  await expect(orderCard()).toContainText("Completed");
  await customerPage.goto(approvalPath);
  await expect(customerPage.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();
  await customerContext.close();

  // ===== Kitchen member: signs out and straight back in, no second email code =====
  await kitchenPage.goto("/dashboard");
  await kitchenPage.getByRole("button", { name: "Sign out" }).click();
  await kitchenPage.getByLabel("Email").fill(kitchenEmail);
  await kitchenPage.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await kitchenPage.getByRole("button", { name: "Sign in to your account" }).click();
  await expect(kitchenPage).toHaveURL(/\/dashboard$/);
  await kitchenContext.close();
});
