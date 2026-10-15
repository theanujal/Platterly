import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { stockIn } from "./inventory-helpers";
import { signUpCaterer } from "./auth-helpers";

/** Chunk 18.1 — a Food Item's recipe: pick inventory ingredients, see the cost per serving, save, reopen, and the ingredient is then protected from deletion. */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("build a recipe for a food item, scale it, and see the ingredient protected", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-recipes-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Recipe", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // An ingredient in Inventory, with a cost.
  const ingredient = `Paneer ${suffix}`;
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(ingredient);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(ingredient)).toBeVisible();
  // Recipe cost is verified from batch costs: 100 kg arrive at a confirmed ₹300 a kg
  await stockIn(page, ingredient, "100", "300");

  // A Food Item.
  const dish = `Paneer Masala ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(dish);
  await page.getByLabel("Item Price Per Plate").fill("250");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(dish)).toBeVisible();
  await expect(page.getByText("Recipe", { exact: true })).toHaveCount(0);

  // Recipe: 2 kg makes 10 servings; the cost shows 60 a serving.
  await page.getByRole("button", { name: `Recipe for ${dish}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Ingredient 1").click();
  await page.getByPlaceholder("Search ingredients…").fill(ingredient.slice(0, 8).toLowerCase());
  await page.getByRole("option", { name: ingredient }).click();
  await page.getByLabel("Quantity 1").fill("2");
  await expect(page.getByTestId("recipe-cost")).toContainText("₹60.00");
  await expect(page.getByTestId("recipe-cost")).toContainText("verified");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Draft recipe", { exact: true })).toBeVisible(); // a new recipe is a Draft until activated

  // Reopens with what was saved.
  await page.getByRole("button", { name: `Recipe for ${dish}` }).click();
  await expect(page.getByLabel("Quantity 1")).toHaveValue("2");
  await page.keyboard.press("Escape");

  // The ingredient cannot be deleted while a recipe uses it.
  await page.goto("/inventory");
  await page.getByRole("button", { name: `Delete ${ingredient}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/ingredient in 1 recipe/)).toBeVisible();
});

test("add an ingredient that is not in Inventory and enter 700 g of a kg item", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-recipes-newing-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Recipe", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  const dish = `Dal Fry ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(dish);
  await page.getByLabel("Item Price Per Plate").fill("150");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(dish)).toBeVisible();

  await page.getByRole("button", { name: `Recipe for ${dish}` }).click();
  const ingredient = `Zzq Masoor ${suffix}`;
  await page.getByLabel("Ingredient 1").click();
  await page.getByPlaceholder("Search ingredients…").fill(ingredient);
  await page.getByRole("option", { name: /as a new ingredient/ }).click();
  await page.getByLabel("Stock unit").click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Add ingredient to inventory" }).click();

  // Stocked in kg, entered in g.
  await expect(page.getByLabel("Ingredient 1")).toContainText(ingredient);
  await page.getByLabel("Quantity 1").fill("700");
  await page.getByLabel("Unit 1").click();
  await page.getByRole("option", { name: "g", exact: true }).click({ timeout: 5000 });
  await page.getByLabel("These quantities make (servings)").fill("10");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // Reopens as 700 g, and the ingredient is now in Inventory in kg.
  await page.getByRole("button", { name: `Recipe for ${dish}` }).click();
  await expect(page.getByLabel("Quantity 1")).toHaveValue("700");
  await page.goto("/inventory");
  await expect(page.getByText(ingredient)).toBeVisible();
});
