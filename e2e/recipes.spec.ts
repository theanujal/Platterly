import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** Chunk 18.1 — a Food Item's recipe: pick inventory ingredients, see the scaled preview, save, reopen, and the ingredient is then protected from deletion. */

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
  await page.getByLabel("Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByLabel("Cost Per Unit").fill("300");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(ingredient)).toBeVisible();

  // A Food Item.
  const dish = `Paneer Masala ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(dish);
  await page.getByLabel("Item Price Per Plate").fill("250");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(dish)).toBeVisible();
  await expect(page.getByText("Recipe", { exact: true })).toHaveCount(0);

  // Recipe: 2 kg makes 10 servings; the preview for 100 servings shows 20 kg and a cost of 60 a serving.
  await page.getByRole("button", { name: `Recipe for ${dish}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Ingredient 1").click();
  await page.getByPlaceholder("Search ingredients…").fill(ingredient.slice(0, 8).toLowerCase());
  await page.getByRole("option", { name: ingredient }).click();
  await page.getByLabel("Quantity 1").fill("2");
  await expect(page.getByText("20 kg")).toBeVisible();
  await expect(page.getByText("₹60.00")).toBeVisible();
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Recipe", { exact: true })).toBeVisible();

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
