import { test, expect, type Page } from "@playwright/test";
import { cleanupInviteeUser, cleanupOnboardingTestUser, getPendingInvitationId, seedOrderForBilling, setMemberRole } from "./db";
import { signUpCaterer, verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 15: expenses and profitability. The Expenses tab on an order records what the event cost, shows
 * profit against the order total (PRD §42), and the Profitability page lists every order's profit.
 */

const cleanupEmails: string[] = [];
const cleanupInvitees: string[] = [];

test.afterEach(async () => {
  const invitee = cleanupInvitees.pop();
  if (invitee) await cleanupInviteeUser(invitee);
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function addExpense(page: Page, opts: { category?: string; amount: string; supplier?: string }) {
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  const dialog = page.getByRole("dialog");
  if (opts.category) {
    await dialog.getByLabel("Category").click();
    await page.getByRole("option", { name: opts.category, exact: true }).click();
  }
  await dialog.getByLabel("Amount").fill(opts.amount);
  if (opts.supplier) await dialog.getByLabel("Supplier (optional)").fill(opts.supplier);
  await dialog.getByRole("button", { name: "Add Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

test("add, edit and delete expenses on an order; the Profitability page follows", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-expenses-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Expense", lastName: "Tester", phone: "9800000077" });
  const { orderId } = await seedOrderForBilling(email, 20000);

  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Expenses" }).click();
  const card = page.getByTestId("expenses-card");
  await expect(card.getByText("No expenses recorded for this order yet.")).toBeVisible();
  // Revenue is the order total; with no cost the whole total is profit.
  await expect(card.getByTestId("profit-revenue")).toHaveText("₹20,000.00");
  await expect(card.getByTestId("profit-profit")).toHaveText("₹20,000.00");

  // Food 5,000 and Labour 3,000: cost 8,000, profit 12,000, margin 60%, food cost 25%.
  await addExpense(page, { amount: "5000", supplier: "Fresh Mart" });
  await addExpense(page, { category: "Labour", amount: "3000" });
  await expect(card.getByTestId("expense-row")).toHaveCount(2);
  await expect(card.getByTestId("profit-cost")).toHaveText("₹8,000.00");
  await expect(card.getByTestId("profit-profit")).toHaveText("₹12,000.00");
  await expect(card.getByTestId("profit-margin")).toHaveText("60%");
  await expect(card.getByTestId("profit-food")).toHaveText("25%");
  await expect(card.getByTestId("breakdown-FOOD")).toHaveText("₹5,000.00");
  await expect(card.getByTestId("breakdown-LABOUR")).toHaveText("₹3,000.00");
  await expect(card.getByText("Fresh Mart")).toBeVisible();

  // A zero amount is refused
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  await page.getByRole("dialog").getByLabel("Amount").fill("0");
  await page.getByRole("dialog").getByRole("button", { name: "Add Expense" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "greater than zero" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // Edit the Food expense to 7,000: cost 10,000, profit 10,000, food cost 35%
  await card.getByRole("button", { name: "Edit Food expense" }).click();
  await page.getByRole("dialog").getByLabel("Amount").fill("7000");
  await page.getByRole("dialog").getByRole("button", { name: "Save Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(card.getByTestId("profit-profit")).toHaveText("₹10,000.00");
  await expect(card.getByTestId("profit-food")).toHaveText("35%");

  // The left-menu Profitability page shows the same order
  await page.goto("/profitability");
  await expect(page.getByRole("heading", { name: "Profitability", exact: true })).toBeVisible();
  await expect(page.getByTestId("total-revenue")).toHaveText("₹20,000.00");
  await expect(page.getByTestId("total-cost")).toHaveText("₹10,000.00");
  await expect(page.getByTestId("total-profit")).toHaveText("₹10,000.00");
  await expect(page.getByTestId("total-margin")).toHaveText("50%");
  await expect(page.getByRole("link", { name: "Profitability" }).first()).toBeVisible();

  // Delete both: the profit is the order total again
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Expenses" }).click();
  for (const name of ["Edit Food expense", "Edit Labour expense"]) {
    const category = name.split(" ")[1];
    await card.getByRole("button", { name: `Delete ${category} expense` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
  }
  await expect(card.getByText("No expenses recorded for this order yet.")).toBeVisible();
  await expect(card.getByTestId("profit-profit")).toHaveText("₹20,000.00");
});

test("the Expenses page: order and company expenses, filters, and the Accounts team can enter them", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const ownerEmail = `e2e-exp-owner-${Date.now()}@example.test`;
  const accountsEmail = `e2e-exp-accounts-${Date.now()}@example.test`;
  cleanupEmails.push(ownerEmail);
  cleanupInvitees.push(accountsEmail);
  await signUpCaterer(page, ownerEmail, { firstName: "Owner", lastName: "Tester", phone: "9800000078" });
  const { orderId } = await seedOrderForBilling(ownerEmail, 20000);

  // ===== Owner: a company expense (rent) and an order expense, both from the Expenses page =====
  await page.goto("/expenses");
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await expect(page.getByText("No expenses recorded yet.")).toBeVisible();

  await page.getByRole("button", { name: "Add Expense" }).click();
  let dialog = page.getByRole("dialog");
  // Company is the default target, with company categories only.
  await expect(dialog.getByLabel("Applies to")).toContainText("Company");
  await dialog.getByLabel("Category").click();
  await expect(page.getByRole("option", { name: "Rent", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Food", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Rent", exact: true }).click();
  await dialog.getByLabel("Amount").fill("25000");
  await dialog.getByLabel("Supplier (optional)").fill("Landlord");
  await dialog.getByRole("button", { name: "Add Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.getByRole("button", { name: "Add Expense" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Applies to").click();
  await page.getByRole("option", { name: /Billing Customer/ }).click();
  await dialog.getByLabel("Category").click();
  await expect(page.getByRole("option", { name: "Food", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Rent", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Food", exact: true }).click();
  await dialog.getByLabel("Amount").fill("4000");
  await dialog.getByRole("button", { name: "Add Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await expect(page.getByTestId("exp-total-all")).toHaveText("₹29,000.00");
  await expect(page.getByTestId("exp-total-order")).toHaveText("₹4,000.00");
  await expect(page.getByTestId("exp-total-company")).toHaveText("₹25,000.00");
  await page.getByRole("button", { name: "Company expenses" }).click();
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await expect(page.getByTestId("expense-row")).toContainText("Landlord");
  await page.getByRole("button", { name: "Order expenses" }).click();
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await expect(page.getByTestId("expense-row")).toContainText("Billing Customer");

  // Rent is a company cost: the order's profit only sees the 4,000 of food
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Expenses" }).click();
  await expect(page.getByTestId("profit-cost")).toHaveText("₹4,000.00");
  await expect(page.getByTestId("profit-profit")).toHaveText("₹16,000.00");

  // ===== The Accounts team: invited, role set, then enters expenses without the order page =====
  await page.goto("/settings/team");
  await page.getByRole("tab", { name: "Invite Member" }).click();
  await page.getByLabel("Email Address").fill(accountsEmail);
  await page.getByRole("button", { name: "Send Invitation" }).click();
  await expect(page.getByText(accountsEmail)).toBeVisible();
  const invitationId = await getPendingInvitationId(accountsEmail);
  expect(invitationId).not.toBeNull();

  const accountsContext = await browser.newContext();
  const accounts = await accountsContext.newPage();
  await accounts.goto(`/invitations/${invitationId}/accept`);
  await accounts.getByLabel("First name").fill("Accounts");
  await accounts.getByLabel("Last name").fill("Person");
  await accounts.getByLabel("Phone", { exact: true }).fill("9800000079");
  await accounts.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await accounts.getByLabel("Confirm password").fill("correct-horse-battery");
  await accounts.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await accounts.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(accounts, accountsEmail);
  await expect(accounts).toHaveURL(/\/dashboard$/);
  await setMemberRole(accountsEmail, "accounts");

  await accounts.goto("/dashboard");
  await expect(accounts.getByRole("link", { name: "Expenses", exact: true })).toBeVisible();
  await expect(accounts.getByRole("link", { name: "Profitability" })).toBeVisible();
  await expect(accounts.getByRole("link", { name: "Orders", exact: true })).toHaveCount(0);
  await accounts.getByRole("link", { name: "Expenses", exact: true }).click();
  await expect(accounts.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await expect(accounts.getByTestId("expense-row")).toHaveCount(2);

  // Accounts adds a company expense (salaries) and an order expense, edits one; delete is owner-only
  await accounts.getByRole("button", { name: "Add Expense" }).click();
  const accountsDialog = accounts.getByRole("dialog");
  await accountsDialog.getByLabel("Category").click();
  await accounts.getByRole("option", { name: "Salaries", exact: true }).click();
  await accountsDialog.getByLabel("Amount").fill("12000");
  await accountsDialog.getByRole("button", { name: "Add Expense" }).click();
  await expect(accounts.getByRole("dialog")).not.toBeVisible();
  await expect(accounts.getByTestId("exp-total-company")).toHaveText("₹37,000.00");

  await accounts.getByRole("button", { name: "Edit Food expense" }).click();
  await accounts.getByRole("dialog").getByLabel("Amount").fill("5000");
  await accounts.getByRole("dialog").getByRole("button", { name: "Save Expense" }).click();
  await expect(accounts.getByRole("dialog")).not.toBeVisible();
  await expect(accounts.getByTestId("exp-total-order")).toHaveText("₹5,000.00");
  await expect(accounts.getByRole("button", { name: /^Delete .* expense$/ })).toHaveCount(0);

  // Profitability opens for Accounts, with no link into the order page they cannot open
  await accounts.goto("/profitability");
  await expect(accounts.getByTestId("total-cost")).toHaveText("₹5,000.00");
  await expect(accounts.getByRole("link", { name: /ORD-/ })).toHaveCount(0);
  await accountsContext.close();
});
