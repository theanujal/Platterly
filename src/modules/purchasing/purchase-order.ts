import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { checkMoney, checkText } from "@/lib/validation";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { sharedOrAt } from "@/modules/locations/scope";
import { createBatch, todayDate } from "@/modules/inventory/batches";
import { remainingQuantity, statusAfterReceipt } from "./po-math";
import { checkReceiptHeader, checkReceiptLine } from "./receipt-rules";

export class PurchaseOrderError extends Error {}

export interface PurchaseOrderInput {
  supplierId: string;
  notes?: string | null;
  /** Chunk 23: the location this order is for; null or omitted = not tied to one (shown at every location). */
  locationId?: string | null;
  /** Prices are not known when an order is raised (the actual cost is captured when stock is received), so the screens send no unit cost: a new line is stored at 0, and a line kept from before keeps the cost it had. */
  items: { inventoryId: string; quantity: number; unitCost?: number }[];
}

const MAX_LINES = 100;

const poInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  items: { include: { inventory: { select: { id: true, name: true, unit: true, stockCount: true, category: true, costPerUnit: true, tracksExpiry: true } } }, orderBy: { inventory: { name: "asc" as const } } },
};

/** `existing` is the order being edited: its own lines stay allowed even if the supplier mapping has changed since. */
async function checkInput(organizationId: string, input: PurchaseOrderInput, existing?: { supplierId: string; inventoryIds: string[] }) {
  checkText(input.notes, "notes", 2000);
  if (input.items.length === 0) throw new PurchaseOrderError("Add at least one item.");
  if (input.items.length > MAX_LINES) throw new PurchaseOrderError(`An order can have at most ${MAX_LINES} items.`);
  const ids = input.items.map((i) => i.inventoryId);
  if (new Set(ids).size !== ids.length) throw new PurchaseOrderError("Each item can be listed only once.");
  for (const line of input.items) {
    if (!(line.quantity > 0)) throw new PurchaseOrderError("Every item needs a quantity greater than zero.");
    if (line.unitCost !== undefined && !(line.unitCost >= 0)) throw new PurchaseOrderError("A unit cost cannot be negative.");
    checkMoney(line.quantity, "quantity", { max: 1_000_000_000 });
    if (line.unitCost !== undefined) checkMoney(line.unitCost, "unit cost");
  }
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, organizationId }, select: { id: true, isActive: true } });
  if (!supplier) throw new PurchaseOrderError("Choose a supplier.");
  const sameSupplier = existing?.supplierId === input.supplierId;
  if (!supplier.isActive && !sameSupplier) throw new PurchaseOrderError("That supplier is inactive. Choose an active supplier.");
  if ((await prisma.inventory.count({ where: { id: { in: ids }, organizationId } })) !== ids.length) throw new PurchaseOrderError("One of the items is not in your inventory.");
  // Only items the supplier is mapped to (Products Supplied) can be ordered from them; an edited order keeps the lines it already had.
  const keep = new Set(sameSupplier ? (existing?.inventoryIds ?? []) : []);
  const needMapping = ids.filter((id) => !keep.has(id));
  if (needMapping.length > 0 && (await prisma.supplierItem.count({ where: { organizationId, supplierId: input.supplierId, inventoryId: { in: needMapping } } })) !== needMapping.length) {
    throw new PurchaseOrderError("Every item must be one this supplier provides. Add it to the supplier's Products Supplied first.");
  }
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
          notes: input.notes?.trim() || null,
          kitchenId: input.locationId ?? null,
          createdByUserId: actorUserId,
          items: { create: input.items.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity, unitCost: i.unitCost ?? 0 })) },
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
  await checkInput(organizationId, input, { supplierId: before.supplierId, inventoryIds: before.items.map((i) => i.inventoryId) });
  // A draft saved before prices were dropped keeps the cost it had on a line that stays.
  const keptCost = new Map(before.items.map((i) => [i.inventoryId, Number(i.unitCost)]));
  const po = await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        notes: input.notes?.trim() || null,
        items: { create: input.items.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity, unitCost: keptCost.get(i.inventoryId) ?? i.unitCost ?? 0 })) },
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

export interface ReceiptInput {
  /** Made when the Receive drawer opens; a retry of the same submission carries the same key and adds nothing. */
  idempotencyKey: string;
  receivedDate: Date;
  invoiceNumber?: string | null;
  notes?: string | null;
  lines: {
    itemId: string;
    quantity: number;
    unitCost: number;
    /** Why the cost is 0 (free sample, complimentary goods). Required for a zero cost. */
    costNote?: string | null;
    /** Authorises the part of `quantity` above what is still to arrive, with the reason. Without it, over-delivery is refused. */
    extraReason?: string | null;
    expiryDate?: Date | null;
    lotNumber?: string | null;
  }[];
}

/**
 * Books a delivery against an order (see receipt-rules.ts for the rules): one receipt, a line and a new stock batch per
 * item received (so different costs or expiry dates stay separate), the accepted quantity added to stock, a STOCK_IN row in the
 * ledger, and the order's new status. All of it is one transaction, and a receipt with the same idempotency key is booked
 * only once. Receipts and batches are never edited afterwards, so earlier prices and expiry dates stay as they were.
 */
export async function receiveStock(organizationId: string, id: string, input: ReceiptInput, actorUserId: string) {
  const entries = input.lines.filter((l) => l.quantity > 0);
  if (entries.length === 0) throw new PurchaseOrderError("Enter a quantity for at least one item.");
  if (new Set(entries.map((l) => l.itemId)).size !== entries.length) throw new PurchaseOrderError("Each item can be listed only once.");
  const today = todayDate();

  let result: { number: string; status: PurchaseOrderStatus; receiptId: string; duplicate: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, organizationId }, include: { items: { include: { inventory: { select: { name: true, tracksExpiry: true } } } } } });
      if (!po) throw new PurchaseOrderError("Purchase order not found.");
      // A retry of a receipt that already went through: nothing is added, and the caller is told it is done.
      const done = await tx.goodsReceipt.findUnique({ where: { purchaseOrderId_idempotencyKey: { purchaseOrderId: id, idempotencyKey: input.idempotencyKey } }, select: { id: true } });
      if (done) return { number: po.number, status: po.status, receiptId: done.id, duplicate: true };
      if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") throw new PurchaseOrderError("Stock can only be received on an order that has been placed.");
      checkReceiptHeader({ receivedDate: input.receivedDate, today, orderPlacedAt: po.createdAt, invoiceNumber: input.invoiceNumber, notes: input.notes, idempotencyKey: input.idempotencyKey });

      const receipt = await tx.goodsReceipt.create({
        data: { organizationId, purchaseOrderId: id, receivedDate: input.receivedDate, invoiceNumber: input.invoiceNumber?.trim() || null, notes: input.notes?.trim() || null, idempotencyKey: input.idempotencyKey, createdByUserId: actorUserId },
      });

      for (const entry of entries) {
        const item = po.items.find((i) => i.id === entry.itemId);
        if (!item) throw new PurchaseOrderError("That item is not on this order.");
        const remaining = remainingQuantity({ quantity: Number(item.quantity), receivedQuantity: Number(item.receivedQuantity), unitCost: Number(item.unitCost) });
        checkReceiptLine({ name: item.inventory.name, tracksExpiry: item.inventory.tracksExpiry, remaining, quantity: entry.quantity, unitCost: entry.unitCost, costNote: entry.costNote, extraReason: entry.extraReason, expiryDate: entry.expiryDate, lotNumber: entry.lotNumber, receivedDate: input.receivedDate, today });
        const extra = Math.max(0, Math.round((entry.quantity - remaining) * 1000) / 1000);
        // The check above can be stale if two receipts run at once, so the write itself only succeeds while nothing else has been received since it was read.
        const booked = await tx.purchaseOrderItem.updateMany({ where: { id: item.id, receivedQuantity: item.receivedQuantity }, data: { receivedQuantity: { increment: entry.quantity } } });
        if (booked.count === 0) throw new PurchaseOrderError("This item has just been received by someone else. Refresh and try again.");

        const line = await tx.goodsReceiptLine.create({
          data: {
            receiptId: receipt.id,
            purchaseOrderItemId: item.id,
            inventoryId: item.inventoryId,
            quantity: entry.quantity,
            unitCost: entry.unitCost,
            costNote: entry.unitCost === 0 ? entry.costNote?.trim() || null : null,
            extraQuantity: extra,
            extraReason: extra > 0 ? entry.extraReason?.trim() || null : null,
            expiryDate: entry.expiryDate ?? null,
            lotNumber: entry.lotNumber?.trim() || null,
          },
        });
        const batch = await createBatch(tx, {
          organizationId,
          inventoryId: item.inventoryId,
          source: "RECEIPT",
          quantity: entry.quantity,
          unitCost: entry.unitCost,
          receivedDate: input.receivedDate,
          expiryDate: entry.expiryDate ?? null,
          lotNumber: entry.lotNumber,
          costNote: entry.unitCost === 0 ? entry.costNote?.trim() || null : null,
          receiptLineId: line.id,
        });
        const row = await tx.inventoryTransaction.create({ data: { inventoryId: item.inventoryId, type: "STOCK_IN", quantity: entry.quantity, note: `Received on ${po.number}`, actorUserId } });
        await tx.stockAllocation.create({ data: { transactionId: row.id, batchId: batch.id, quantity: entry.quantity, unitCost: entry.unitCost } });
        // The item's own cost follows the latest purchase price (the batches keep every earlier price); free goods do not reset it to 0.
        if (entry.unitCost > 0) await tx.inventory.update({ where: { id: item.inventoryId }, data: { costPerUnit: entry.unitCost } });
      }

      const fresh = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
      const status = statusAfterReceipt(fresh.map((i) => ({ quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity), unitCost: Number(i.unitCost) })));
      await tx.purchaseOrder.update({ where: { id }, data: { status, receivedAt: status === "RECEIVED" ? new Date() : null } });
      return { number: po.number, status, receiptId: receipt.id, duplicate: false };
    });
  } catch (error) {
    // Two identical submissions at the same moment: the loser hits the unique key and is told the receipt is already in.
    if ((error as { code?: string }).code === "P2002") {
      const existing = await prisma.goodsReceipt.findUnique({ where: { purchaseOrderId_idempotencyKey: { purchaseOrderId: id, idempotencyKey: input.idempotencyKey } }, select: { id: true, purchaseOrder: { select: { number: true, status: true } } } });
      if (existing) return { number: existing.purchaseOrder.number, status: existing.purchaseOrder.status, receiptId: existing.id, duplicate: true };
    }
    throw error;
  }

  if (!result.duplicate) await audit({ organizationId, actorUserId, action: "purchase_order.receive", recordType: "PurchaseOrder", recordId: id, after: { status: result.status, lines: entries.length, receiptId: result.receiptId } });
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
    include: { supplier: { select: { id: true, name: true } }, items: { select: { quantity: true, receivedQuantity: true, unitCost: true, receiptLines: { select: { quantity: true, unitCost: true } } } } },
  });
}

/** Items at or below their low-stock alert, with a suggested quantity, to start a purchase request from. */
export async function suggestReorder(organizationId: string, locationId?: string | null) {
  const items = await prisma.inventory.findMany({ where: { organizationId, ...sharedOrAt(locationId), lowStockThreshold: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, stockCount: true, lowStockThreshold: true, costPerUnit: true } });
  return items
    .filter((i) => Number(i.stockCount) <= Number(i.lowStockThreshold))
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: Number(i.stockCount), suggested: Math.max(1, Math.ceil(Number(i.lowStockThreshold) * 2 - Number(i.stockCount))), costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit) }));
}

/** Receipts booked against an order, newest first, each with its lines (actual cost, expiry, lot). */
export async function listReceipts(organizationId: string, purchaseOrderId: string) {
  const receipts = await prisma.goodsReceipt.findMany({
    where: { organizationId, purchaseOrderId },
    orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
    include: { lines: { include: { purchaseOrderItem: { select: { inventory: { select: { name: true, unit: true } } } } } } },
  });
  return receipts.map((r) => ({
    id: r.id,
    receivedDate: r.receivedDate,
    invoiceNumber: r.invoiceNumber,
    notes: r.notes,
    createdAt: r.createdAt,
    lines: r.lines.map((l) => ({ id: l.id, name: l.purchaseOrderItem.inventory.name, unit: l.purchaseOrderItem.inventory.unit, quantity: Number(l.quantity), unitCost: Number(l.unitCost), costNote: l.costNote, extraQuantity: Number(l.extraQuantity), extraReason: l.extraReason, expiryDate: l.expiryDate, lotNumber: l.lotNumber })),
  }));
}

/**
 * What an order's received stock cost: the actual receipt prices, plus stock received before receipts were recorded
 * (valued at the line's own unit cost, as before). `legacyQuantity` is that earlier stock, which has no price of its own.
 */
export async function receivedValueOf(purchaseOrderId: string) {
  const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId }, select: { id: true, receivedQuantity: true, unitCost: true, receiptLines: { select: { quantity: true, unitCost: true } } } });
  let value = 0;
  let legacyQuantity = 0;
  for (const item of items) {
    const fromReceipts = item.receiptLines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitCost), 0);
    const receiptQty = item.receiptLines.reduce((sum, l) => sum + Number(l.quantity), 0);
    const legacy = Math.max(0, Math.round((Number(item.receivedQuantity) - receiptQty) * 1000) / 1000);
    legacyQuantity += legacy;
    value += fromReceipts + legacy * Number(item.unitCost);
  }
  return { value: Math.round((value + Number.EPSILON) * 100) / 100, legacyQuantity: Math.round(legacyQuantity * 1000) / 1000 };
}
