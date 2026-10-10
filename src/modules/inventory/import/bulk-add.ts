import "server-only";
import { prisma } from "@/lib/db";
import { createInventoryItem, InventoryNameTakenError } from "@/modules/inventory/inventory";

export interface BulkInventoryEntry {
  name: string;
  category: string;
  unit: string;
  costPerUnit?: number;
  lowStockThreshold?: number;
  storageLocation?: string;
  image?: string;
  /** Written as the normal "Opening stock" STOCK_IN entry. Absent or 0 leaves the item with no stock. */
  openingStock?: number;
}

export interface BulkInventoryResult {
  created: number;
  skipped: { name: string; reason: string }[];
  failed: { name: string; reason: string }[];
}

/**
 * Shared by the Excel/CSV import and the ingredient catalog. Each item goes through `createInventoryItem`, so it gets
 * the same validation, opening-stock ledger entry and audit row as one added by hand. A name that already exists in
 * the same location slot (or repeats in the batch) is skipped and reported, never overwritten. Adding an item says
 * nothing about stock: it stays at 0 unless an opening stock is given.
 */
export async function bulkAddInventory(
  organizationId: string,
  entries: BulkInventoryEntry[],
  actorUserId: string,
  kitchenId: string | null,
): Promise<BulkInventoryResult> {
  const result: BulkInventoryResult = { created: 0, skipped: [], failed: [] };
  const taken = new Set(
    (await prisma.inventory.findMany({ where: { organizationId, kitchenId }, select: { name: true } })).map((i) => i.name.toLowerCase()),
  );
  for (const entry of entries) {
    const name = entry.name.trim();
    if (taken.has(name.toLowerCase())) {
      result.skipped.push({ name, reason: "Already in your Inventory Items." });
      continue;
    }
    try {
      await createInventoryItem(
        organizationId,
        {
          name,
          category: entry.category,
          unit: entry.unit,
          costPerUnit: entry.costPerUnit,
          lowStockThreshold: entry.lowStockThreshold,
          storageLocation: entry.storageLocation,
          image: entry.image,
          kitchenId,
        },
        actorUserId,
        entry.openingStock,
      );
      taken.add(name.toLowerCase());
      result.created++;
    } catch (error) {
      if (error instanceof InventoryNameTakenError) result.skipped.push({ name, reason: "Already in your Inventory Items." });
      else result.failed.push({ name, reason: error instanceof Error ? error.message : "Could not be added." });
    }
  }
  return result;
}
