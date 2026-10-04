import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { saveRecipe, getRecipeForItem, deleteRecipe, copyRecipe, listItemIdsWithRecipe } from "@/modules/recipes/recipe";
import { createInventoryItem, deleteInventoryItem, InventoryInUseError } from "@/modules/inventory/inventory";
import { createMenuItem, duplicateMenuItem } from "@/modules/menus/item";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.recipe.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Recipe Org", slug: `rec-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const dish = await createMenuItem(org.id, { name: "Paneer Butter Masala", foodType: "VEGETARIAN", price: 250 }, actor.id);
  const paneer = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg", costPerUnit: 300 }, actor.id);
  const butter = await createInventoryItem(org.id, { name: "Butter", category: "Dairy", unit: "kg" }, actor.id);
  return { org, actor, dish, paneer, butter };
}

describe("Recipes (Chunk 18.1)", () => {
  it("saves a recipe, replaces it on a second save, and audit-logs both", async () => {
    const { org, actor, dish, paneer, butter } = await setup();
    await saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }, { inventoryId: butter.id, quantity: 0.5 }] }, actor.id);
    const again = await saveRecipe(org.id, dish.id, { yieldServings: 20, notes: "x", ingredients: [{ inventoryId: paneer.id, quantity: 3 }] }, actor.id);
    expect(again.ingredients).toHaveLength(1);
    expect(Number(again.yieldServings)).toBe(20);
    expect(await prisma.recipe.count({ where: { organizationId: org.id } })).toBe(1);
    const actions = (await prisma.auditLog.findMany({ where: { organizationId: org.id, recordType: "Recipe" } })).map((a) => a.action).sort();
    expect(actions).toEqual(["recipe.create", "recipe.update"]);
  });

  it("rejects empty, duplicate, zero-quantity and zero-yield recipes", async () => {
    const { org, actor, dish, paneer } = await setup();
    await expect(saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [] }, actor.id)).rejects.toThrow();
    await expect(saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 1 }, { inventoryId: paneer.id, quantity: 2 }] }, actor.id)).rejects.toThrow();
    await expect(saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 0 }] }, actor.id)).rejects.toThrow();
    await expect(saveRecipe(org.id, dish.id, { yieldServings: 0, ingredients: [{ inventoryId: paneer.id, quantity: 1 }] }, actor.id)).rejects.toThrow();
  });

  it("refuses another kitchen's dish or ingredient", async () => {
    const a = await setup();
    const b = await setup();
    await expect(saveRecipe(a.org.id, b.dish.id, { yieldServings: 1, ingredients: [{ inventoryId: a.paneer.id, quantity: 1 }] }, a.actor.id)).rejects.toThrow();
    await expect(saveRecipe(a.org.id, a.dish.id, { yieldServings: 1, ingredients: [{ inventoryId: b.paneer.id, quantity: 1 }] }, a.actor.id)).rejects.toThrow();
    expect(await getRecipeForItem(a.org.id, b.dish.id)).toBeNull();
  });

  it("blocks deleting an inventory item used in a recipe, then allows it once the recipe is gone", async () => {
    const { org, actor, dish, paneer } = await setup();
    await saveRecipe(org.id, dish.id, { yieldServings: 1, ingredients: [{ inventoryId: paneer.id, quantity: 1 }] }, actor.id);
    await expect(deleteInventoryItem(org.id, paneer.id, actor.id)).rejects.toBeInstanceOf(InventoryInUseError);
    await deleteRecipe(org.id, dish.id, actor.id);
    await deleteInventoryItem(org.id, paneer.id, actor.id);
  });

  it("duplicating a dish copies its recipe; the list reports which dishes have one", async () => {
    const { org, actor, dish, paneer } = await setup();
    await saveRecipe(org.id, dish.id, { yieldServings: 5, ingredients: [{ inventoryId: paneer.id, quantity: 1 }] }, actor.id);
    const copy = await duplicateMenuItem(org.id, dish.id, actor.id);
    const r = await getRecipeForItem(org.id, copy.id);
    expect(Number(r?.yieldServings)).toBe(5);
    expect([...(await listItemIdsWithRecipe(org.id))].sort()).toEqual([dish.id, copy.id].sort());
  });

  it("copyRecipe errors when the source has no recipe; deleting the dish removes its recipe", async () => {
    const { org, actor, dish, paneer } = await setup();
    const other = await createMenuItem(org.id, { name: "Dal", foodType: "VEGETARIAN", price: 100 }, actor.id);
    await expect(copyRecipe(org.id, other.id, dish.id, actor.id)).rejects.toThrow();
    await saveRecipe(org.id, dish.id, { yieldServings: 1, ingredients: [{ inventoryId: paneer.id, quantity: 1 }] }, actor.id);
    await prisma.menuItem.delete({ where: { id: dish.id } });
    expect(await prisma.recipeIngredient.count({ where: { inventoryId: paneer.id } })).toBe(0);
  });
});
