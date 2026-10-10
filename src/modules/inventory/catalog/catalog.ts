import "server-only";
import { prisma } from "@/lib/db";
import { bulkAddInventory, type BulkInventoryResult } from "@/modules/inventory/import/bulk-add";
import { ingredientImage, normalizeUnit } from "@/modules/inventory/options";

/** Platterly's ingredient catalog, read-only for kitchens. `kitchenId` is the location slot the new items would go into. */
export async function listIngredientCatalog(organizationId: string, kitchenId: string | null) {
  const [items, mine] = await Promise.all([
    prisma.systemIngredient.findMany({ where: { isActive: true }, orderBy: [{ categoryName: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.inventory.findMany({ where: { organizationId, kitchenId }, select: { name: true } }),
  ]);
  const names = new Set(mine.map((i) => i.name.toLowerCase()));
  return items.map((i) => ({ id: i.id, name: i.name, categoryName: i.categoryName, unit: i.unit, image: ingredientImage(i.categoryName), alreadyAdded: names.has(i.name.toLowerCase()) }));
}

/**
 * Adds the picked ingredients as the kitchen's own Inventory Items, each with the unit the kitchen confirmed. They
 * start at zero stock with no price: being in the catalog says nothing about what the kitchen has.
 */
export async function addIngredientsFromCatalog(
  organizationId: string,
  picks: { id: string; unit: string }[],
  actorUserId: string,
  kitchenId: string | null,
): Promise<BulkInventoryResult> {
  const found = await prisma.systemIngredient.findMany({ where: { id: { in: picks.map((p) => p.id) }, isActive: true }, orderBy: { name: "asc" } });
  const unitById = new Map(picks.map((p) => [p.id, normalizeUnit(p.unit)]));
  const invalid: BulkInventoryResult["failed"] = [];
  const entries = [];
  for (const item of found) {
    const unit = unitById.get(item.id);
    if (!unit) invalid.push({ name: item.name, reason: "Choose a unit." });
    else entries.push({ name: item.name, category: item.categoryName, unit, image: ingredientImage(item.categoryName) });
  }
  const result = await bulkAddInventory(organizationId, entries, actorUserId, kitchenId);
  return { ...result, failed: [...invalid, ...result.failed] };
}
