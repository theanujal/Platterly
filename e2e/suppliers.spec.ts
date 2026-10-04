import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** Chunk 18.2 — add a supplier, pick it on an inventory item and an expense, see it on the profile, and see delete refused while in use. */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("supplier: create, pick on inventory and expense, profile, delete guard", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-suppliers-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const supplier = `Grain Traders ${suffix}`;

  await signUpCaterer(page, email, { firstName: "Supplier", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // Create from the sidebar link
  await page.getByRole("link", { name: "Suppliers" }).click();
  await expect(page).toHaveURL(/\/suppliers$/);
  await page.getByRole("button", { name: "Add Supplier" }).click();
  await page.getByLabel("Supplier Name").fill(supplier);
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(supplier)).toBeVisible();

  // A duplicate name (any case) is refused
  await page.getByRole("button", { name: "Add Supplier" }).click();
  await page.getByLabel("Supplier Name").fill(supplier.toLowerCase());
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByText(/already exists/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Pick it on an inventory item
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(`Rice ${suffix}`);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  await page.getByLabel("Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByLabel("Supplier", { exact: true }).click();
  await page.getByRole("option", { name: supplier }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(`Rice ${suffix}`)).toBeVisible();

  // Pick it on a company expense
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("1500");
  await dialog.getByLabel("Supplier list").click();
  await page.getByRole("option", { name: supplier }).click();
  await dialog.getByRole("button", { name: "Add Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("cell", { name: supplier })).toBeVisible();

  // Profile shows the item and the spend
  await page.goto("/suppliers");
  await page.getByRole("link", { name: supplier }).click();
  await expect(page.getByRole("heading", { name: supplier })).toBeVisible();
  await expect(page.getByText("Total spent: ₹1,500")).toBeVisible();
  await expect(page.getByRole("cell", { name: `Rice ${suffix}` })).toBeVisible();

  // Delete is refused while it is in use
  await page.goto("/suppliers");
  await page.getByRole("button", { name: `Delete ${supplier}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/Deactivate it instead/)).toBeVisible();
});
