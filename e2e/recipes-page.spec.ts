import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * The Recipes page (AJ, 2026-10-10): its own sidebar entry just below Stock & Supplies, listing every dish as Missing or
 * Complete; a recipe is added there, and a second dish can start from the first one's recipe.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("Recipes is its own sidebar entry under Stock & Supplies; add a recipe and copy it to another dish", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-recipes-page-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Recipe", lastName: "Page", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

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

  const dishes = [`Paneer Masala ${suffix}`, `Paneer Tikka ${suffix}`];
  for (const dish of dishes) {
    await page.goto("/menu-catalog/items");
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByLabel("Item Name").fill(dish);
    await page.getByLabel("Item Price Per Plate").fill("250");
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByText(dish)).toBeVisible();
  }

  // Its own entry in the sidebar, right below Stock & Supplies, and not a tab inside it.
  await page.goto("/inventory");
  const sidebar = page.locator("[data-sidebar='sidebar']").first();
  const links = await sidebar.getByRole("link").allInnerTexts();
  const names = links.map((t) => t.trim());
  expect(names.indexOf("Recipes")).toBe(names.indexOf("Stock & Supplies") + 1);
  await expect(page.getByRole("navigation", { name: "Stock & Supplies" }).getByRole("link", { name: "Recipes" })).toHaveCount(0);

  await sidebar.getByRole("link", { name: "Recipes", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole("heading", { name: "Recipes", exact: true })).toBeVisible();
  await expect(page.getByTestId("recipe-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Missing recipe" })).toContainText("2");

  // Add a recipe to the first dish: 2 kg makes 10 servings.
  await page.getByRole("button", { name: `Add recipe for ${dishes[0]}` }).click();
  await page.getByLabel("Ingredient 1").click();
  await page.getByRole("option", { name: ingredient }).click();
  await page.getByLabel("Quantity 1").fill("2");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const first = page.getByTestId("recipe-row").filter({ hasText: dishes[0] });
  await expect(first.getByText("Complete", { exact: true })).toBeVisible();
  await expect(first).toContainText("₹60.00"); // 2 kg x 300 / 10 servings

  // The second dish starts from the first one's recipe.
  await page.getByRole("button", { name: `Copy a recipe to ${dishes[1]}` }).click();
  await page.getByLabel("Copy from").click();
  await page.getByRole("option", { name: dishes[0] }).click();
  await page.getByRole("button", { name: "Copy recipe" }).click();
  const second = page.getByTestId("recipe-row").filter({ hasText: dishes[1] });
  await expect(second.getByText("Complete", { exact: true })).toBeVisible();

  // Filters: nothing is missing any more.
  await page.getByRole("button", { name: "Missing recipe" }).click();
  await expect(page.getByText("No dishes match.")).toBeVisible();
  await page.getByRole("button", { name: "Has recipe" }).click();
  await expect(page.getByTestId("recipe-row")).toHaveCount(2);
});
