import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission, hasPermission, canSee } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { listRecipes } from "@/modules/recipes/recipe";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { usableQueues } from "@/modules/inventory/batches";
import { costRecipe } from "@/modules/recipes/recipe-cost-math";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { RecipesBrowser, type RecipeRow } from "./_components/recipes-browser";

export const metadata: Metadata = {
  title: "Recipes — Caterly",
  robots: { index: false, follow: false },
};

// Every Food Item with its recipe status (AJ, 2026-10-10). Stock needs and the kitchen's stock take are worked out from
// recipes, so a dish without one is the thing to find and fix; this page is where that is done in one place.
export default async function RecipesPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ recipes: ["view"] }, organizationId);
  const [items, recipes, inventory, canEdit, showCost] = await Promise.all([
    listMenuItems(organizationId, { isActive: true }),
    listRecipes(organizationId),
    listInventoryItems(organizationId),
    hasPermission({ recipes: ["edit"] }, organizationId),
    canSee("recipeCosts", organizationId),
  ]);

  // Each recipe is costed from the batches it would actually use (FIFO, oldest first); the item's own cost is only an estimate.
  // Costs are worked out only for a person who may see them; otherwise no cost, batch or unit price is built or sent.
  const queues = showCost
    ? await usableQueues(
        organizationId,
        inventory.map((i) => i.id),
      )
    : new Map<string, never[]>();
  const itemCost = new Map(inventory.map((i) => [i.id, i.costPerUnit === null ? null : Number(i.costPerUnit)]));
  const recipeByItem = new Map(recipes.map((r) => [r.menuItemId, r]));
  const rows: RecipeRow[] = items.map((item) => {
    const recipe = recipeByItem.get(item.id);
    const cost = recipe && showCost
      ? costRecipe(
          recipe.ingredients.map((i) => ({
            inventoryId: i.inventoryId,
            name: i.inventory.name,
            unit: i.inventory.unit,
            quantity: Number(i.quantity),
            queue: queues.get(i.inventoryId) ?? [],
            itemCost: itemCost.get(i.inventoryId) ?? null,
          })),
          Number(recipe.yieldServings),
        )
      : null;
    return {
      id: item.id,
      name: item.name,
      image: item.image,
      category: item.categories[0]?.category.name ?? null,
      hasRecipe: Boolean(recipe),
      status: recipe?.status ?? null,
      ingredientCount: recipe ? recipe.ingredients.length : 0,
      yieldServings: recipe ? Number(recipe.yieldServings) : null,
      cost: cost
        ? { state: cost.state, verified: cost.verifiedCostPerServing, estimate: cost.estimatedCostPerServing, issues: cost.issues.map((i) => ({ name: i.name, reason: i.reason })) }
        : null,
      recipe: recipe
        ? {
            yieldServings: recipe.yieldServings.toString(),
            notes: recipe.notes ?? "",
            ingredients: recipe.ingredients.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity.toString() })),
            status: recipe.status,
          }
        : null,
    };
  });
  const ingredientOptions = inventory.map((i) => ({ id: i.id, name: i.name, unit: i.unit, itemCost: showCost ? itemCost.get(i.id) ?? null : null, queue: queues.get(i.id) ?? [] }));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Recipes" }]} />
      <RecipesBrowser rows={rows} ingredientOptions={ingredientOptions} canEdit={canEdit} showCost={showCost} />
    </div>
  );
}
