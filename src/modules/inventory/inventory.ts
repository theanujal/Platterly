import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { InventoryTransactionType } from "@/generated/prisma/enums";

export interface InventoryItemInput {
  name: string;
  category: string;
  description?: string;
  image?: string;
  unit: string;
  lowStockThreshold?: number;
  costPerUnit?: number;
  storageLocation?: string;
  supplierName?: string;
  supplierContact?: string;
  expiryDate?: Date;
}

export interface StockTransactionInput {
  type: InventoryTransactionType;
  /** Positive magnitude for STOCK_IN/STOCK_OUT; a signed delta for ADJUSTMENT. */
  quantity: number;
  note?: string;
}

/** Opening stock is created here as a real STOCK_IN ledger entry, not a bare column write — the ledger stays the one source of truth for every stock change. */
export async function createInventoryItem(
  organizationId: string,
  input: InventoryItemInput,
  actorUserId: string,
  openingStock?: number,
) {
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventory.create({
      data: {
        organizationId,
        name: input.name,
        category: input.category,
        description: input.description,
        image: input.image,
        unit: input.unit,
        lowStockThreshold: input.lowStockThreshold,
        costPerUnit: input.costPerUnit,
        storageLocation: input.storageLocation,
        supplierName: input.supplierName,
        supplierContact: input.supplierContact,
        expiryDate: input.expiryDate,
      },
    });

    if (openingStock && openingStock > 0) {
      await tx.inventory.update({ where: { id: created.id }, data: { stockCount: openingStock } });
      await tx.inventoryTransaction.create({
        data: {
          inventoryId: created.id,
          type: "STOCK_IN",
          quantity: openingStock,
          note: "Opening stock",
          actorUserId,
        },
      });
    }

    return tx.inventory.findUniqueOrThrow({ where: { id: created.id } });
  });

  await audit({
    organizationId,
    actorUserId,
    action: "inventory.create",
    recordType: "Inventory",
    recordId: item.id,
    after: JSON.parse(JSON.stringify(item)),
  });

  return item;
}

/** Metadata only — stock count changes always go through `recordStockTransaction`, never a direct field edit. */
export async function updateInventoryItem(
  organizationId: string,
  id: string,
  input: InventoryItemInput,
  actorUserId: string,
) {
  const before = await prisma.inventory.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.inventory.update({
    where: { id },
    data: {
      name: input.name,
      category: input.category,
      description: input.description,
      image: input.image,
      unit: input.unit,
      lowStockThreshold: input.lowStockThreshold,
      costPerUnit: input.costPerUnit,
      storageLocation: input.storageLocation,
      supplierName: input.supplierName,
      supplierContact: input.supplierContact,
      expiryDate: input.expiryDate,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "inventory.update",
    recordType: "Inventory",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/**
 * Hard delete — InventoryTransaction cascades (DB-level onDelete: Cascade).
 * Now referenced by Event (Chunk 9, via EventRequiredInventory's
 * onDelete: Restrict) once an Event actually requires this item — checked
 * explicitly up front, same pre-check convention as event-type.ts's
 * EventTypeInUseError.
 */
export class InventoryInUseError extends Error {}

export async function deleteInventoryItem(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.inventory.findFirstOrThrow({ where: { id, organizationId } });

  const eventCount = await prisma.eventRequiredInventory.count({ where: { inventoryId: id } });
  if (eventCount > 0) {
    throw new InventoryInUseError(`"${before.name}" is required by ${eventCount} Event(s) and can't be deleted.`);
  }

  await prisma.inventory.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "inventory.delete",
    recordType: "Inventory",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listInventoryItems(organizationId: string) {
  return prisma.inventory.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getInventoryItem(organizationId: string, id: string) {
  return prisma.inventory.findFirst({
    where: { id, organizationId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

/**
 * Stock In/Out/Adjustment math, kept in one place so it's the only code path
 * that ever moves `stockCount` (Verify line from `dev plans/chunk-07-inventory-basic.md`
 * Group 7.1). STOCK_IN/STOCK_OUT quantities must be positive; ADJUSTMENT can
 * be a positive or negative delta (found extra stock vs. wastage/spoilage
 * correction). No transaction may take stock below zero.
 */
export async function recordStockTransaction(
  organizationId: string,
  inventoryId: string,
  input: StockTransactionInput,
  actorUserId: string,
) {
  if (input.type !== "ADJUSTMENT" && input.quantity <= 0) {
    throw new Error("Quantity must be greater than zero for Stock In / Stock Out.");
  }
  if (input.type === "ADJUSTMENT" && input.quantity === 0) {
    throw new Error("Adjustment quantity cannot be zero.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.inventory.findFirstOrThrow({ where: { id: inventoryId, organizationId } });

    const delta = input.type === "STOCK_OUT" ? -input.quantity : input.quantity;
    const newStock = Number(item.stockCount) + delta;
    if (newStock < 0) {
      throw new Error("This would take stock below zero.");
    }

    const updated = await tx.inventory.update({ where: { id: inventoryId }, data: { stockCount: newStock } });
    const transaction = await tx.inventoryTransaction.create({
      data: {
        inventoryId,
        type: input.type,
        quantity: input.quantity,
        note: input.note,
        actorUserId,
      },
    });

    return { item: updated, transaction };
  });

  await audit({
    organizationId,
    actorUserId,
    action: "inventory.stock_transaction",
    recordType: "InventoryTransaction",
    recordId: result.transaction.id,
    after: JSON.parse(JSON.stringify(result.transaction)),
  });

  return result;
}

/** Feeds the Dashboard's Inventory Overview card (Chunk 5 placeholder, wired for real here). */
export async function getInventoryOverviewStats(organizationId: string) {
  const items = await prisma.inventory.findMany({
    where: { organizationId },
    select: { category: true, stockCount: true, lowStockThreshold: true, costPerUnit: true },
  });

  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let totalValue = 0;
  const categories = new Set<string>();

  for (const item of items) {
    categories.add(item.category);
    const stock = Number(item.stockCount);
    const threshold = item.lowStockThreshold !== null ? Number(item.lowStockThreshold) : null;
    if (item.costPerUnit !== null) totalValue += stock * Number(item.costPerUnit);

    if (stock <= 0) outOfStock += 1;
    else if (threshold !== null && stock <= threshold) lowStock += 1;
    else inStock += 1;
  }

  return {
    totalItems: items.length,
    inStock,
    lowStock,
    outOfStock,
    categories: categories.size,
    totalValue,
  };
}

/** Low-stock flag, per the chunk plan's "low-stock flag feeding the dashboard Inventory Overview card". */
export async function listLowStockItems(organizationId: string) {
  const items = await prisma.inventory.findMany({
    where: { organizationId, lowStockThreshold: { not: null } },
    orderBy: { name: "asc" },
  });
  return items.filter((item) => Number(item.stockCount) <= Number(item.lowStockThreshold));
}
