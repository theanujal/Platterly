import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { RULES, validateInput, checkMoney } from "@/lib/validation";

export interface RecipeInput {
  /** Servings the quantities below make. */
  yieldServings: number;
  notes?: string;
  ingredients: { inventoryId: string; quantity: number }[];
}

const MAX_INGREDIENTS = 100;

export class RecipeStatusError extends Error {}

const recipeInclude = {
  ingredients: { include: { inventory: { select: { id: true, name: true, unit: true } } }, orderBy: { inventory: { name: "asc" as const } } },
};

export async function getRecipeForItem(organizationId: string, menuItemId: string) {
  return prisma.recipe.findFirst({ where: { menuItemId, organizationId }, include: recipeInclude });
}

export async function listRecipes(organizationId: string) {
  return prisma.recipe.findMany({ where: { organizationId }, include: recipeInclude });
}

/** Menu Item ids in this kitchen that have a recipe — for the "Recipe" badge on the Food Items list. */
export async function listItemIdsWithRecipe(organizationId: string): Promise<Set<string>> {
  const rows = await prisma.recipe.findMany({ where: { organizationId }, select: { menuItemId: true } });
  return new Set(rows.map((r) => r.menuItemId));
}

const sameIngredients = (stored: { inventoryId: string; quantity: unknown }[], input: { inventoryId: string; quantity: number }[]) =>
  stored.length === input.length && input.every((i) => stored.some((s) => s.inventoryId === i.inventoryId && Number(s.quantity) === i.quantity));

/** Creates or fully replaces the item's recipe. Every ingredient must be an Inventory item of this kitchen. */
export async function saveRecipe(organizationId: string, menuItemId: string, input: RecipeInput, actorUserId: string) {
  validateInput(input, RULES.recipe);
  checkMoney(input.yieldServings, "servings", { max: 1_000_000 });
  if (!(input.yieldServings > 0)) throw new Error("Servings must be greater than zero.");
  if (input.ingredients.length === 0) throw new Error("Add at least one ingredient.");
  if (input.ingredients.length > MAX_INGREDIENTS) throw new Error(`A recipe can have at most ${MAX_INGREDIENTS} ingredients.`);

  const ids = input.ingredients.map((i) => i.inventoryId);
  if (new Set(ids).size !== ids.length) throw new Error("Each ingredient can be listed only once.");
  for (const line of input.ingredients) {
    if (!(line.quantity > 0)) throw new Error("Every ingredient needs a quantity greater than zero.");
    checkMoney(line.quantity, "ingredient quantity", { max: 1_000_000_000 });
  }

  await prisma.menuItem.findFirstOrThrow({ where: { id: menuItemId, organizationId }, select: { id: true } });
  const found = await prisma.inventory.count({ where: { id: { in: ids }, organizationId } });
  if (found !== ids.length) throw new Error("One of the ingredients is not in your inventory.");

  const before = await getRecipeForItem(organizationId, menuItemId);
  // Approval is for the recipe as it was approved: a change to the servings or the ingredients sends an Active recipe back to Draft
  // for re-approval. A new recipe is always a Draft, and a change to the notes alone keeps the status.
  const changed = !before || Number(before.yieldServings) !== input.yieldServings || !sameIngredients(before.ingredients, input.ingredients);
  const recipe = await prisma.$transaction(async (tx) => {
    const saved = await tx.recipe.upsert({
      where: { menuItemId },
      create: { organizationId, menuItemId, yieldServings: input.yieldServings, notes: input.notes, status: "DRAFT" },
      update: { yieldServings: input.yieldServings, notes: input.notes ?? null, ...(changed ? { status: "DRAFT" as const, activatedAt: null, activatedByUserId: null } : {}) },
    });
    await tx.recipeIngredient.deleteMany({ where: { recipeId: saved.id } });
    await tx.recipeIngredient.createMany({
      data: input.ingredients.map((i) => ({ recipeId: saved.id, inventoryId: i.inventoryId, quantity: i.quantity })),
    });
    return tx.recipe.findUniqueOrThrow({ where: { id: saved.id }, include: recipeInclude });
  });

  await audit({
    organizationId,
    actorUserId,
    action: before ? "recipe.update" : "recipe.create",
    recordType: "Recipe",
    recordId: recipe.id,
    before: before ? JSON.parse(JSON.stringify(before)) : undefined,
    after: JSON.parse(JSON.stringify(recipe)),
  });
  return recipe;
}

export async function deleteRecipe(organizationId: string, menuItemId: string, actorUserId: string) {
  const before = await prisma.recipe.findFirstOrThrow({ where: { menuItemId, organizationId }, include: recipeInclude });
  await prisma.recipe.delete({ where: { id: before.id } });
  await audit({
    organizationId,
    actorUserId,
    action: "recipe.delete",
    recordType: "Recipe",
    recordId: before.id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

/** Copies a recipe onto another dish of the same kitchen (replacing any recipe it has). */
export async function copyRecipe(organizationId: string, fromMenuItemId: string, toMenuItemId: string, actorUserId: string) {
  const source = await getRecipeForItem(organizationId, fromMenuItemId);
  if (!source) throw new Error("That dish has no recipe to copy.");
  return saveRecipe(
    organizationId,
    toMenuItemId,
    {
      yieldServings: Number(source.yieldServings),
      notes: source.notes ?? undefined,
      ingredients: source.ingredients.map((i) => ({ inventoryId: i.inventoryId, quantity: Number(i.quantity) })),
    },
    actorUserId,
  );
}

/**
 * Approves a Draft recipe for production (ACTIVE) or returns an Active one to Draft. This is the recipe's lifecycle only: it never
 * touches stock, batches, allocations or costs, and it says nothing about cost verification (that is worked out from the batches
 * each time). Activating re-checks the recipe: it needs servings above zero and at least one ingredient, every one with a quantity
 * above zero and an item of this kitchen. Repeating the same change is harmless.
 */
export async function setRecipeStatus(organizationId: string, menuItemId: string, status: "ACTIVE" | "DRAFT", actorUserId: string) {
  const before = await getRecipeForItem(organizationId, menuItemId);
  if (!before) throw new RecipeStatusError("This dish has no recipe yet. Save the recipe first.");
  if (before.status === status) return before;

  if (status === "ACTIVE") {
    if (!(Number(before.yieldServings) > 0)) throw new RecipeStatusError("The servings must be greater than zero before this recipe can be activated.");
    if (before.ingredients.length === 0) throw new RecipeStatusError("Add at least one ingredient before this recipe can be activated.");
    if (before.ingredients.some((i) => !(Number(i.quantity) > 0))) throw new RecipeStatusError("Every ingredient needs a quantity greater than zero before this recipe can be activated.");
    const mapped = await prisma.inventory.count({ where: { id: { in: before.ingredients.map((i) => i.inventoryId) }, organizationId } });
    if (mapped !== before.ingredients.length) throw new RecipeStatusError("One of the ingredients is not in your inventory, so this recipe cannot be activated.");
  }

  // The write only succeeds while the recipe is still in the status it was read in, so two people acting at once cannot both win.
  const claimed = await prisma.recipe.updateMany({
    where: { id: before.id, organizationId, status: before.status },
    data: status === "ACTIVE" ? { status, activatedAt: new Date(), activatedByUserId: actorUserId } : { status, activatedAt: null, activatedByUserId: null },
  });
  if (claimed.count === 0) throw new RecipeStatusError("This recipe was just changed by someone else. Refresh and try again.");

  const after = await getRecipeForItem(organizationId, menuItemId);
  await audit({
    organizationId,
    actorUserId,
    action: status === "ACTIVE" ? "recipe.activate" : "recipe.return_to_draft",
    recordType: "Recipe",
    recordId: before.id,
    before: { status: before.status },
    after: { status },
  });
  return after!;
}
