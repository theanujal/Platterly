import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { listRecipes } from "@/modules/recipes/recipe";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { costPerServing } from "@/modules/recipes/recipe-math";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { RecipesBrowser, type RecipeRow } from "./_components/recipes-browser";

export const metadata: Metadata = {
  title: "Recipes — Platterly",
  robots: { index: false, follow: false },
};

// Every Food Item with its recipe status (AJ, 2026-10-10). Stock needs and the kitchen's stock take are worked out from
// recipes, so a dish without one is the thing to find and fix; this page is where that is done in one place.
export default async function RecipesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  const [items, recipes, inventory, canEdit] = await Promise.all([
    listMenuItems(organizationId, { isActive: true }),
    listRecipes(organizationId),
    listInventoryItems(organizationId),
    hasPermission({ menus: ["edit"] }, organizationId),
  ]);

  const recipeByItem = new Map(recipes.map((r) => [r.menuItemId, r]));
  const rows: RecipeRow[] = items.map((item) => {
    const recipe = recipeByItem.get(item.id);
    const lines = recipe
      ? recipe.ingredients.map((i) => ({ inventoryId: i.inventoryId, name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity), costPerUnit: i.inventory.costPerUnit === null ? null : Number(i.inventory.costPerUnit) }))
      : [];
    return {
      id: item.id,
      name: item.name,
      category: item.categories[0]?.category.name ?? null,
      hasRecipe: Boolean(recipe),
      ingredientCount: lines.length,
      yieldServings: recipe ? Number(recipe.yieldServings) : null,
      costPerServing: recipe ? costPerServing(lines, Number(recipe.yieldServings)) : null,
      recipe: recipe
        ? { yieldServings: recipe.yieldServings.toString(), notes: recipe.notes ?? "", ingredients: recipe.ingredients.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity.toString() })) }
        : null,
    };
  });
  const ingredientOptions = inventory.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit) }));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Recipes" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <p className="text-sm text-muted-foreground">A recipe per dish tells the kitchen what each order needs from the store. Dishes without one are left out of the stock plan.</p>
      </div>
      <RecipesBrowser rows={rows} ingredientOptions={ingredientOptions} canEdit={canEdit} />
    </div>
  );
}
