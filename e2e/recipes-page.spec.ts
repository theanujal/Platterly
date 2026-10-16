import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { stockIn } from "./inventory-helpers";
import { selectOption, signUpCaterer } from "./auth-helpers";

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
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(ingredient)).toBeVisible();
  // Recipe cost is verified from batch costs: 100 kg arrive at a confirmed ₹300 a kg
  await stockIn(page, ingredient, "100", "300");

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
  await expect(page.getByRole("row").filter({ hasText: "Missing" })).toHaveCount(2);
  const statusFilter = page.getByRole("combobox", { name: "Filter by recipe status" });
  await expect(statusFilter).toContainText("All Dishes (2)");

  // A dish without a recipe shows a dash, not a cost.
  const noRecipe = page.getByRole("row").filter({ hasText: dishes[0] });
  await expect(noRecipe).not.toContainText("₹");
  await expect(noRecipe).not.toContainText("Incomplete");

  // Add a recipe to the first dish: 2 kg makes 10 servings.
  await page.getByRole("button", { name: `Add recipe for ${dishes[0]}` }).click();
  await page.getByLabel("Ingredient 1").click();
  // The ingredient list is searchable: a search with no match offers to add it as a new ingredient, then the right text finds it.
  await page.getByPlaceholder("Search ingredients…").fill("zzz-no-such-item");
  await expect(page.getByRole("option", { name: /as a new ingredient/ })).toBeVisible();
  await page.getByPlaceholder("Search ingredients…").fill(ingredient.slice(0, 8).toLowerCase());
  await page.getByRole("option", { name: ingredient }).click();
  await page.getByLabel("Quantity 1").fill("2");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const first = page.getByRole("row").filter({ hasText: dishes[0] });
  await expect(first.getByText("Draft", { exact: true })).toBeVisible(); // a new recipe starts as a Draft, whatever its cost
  await expect(first).toContainText("₹60.00"); // 2 kg x 300 / 10 servings

  // The second dish starts from the first one's recipe, adjusted before saving: 3 kg instead of 2.
  await page.getByRole("button", { name: "Add Recipe", exact: true }).click(); // the header button asks which dish
  await page.getByLabel("Dish", { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(dishes[1]) }).click();
  await page.getByLabel("Copy from another dish").click();
  await page.getByPlaceholder("Search dishes with a recipe…").fill(dishes[0].slice(0, 6).toLowerCase());
  await page.getByRole("option", { name: dishes[0] }).click();
  await expect(page.getByLabel("Quantity 1")).toHaveValue("2");
  await expect(page.getByText(`Copied from ${dishes[0]}`)).toBeVisible();
  await page.getByLabel("Quantity 1").fill("3");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const second = page.getByRole("row").filter({ hasText: dishes[1] });
  await expect(second.getByText("Draft", { exact: true })).toBeVisible();
  await expect(second).toContainText("₹90.00"); // 3 kg x 300 / 10 servings
  await expect(first).toContainText("₹60.00"); // the first dish is unchanged

  // Editing the quantity re-runs the same calculation: 4 kg x 300 / 10 servings.
  await page.getByRole("button", { name: `Edit recipe for ${dishes[0]}` }).click();
  await page.getByLabel("Quantity 1").fill("4");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(first).toContainText("₹120.00");

  // A later delivery at another price does not change what the next kilos cost: the first batch is used first (FIFO).
  await page.goto("/inventory");
  await stockIn(page, ingredient, "100", "400");
  await page.goto("/recipes");
  await expect(first).toContainText("₹120.00");
  await expect(second).toContainText("₹90.00");

  // Filters: nothing is missing any more.
  await expect(statusFilter).toContainText("All Dishes (2)");
  await selectOption(page, statusFilter, /Missing Recipe \(0\)/);
  await expect(page.getByRole("row").filter({ hasText: "Draft" })).toHaveCount(0);
  await selectOption(page, statusFilter, /Has Recipe/);
  await expect(page.getByRole("row").filter({ hasText: "Draft" })).toHaveCount(2);
  await selectOption(page, statusFilter, /Missing Recipe/);
  await expect(page.getByRole("row").filter({ hasText: "Draft" })).toHaveCount(0);

  // Draft -> Active is the footer switch, applied on Save; the cost was already verified and the recipe stayed a Draft.
  await selectOption(page, statusFilter, /All Dishes/);
  await page.getByRole("button", { name: `Edit recipe for ${dishes[0]}` }).click();
  const statusSwitch = page.getByRole("switch", { name: "Draft" });
  await expect(statusSwitch).toBeVisible();
  await statusSwitch.click();
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(first.getByText("Active", { exact: true })).toBeVisible();
  await expect(first).toContainText("₹120.00"); // the cost is unchanged by approving it
  // The dropdown's own counts follow: one Active, one Draft.
  await statusFilter.click();
  await expect(page.getByRole("option", { name: "Active (1)" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Draft (1)" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Changing the ingredients and saving with the switch left on keeps it Active; switching it off returns it to Draft.
  await page.getByRole("button", { name: `Edit recipe for ${dishes[0]}` }).click();
  await expect(page.getByRole("switch", { name: "Active" })).toBeVisible();
  await page.getByLabel("Quantity 1").fill("5");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(first.getByText("Active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Edit recipe for ${dishes[0]}` }).click();
  await page.getByRole("switch", { name: "Active" }).click();
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(first.getByText("Draft", { exact: true })).toBeVisible();
});

test("a recipe whose ingredient has no stock, or stock with no known cost, is Incomplete: no verified cost, and the ingredient is named", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-recipes-nocost-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);

  await signUpCaterer(page, email, { firstName: "Recipe", lastName: "NoCost", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  const ingredient = `Salt ${suffix}`;
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(ingredient);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(ingredient)).toBeVisible();

  const dish = `Plain Rice ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(dish);
  await page.getByLabel("Item Price Per Plate").fill("100");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(dish)).toBeVisible();

  await page.goto("/recipes");
  await page.getByRole("button", { name: `Add recipe for ${dish}` }).click();
  await page.getByLabel("Ingredient 1").click();
  await page.getByPlaceholder("Search ingredients…").fill(ingredient.slice(0, 6).toLowerCase());
  await page.getByRole("option", { name: ingredient }).click();
  await page.getByLabel("Quantity 1").fill("1");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: dish });
  // No stock at all: not verifiable
  await expect(row.getByText("Incomplete", { exact: true }).first()).toBeVisible();
  await expect(row.getByTestId("cost-issues")).toContainText(ingredient);
  await expect(row).not.toContainText("₹");
  await expect(row.getByTestId("cost-estimate")).toHaveText("Estimate unavailable"); // no item cost to estimate from

  // Stock with an unknown cost is still not verifiable (and the item's own cost is not used)
  await page.goto("/inventory");
  await stockIn(page, ingredient, "10");
  await page.goto("/recipes");
  await expect(row.getByTestId("cost-issues")).toContainText(ingredient);
  await expect(row).not.toContainText("₹");
  await page.getByRole("button", { name: `Edit recipe for ${dish}` }).click();
  await expect(page.getByTestId("recipe-cost")).toContainText("incomplete");
  await expect(page.getByTestId("recipe-cost")).toContainText("no known cost");
  await expect(page.getByTestId("recipe-cost")).not.toContainText("verified");
  await expect(page.getByTestId("recipe-cost-estimate")).toContainText("Estimate unavailable");
  await expect(page.getByTestId("recipe-cost")).toContainText("nothing is reserved or deducted");
});
