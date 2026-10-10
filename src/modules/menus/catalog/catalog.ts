import "server-only";
import { prisma } from "@/lib/db";
import { bulkAddFoodItems, type BulkResult } from "@/modules/menus/import/bulk-add";

/** Platterly's master catalog. Read-only for caterers: adding creates an independent Food Item, so later edits never flow either way. */
export async function listCatalog(organizationId: string) {
  const [items, added] = await Promise.all([
    prisma.systemFoodItem.findMany({ where: { isActive: true }, orderBy: [{ categoryName: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.menuItem.findMany({ where: { organizationId }, select: { name: true, sourceCatalogId: true } }),
  ]);
  const names = new Set(added.map((i) => i.name.toLowerCase()));
  const sources = new Set(added.map((i) => i.sourceCatalogId).filter(Boolean));
  return items.map((i) => ({ ...i, alreadyAdded: sources.has(i.id) || names.has(i.name.toLowerCase()) }));
}

/** Price starts at 0 so the caterer sets their own. */
export async function addCatalogItems(organizationId: string, catalogIds: string[], actorUserId: string): Promise<BulkResult> {
  const items = await prisma.systemFoodItem.findMany({ where: { id: { in: catalogIds }, isActive: true }, orderBy: { name: "asc" } });
  return bulkAddFoodItems(
    organizationId,
    items.map((i) => ({
      name: i.name,
      foodType: i.foodType,
      price: 0,
      description: i.description ?? undefined,
      categoryNames: [i.categoryName],
      sourceCatalogId: i.id,
    })),
    actorUserId,
  );
}
