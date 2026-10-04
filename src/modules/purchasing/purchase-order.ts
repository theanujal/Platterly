import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { checkMoney, checkText } from "@/lib/validation";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { sharedOrAt } from "@/modules/locations/scope";
import { remainingQuantity, statusAfterReceipt } from "./po-math";

export class PurchaseOrderError extends Error {}

export interface PurchaseOrderInput {
  supplierId: string;
  expectedDate?: Date | null;
  notes?: string | null;
  /** Chunk 23: the location this order is for; null or omitted = not tied to one (shown at every location). */
  locationId?: string | null;
  items: { inventoryId: string; quantity: number; unitCost: number }[];
}

const MAX_LINES = 100;

const poInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  items: { include: { inventory: { select: { id: true, name: true, unit: true, stockCount: true } } }, orderBy: { inventory: { name: "asc" as const } } },
};

async function checkInput(organizationId: string, input: PurchaseOrderInput) {
  checkText(input.notes, "notes", 2000);
  if (input.expectedDate && Number.isNaN(input.expectedDate.getTime())) throw new PurchaseOrderError("Enter a valid expected date.");
  if (input.items.length === 0) throw new PurchaseOrderError("Add at least one item.");
  if (input.items.length > MAX_LINES) throw new PurchaseOrderError(`An order can have at most ${MAX_LINES} items.`);
  const ids = input.items.map((i) => i.inventoryId);
  if (new Set(ids).size !== ids.length) throw new PurchaseOrderError("Each item can be listed only once.");
  for (const line of input.items) {
    if (!(line.quantity > 0)) throw new PurchaseOrderError("Every item needs a quantity greater than zero.");
    if (!(line.unitCost >= 0)) throw new PurchaseOrderError("A unit cost cannot be negative.");
    checkMoney(line.quantity, "quantity", { max: 1_000_000_000 });
    checkMoney(line.unitCost, "unit cost");
  }
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, organizationId }, select: { id: true, isActive: true } });
  if (!supplier) throw new PurchaseOrderError("Choose a supplier.");
  if ((await prisma.inventory.count({ where: { id: { in: ids }, organizationId } })) !== ids.length) throw new PurchaseOrderError("One of the items is not in your inventory.");
  if (input.locationId && !(await prisma.kitchen.findFirst({ where: { id: input.locationId, organizationId }, select: { id: true } }))) throw new PurchaseOrderError("That location does not exist.");
}

/** PO-0001, PO-0002… per kitchen. The unique key makes two at once safe: the loser retries with the next number. */
async function nextNumber(organizationId: string): Promise<number> {
  const last = await prisma.purchaseOrder.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { number: true } });
  return last ? Number.parseInt(last.number.replace(/\D/g, ""), 10) + 1 : 1;
}

export async function createPurchaseOrder(organizationId: string, input: PurchaseOrderInput, actorUserId: string) {
  await checkInput(organizationId, input);
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = `PO-${String((await nextNumber(organizationId)) + attempt).padStart(4, "0")}`;
    try {
      const po = await prisma.purchaseOrder.create({
        data: {
          organizationId,
          number,
          supplierId: input.supplierId,
          expectedDate: input.expectedDate ?? null,
          notes: input.notes?.trim() || null,
          kitchenId: input.locationId ?? null,
          createdByUserId: actorUserId,
          items: { create: input.items.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity, unitCost: i.unitCost })) },
        },
        include: poInclude,
      });
      await audit({ organizationId, actorUserId, action: "purchase_order.create", recordType: "PurchaseOrder", recordId: po.id, after: { number, supplierId: po.supplierId, lines: po.items.length } });
      return po;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  throw new PurchaseOrderError("Could not number the order. Try again.");
}

async function loadFor(organizationId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, organizationId }, include: poInclude });
  if (!po) throw new PurchaseOrderError("Purchase order not found.");
  return po;
}

/** Only a draft (the request) can be edited; once ordered the lines are what the supplier was told. */
export async function updatePurchaseOrder(organizationId: string, id: string, input: PurchaseOrderInput, actorUserId: string) {
  const before = await loadFor(organizationId, id);
  if (before.status !== "DRAFT") throw new PurchaseOrderError("Only a draft can be edited.");
  await checkInput(organizationId, input);
  const po = await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        expectedDate: input.expectedDate ?? null,
        notes: input.notes?.trim() || null,
        items: { create: input.items.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity, unitCost: i.unitCost })) },
      },
      include: poInclude,
    });
  });
  await audit({ organizationId, actorUserId, action: "purchase_order.update", recordType: "PurchaseOrder", recordId: id, before: { lines: before.items.length }, after: { lines: po.items.length } });
  return po;
}

async function setStatus(organizationId: string, id: string, from: PurchaseOrderStatus[], to: PurchaseOrderStatus, actorUserId: string, data: Record<string, unknown> = {}) {
  const claimed = await prisma.purchaseOrder.updateMany({ where: { id, organizationId, status: { in: from } }, data: { status: to, ...data } });
  if (claimed.count === 0) throw new PurchaseOrderError(`This order cannot move to "${to.toLowerCase().replace("_", " ")}" from its current status.`);
  await audit({ organizationId, actorUserId, action: `purchase_order.${to.toLowerCase()}`, recordType: "PurchaseOrder", recordId: id, after: { status: to } });
}

/** Draft (request) -> Ordered: sent to the supplier. */
export const markOrdered = (organizationId: string, id: string, actorUserId: string) => setStatus(organizationId, id, ["DRAFT"], "ORDERED", actorUserId, { orderedAt: new Date() });

/** Cancel is only possible while nothing has arrived. */
export async function cancelPurchaseOrder(organizationId: string, id: string, actorUserId: string) {
  const po = await loadFor(organizationId, id);
  if (po.items.some((i) => Number(i.receivedQuantity) > 0)) throw new PurchaseOrderError("Stock has already been received on this order, so it cannot be cancelled.");
  await setStatus(organizationId, id, ["DRAFT", "ORDERED"], "CANCELLED", actorUserId);
}

export async function deletePurchaseOrder(organizationId: string, id: string, actorUserId: string) {
  const po = await loadFor(organizationId, id);
  if (po.status !== "DRAFT" && po.status !== "CANCELLED") throw new PurchaseOrderError("Only a draft or cancelled order can be deleted.");
  await prisma.purchaseOrder.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "purchase_order.delete", recordType: "PurchaseOrder", recordId: id, before: { number: po.number, status: po.status } });
}

/**
 * Books what arrived: a real STOCK_IN ledger row per line (so stock, low-stock alerts and the history all agree),
 * the received quantity on the line, and the order's new status. Nothing above what is still outstanding is accepted.
 */
export async function receiveStock(organizationId: string, id: string, lines: { itemId: string; quantity: number }[], actorUserId: string) {
  const entries = lines.filter((l) => l.quantity > 0);
  if (entries.length === 0) throw new PurchaseOrderError("Enter a quantity for at least one item.");
  if (new Set(entries.map((l) => l.itemId)).size !== entries.length) throw new PurchaseOrderError("Each item can be listed only once.");

  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({ where: { id, organizationId }, include: { items: true } });
    if (!po) throw new PurchaseOrderError("Purchase order not found.");
    if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") throw new PurchaseOrderError("Stock can only be received on an order that has been placed.");

    for (const entry of entries) {
      const item = po.items.find((i) => i.id === entry.itemId);
      if (!item) throw new PurchaseOrderError("That item is not on this order.");
      const remaining = remainingQuantity({ quantity: Number(item.quantity), receivedQuantity: Number(item.receivedQuantity), unitCost: Number(item.unitCost) });
      if (entry.quantity > remaining) throw new PurchaseOrderError(`Only ${remaining} is still to arrive for one of the items.`);
      // The check above can be stale if two receipts run at once, so the write itself only succeeds while enough is still outstanding.
      const booked = await tx.purchaseOrderItem.updateMany({
        where: { id: item.id, receivedQuantity: { lte: Math.round((Number(item.quantity) - entry.quantity) * 1000) / 1000 } },
        data: { receivedQuantity: { increment: entry.quantity } },
      });
      if (booked.count === 0) throw new PurchaseOrderError("This item has just been received by someone else. Refresh and try again.");
      await tx.inventory.update({ where: { id: item.inventoryId }, data: { stockCount: { increment: entry.quantity } } });
      await tx.inventoryTransaction.create({ data: { inventoryId: item.inventoryId, type: "STOCK_IN", quantity: entry.quantity, note: `Received on ${po.number}`, actorUserId } });
    }

    const fresh = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const status = statusAfterReceipt(fresh.map((i) => ({ quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity), unitCost: Number(i.unitCost) })));
    await tx.purchaseOrder.update({ where: { id }, data: { status, receivedAt: status === "RECEIVED" ? new Date() : null } });
    return { number: po.number, status };
  });

  await audit({ organizationId, actorUserId, action: "purchase_order.receive", recordType: "PurchaseOrder", recordId: id, after: { status: result.status, lines: entries.length } });
  return result;
}

export async function getPurchaseOrder(organizationId: string, id: string) {
  return prisma.purchaseOrder.findFirst({ where: { id, organizationId }, include: poInclude });
}

/** With a `locationId`, that location's orders plus the ones not tied to a location. */
export async function listPurchaseOrders(organizationId: string, status?: PurchaseOrderStatus, supplierId?: string, locationId?: string | null) {
  return prisma.purchaseOrder.findMany({
    where: { organizationId, ...sharedOrAt(locationId), ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { supplier: { select: { id: true, name: true } }, items: { select: { quantity: true, receivedQuantity: true, unitCost: true } } },
  });
}

/** Items at or below their low-stock alert, with a suggested quantity, to start a purchase request from. */
export async function suggestReorder(organizationId: string, locationId?: string | null) {
  const items = await prisma.inventory.findMany({ where: { organizationId, ...sharedOrAt(locationId), lowStockThreshold: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, stockCount: true, lowStockThreshold: true, costPerUnit: true } });
  return items
    .filter((i) => Number(i.stockCount) <= Number(i.lowStockThreshold))
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: Number(i.stockCount), suggested: Math.max(1, Math.ceil(Number(i.lowStockThreshold) * 2 - Number(i.stockCount))), costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit) }));
}
