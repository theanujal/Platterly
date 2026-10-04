import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedKitchenOrderWithDish } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 18.3 + 18.4 — buy stock (draft, ordered, received), pay the supplier and see the balance, then an order that is
 * with the kitchen: its needs come from the dish's recipe, and the stock is taken once after a confirmation.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("purchase, receive, pay the supplier, then take an order's stock from its recipe", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-purchasing-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const supplier = `Dairy Co ${suffix}`;
  const ingredient = `Paneer ${suffix}`;
  const dish = `Paneer Masala ${suffix}`;

  await signUpCaterer(page, email, { firstName: "Buyer", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // --- Setup: a supplier, an ingredient, a dish with a recipe (2 kg per 10 servings) ---
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  await page.getByLabel("Supplier Name").fill(supplier);
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByText(supplier)).toBeVisible();

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(ingredient);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  await page.getByLabel("Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByLabel("Cost Per Unit").fill("300");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(ingredient)).toBeVisible();

  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(dish);
  await page.getByLabel("Item Price Per Plate").fill("250");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(dish)).toBeVisible();
  await page.getByRole("button", { name: `Recipe for ${dish}` }).click();
  await page.getByLabel("Ingredient 1").click();
  await page.getByRole("option", { name: ingredient }).click();
  await page.getByLabel("Quantity 1").fill("2");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- 18.3: a purchase request for 40 kg, ordered, then received ---
  await page.getByRole("link", { name: "Stock & Supplies", exact: true }).click();
  await page.getByRole("navigation", { name: "Stock & Supplies" }).getByRole("link", { name: "Purchasing" }).click();
  await expect(page).toHaveURL(/\/purchasing$/);
  await page.getByRole("button", { name: "New order" }).click();
  await page.getByLabel("Supplier", { exact: true }).click();
  await page.getByRole("option", { name: supplier }).click();
  await page.getByLabel("Item 1").click();
  await page.getByRole("option", { name: ingredient }).click();
  await page.getByLabel("Quantity 1").fill("40");
  await expect(page.getByLabel("Unit cost 1")).toHaveValue("300"); // starts from the item's own cost
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-0001" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByText("Order total: ₹12,000")).toBeVisible();

  await page.getByRole("button", { name: "Mark as ordered" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark as ordered" }).click();
  await expect(page.getByText("Ordered", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Receive stock" }).click();
  await page.getByRole("button", { name: "Everything has arrived" }).click();
  await page.getByRole("button", { name: "Add to stock" }).click();
  await expect(page.getByRole("button", { name: "Receive stock" })).toHaveCount(0); // fully received, nothing left to receive
  await expect(page.getByText("Received so far: ₹12,000")).toBeVisible();

  await page.goto("/inventory");
  await expect(page.getByText("40 kg")).toBeVisible();

  // --- Supplier balance and a payment ---
  await page.goto("/suppliers");
  await page.getByRole("link", { name: supplier }).click();
  await expect(page.getByTestId("supplier-outstanding")).toHaveText("₹12,000.00");
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Amount (₹)").fill("5000");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByTestId("supplier-outstanding")).toHaveText("₹7,000.00");

  // --- 18.4: an order with the kitchen needs 22 kg (100 guests + 10% extra = 110 servings x 2 kg / 10) ---
  const { orderId } = await seedKitchenOrderWithDish(email, dish);
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("tab", { name: "Inventory" }).click();
  const card = page.getByTestId("stock-plan-card");
  await expect(card).toContainText("100 guests plus 10% extra");
  await expect(card.getByRole("row", { name: new RegExp(ingredient) })).toContainText("22 kg");
  await expect(card.getByRole("row", { name: new RegExp(ingredient) })).toContainText("40 kg");

  await card.getByRole("button", { name: "Review and take stock" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm and take stock" }).click();
  await expect(card.getByText("Stock taken", { exact: true }).first()).toBeVisible();
  await expect(card.getByRole("button", { name: "Review and take stock" })).toHaveCount(0); // once only

  await page.goto("/inventory");
  await expect(page.getByText("18 kg")).toBeVisible();

  // --- Production planning lists the order, with its stock already taken ---
  await page.goto("/kitchen-dashboard/production");
  await expect(page.getByRole("heading", { name: "Production Planning" })).toBeVisible();
  await expect(page.getByText("Stock taken", { exact: true })).toBeVisible();
  await expect(page.getByTestId("no-shortfall")).toBeVisible();
});
