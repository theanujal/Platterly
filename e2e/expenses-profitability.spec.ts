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
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
  await expect(page.getByTestId("total-revenue")).toHaveText("₹20,000.00");
  await expect(page.getByTestId("total-cost")).toHaveText("₹10,000.00");
  await expect(page.getByTestId("total-profit")).toHaveText("₹10,000.00");
  await expect(page.getByTestId("total-margin")).toHaveText("50%");
  await expect(page.getByRole("navigation", { name: "Finance" }).getByRole("link", { name: "Profitability" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
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
  await expect(accounts.getByRole("link", { name: "Finance", exact: true })).toBeVisible();
  await expect(accounts.getByRole("link", { name: "Orders", exact: true })).toHaveCount(0);
  await accounts.getByRole("link", { name: "Finance", exact: true }).click();
  await expect(accounts.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
  await expect(accounts.getByRole("navigation", { name: "Finance" }).getByRole("link", { name: "Profitability" })).toBeVisible();
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

test("receipts attach to an expense, show in the table, and can be removed", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-receipts-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Receipt", lastName: "Tester", phone: "9800000080" });
  const { orderId } = await seedOrderForBilling(email, 20000);

  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Expenses" }).click();
  const card = page.getByTestId("expenses-card");
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("1800");

  // A wrong type is refused before anything is saved
  await dialog.locator("#exp-files").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(dialog.getByRole("alert")).toContainText("only PNG, JPG, WebP or PDF");

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  await dialog.locator("#exp-files").setInputFiles([
    { name: "fresh-mart.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "till-slip.png", mimeType: "image/png", buffer: Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(24)]) },
  ]);
  await expect(dialog.getByTestId("expense-file-list")).toContainText("fresh-mart.pdf");
  await expect(dialog.getByTestId("expense-file-list")).toContainText("till-slip.png");

  // Drag and drop works like in the image uploads: dropping a file on the box adds it to the list
  const dropped = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["%PDF-1.4"], "dropped-bill.pdf", { type: "application/pdf" }));
    return data;
  });
  await dialog.locator('[data-slot="file-dropzone"]').dispatchEvent("dragover", { dataTransfer: dropped });
  await dialog.locator('[data-slot="file-dropzone"]').dispatchEvent("drop", { dataTransfer: dropped });
  await expect(dialog.getByTestId("expense-file-list")).toContainText("dropped-bill.pdf");
  // A dropped file of the wrong type is refused the same way as a picked one
  const wrong = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "notes.txt", { type: "text/plain" }));
    return data;
  });
  await dialog.locator('[data-slot="file-dropzone"]').dispatchEvent("drop", { dataTransfer: wrong });
  await expect(dialog.getByRole("alert")).toContainText("only PNG, JPG, WebP or PDF");
  await dialog.getByRole("button", { name: "Remove dropped-bill.pdf" }).click();
  await expect(dialog.getByTestId("expense-file-list")).not.toContainText("dropped-bill.pdf");

  await dialog.getByRole("button", { name: "Add Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await expect(card.getByTestId("expense-file")).toHaveCount(2);
  const link = card.getByRole("link", { name: "fresh-mart.pdf" });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/uploads\/organizations\/.+\/expenses\/.+\.pdf$/);
  const file = await page.request.get(href!);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Remove one from the edit popup
  await card.getByRole("button", { name: "Edit Food expense" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove till-slip.png" }).click();
  await expect(page.getByRole("dialog").getByTestId("expense-file-list")).not.toContainText("till-slip.png");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByTestId("expense-file")).toHaveCount(1);

  // The same receipt shows on the Expenses page
  await page.goto("/expenses");
  await expect(page.getByTestId("expense-file")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "fresh-mart.pdf" })).toBeVisible();
});

test("an expense can be set to repeat: it books its due dates, and can be changed, paused, resumed and stopped from the expense", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-recurring-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Recurring", lastName: "Tester", phone: "9800000081" });

  await page.goto("/expenses");
  // There is no separate recurring card any more: repeating is a switch in Add Expense
  await expect(page.getByTestId("recurring-panel")).toHaveCount(0);

  // Starts about 2.5 months ago, so three dates are already due (the start day and the two after it)
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 2);
  await page.getByRole("button", { name: "Add Expense" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("switch", { name: "This expense repeats" })).toBeVisible();
  await expect(dialog.getByLabel("First date")).toHaveCount(0);
  await dialog.getByRole("switch", { name: "This expense repeats" }).click();
  // Repeating: first date and repeat choice appear, receipts are not offered
  await expect(dialog.locator("#exp-frequency")).toBeVisible();
  await expect(dialog.locator("#exp-files")).toHaveCount(0);
  await dialog.getByLabel("Amount").fill("25000");
  await dialog.getByLabel("First date").fill(start.toISOString().slice(0, 10));
  await dialog.getByLabel("Supplier (optional)").fill("Landlord");
  await dialog.getByRole("button", { name: "Add Repeating Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // Three dates are due (two months ago, last month, this month), each booked once and labelled
  await expect(page.getByTestId("expense-row")).toHaveCount(3);
  await expect(page.getByTestId("recurring-badge")).toHaveCount(3);
  await expect(page.getByTestId("exp-total-company")).toHaveText("₹75,000.00");
  await page.reload();
  await expect(page.getByTestId("expense-row")).toHaveCount(3);

  // An order expense has no repeat switch
  await page.getByRole("button", { name: "Add Expense" }).click();
  await page.getByRole("dialog").getByLabel("Applies to").click();
  await expect(page.getByRole("option", { name: "Company (not tied to an order)" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Open one booked expense: its schedule shows; change it and its future bookings
  await page.getByRole("button", { name: "Edit Rent expense" }).first().click();
  let edit = page.getByRole("dialog");
  await expect(edit.getByTestId("repeat-box")).toContainText("Repeats monthly");
  await expect(edit.getByTestId("repeat-box")).toContainText("Active");
  await expect(edit.getByTestId("repeat-box")).toContainText("Next");
  await edit.getByLabel("Amount").fill("26000");
  await edit.getByRole("switch", { name: "Use these changes for future bookings too" }).click();
  await edit.getByRole("button", { name: "Save Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByTestId("exp-total-company")).toHaveText("₹76,000.00");

  // Pause, then resume, from the same box
  await page.getByRole("button", { name: "Edit Rent expense" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Pause repeating" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Repeating paused" })).toBeVisible();
  await page.reload(); // the refresh behind the message is asynchronous; start from the saved state
  await page.getByRole("button", { name: "Edit Rent expense" }).first().click();
  await expect(page.getByRole("dialog").getByTestId("repeat-box")).toContainText("Paused");
  await page.getByRole("dialog").getByRole("button", { name: "Resume repeating" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();

  // Stop for good: what was booked stays, without the label
  await page.getByRole("button", { name: "Edit Rent expense" }).first().click();
  edit = page.getByRole("dialog");
  await edit.getByRole("button", { name: "Stop repeating" }).click();
  await edit.getByRole("button", { name: /Stop for good/ }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByTestId("expense-row")).toHaveCount(3);
  await expect(page.getByTestId("recurring-badge")).toHaveCount(0);
});

test("Profitability filters orders by event date: presets and a custom range", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-range-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Range", lastName: "Tester", phone: "9800000082" });
  await seedOrderForBilling(email, 20000); // its event is 10 days from now

  await page.goto("/profitability");
  await expect(page.getByTestId("range-summary")).toHaveText("All orders: 1 order.");
  await expect(page.getByTestId("total-revenue")).toHaveText("₹20,000.00");
  await expect(page.locator("#range-preset")).toContainText("All time");

  // Everything is on one row: the period, From, To and Apply share a single line
  const tops = await Promise.all(["#range-preset", "#range-from", "#range-to"].map((sel) => page.locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().top))));
  expect(new Set(tops).size).toBe(1);

  // A preset in the past leaves the order out, and the totals follow
  await page.locator("#range-preset").click();
  await page.getByRole("option", { name: "Last month" }).click();
  await expect(page).toHaveURL(/range=last-month/);
  await expect(page.locator("#range-preset")).toContainText("Last month");
  await expect(page.getByTestId("range-summary")).toContainText("0 orders");
  await expect(page.getByTestId("total-revenue")).toHaveText("₹0.00");
  await expect(page.getByText("No orders with an event in this period.")).toBeVisible();

  // A custom range around the event brings it back
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  await page.locator("#range-from").fill(day(5));
  await page.locator("#range-to").fill(day(15));
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page).toHaveURL(/from=/);
  await expect(page.getByTestId("range-summary")).toContainText("1 order");
  await expect(page.getByTestId("total-revenue")).toHaveText("₹20,000.00");

  // A range that ends before the event leaves it out; a backwards range is swapped, not empty
  await page.locator("#range-from").fill(day(-30));
  await page.locator("#range-to").fill(day(5));
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByTestId("range-summary")).toContainText("0 orders");
  await page.locator("#range-from").fill(day(15));
  await page.locator("#range-to").fill(day(5));
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByTestId("range-summary")).toContainText("1 order");

  await expect(page.locator("#range-preset")).toContainText("Custom range");
  await page.locator("#range-preset").click();
  await page.getByRole("option", { name: "All time" }).click();
  await expect(page.getByTestId("range-summary")).toHaveText("All orders: 1 order.");
});
