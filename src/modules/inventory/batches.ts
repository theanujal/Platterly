import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { checkUnitCost } from "@/modules/purchasing/receipt-rules";
import type { Prisma } from "@/generated/prisma/client";
import type { StockBatchSource, StockBatchStatus } from "@/generated/prisma/enums";

/**
 * Stock batches: stock that arrived together at one cost and one expiry date (AJ, 2026-10-15).
 *
 * - `Inventory.stockCount` stays the on-hand number every screen reads. It equals the sum of the batches' remaining
 *   quantities plus any stock with no batch ("unbatched": written before batches existed or by a direct write; its cost
 *   is unknown). Every change to stock goes through this file so the two cannot drift apart.
 * - Consumption is FIFO for costing: the oldest received batch is used first (batches with no received date, such as opening
 *   stock, count as the oldest). Each slice is recorded as a StockAllocation with the batch's cost copied onto it, so a later
 *   delivery at another price never changes what an earlier consumption cost.
 * - Expired and quarantined batches are never consumed automatically. A person can still write them off with a negative
 *   adjustment, which takes them first.
 * - FIFO here is the financial rule. Which batch is best to use first in the kitchen (earliest expiry, FEFO) is only
 *   recommended (`recommendedBatchId`), never forced.
 */

type Tx = Prisma.TransactionClient;

/** A batch expiring within this many days is shown as "expires soon". */
export const EXPIRY_SOON_DAYS = 7;

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export class InsufficientStockError extends Error {
  constructor(
    message: string,
    readonly usable: number,
  ) {
    super(message);
  }
}

export class BatchError extends Error {}

/** Today's calendar date at UTC midnight, the form `@db.Date` columns are compared in. */
export function todayDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Expired once the day after the expiry date has begun; the expiry day itself is still usable. */
export const isExpired = (expiryDate: Date | null, today: Date) => expiryDate !== null && expiryDate.getTime() < today.getTime();

export const isExpiringSoon = (expiryDate: Date | null, today: Date, days = EXPIRY_SOON_DAYS) =>
  expiryDate !== null && !isExpired(expiryDate, today) && expiryDate.getTime() <= today.getTime() + days * 86_400_000;

/** Oldest first: batches with no received date (opening stock) before dated ones, then by arrival. */
const FIFO_ORDER = [{ receivedDate: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }, { id: "asc" }] as const satisfies Prisma.StockBatchOrderByWithRelationInput[];

async function lockInventory(tx: Tx, inventoryId: string) {
  await tx.$queryRaw`SELECT "id" FROM "inventory" WHERE "id" = ${inventoryId} FOR UPDATE`;
}

export interface StockPosition {
  stockCount: number;
  /** Can be consumed: active, unexpired batches plus unbatched stock. */
  usable: number;
  expired: number;
  quarantined: number;
  /** Stock with no batch (cost unknown). Counted as usable and consumed before any batch. */
  unbatched: number;
}

export async function stockPosition(tx: Tx | typeof prisma, inventoryId: string, today = todayDate()): Promise<StockPosition> {
  const [item, batches] = await Promise.all([
    tx.inventory.findUniqueOrThrow({ where: { id: inventoryId }, select: { stockCount: true } }),
    tx.stockBatch.findMany({ where: { inventoryId, remainingQuantity: { gt: 0 } }, select: { remainingQuantity: true, status: true, expiryDate: true } }),
  ]);
  let usableBatches = 0;
  let expired = 0;
  let quarantined = 0;
  for (const b of batches) {
    const q = Number(b.remainingQuantity);
    if (b.status === "QUARANTINED") quarantined += q;
    else if (isExpired(b.expiryDate, today)) expired += q;
    else usableBatches += q;
  }
  const stockCount = Number(item.stockCount);
  const unbatched = Math.max(0, round3(stockCount - usableBatches - expired - quarantined));
  return { stockCount, usable: round3(usableBatches + unbatched), expired: round3(expired), quarantined: round3(quarantined), unbatched };
}

export interface BatchInput {
  organizationId: string;
  inventoryId: string;
  source: StockBatchSource;
  quantity: number;
  unitCost?: number | null;
  receivedDate?: Date | null;
  expiryDate?: Date | null;
  lotNumber?: string | null;
  /** Why the cost is 0 when it is confirmed free. */
  costNote?: string | null;
  receiptLineId?: string | null;
}

/** Adds a batch and the same quantity to the item's on-hand stock. */
export async function createBatch(tx: Tx, input: BatchInput) {
  if (!(input.quantity > 0)) throw new BatchError("A batch needs a quantity greater than zero.");
  await lockInventory(tx, input.inventoryId);
  const batch = await tx.stockBatch.create({
    data: {
      organizationId: input.organizationId,
      inventoryId: input.inventoryId,
      source: input.source,
      originalQuantity: input.quantity,
      remainingQuantity: input.quantity,
      unitCost: input.unitCost ?? null,
      receivedDate: input.receivedDate ?? null,
      expiryDate: input.expiryDate ?? null,
      lotNumber: input.lotNumber?.trim() || null,
      costNote: input.unitCost === 0 ? input.costNote?.trim() || null : null,
      receiptLineId: input.receiptLineId ?? null,
    },
  });
  await tx.inventory.update({ where: { id: input.inventoryId }, data: { stockCount: { increment: input.quantity } } });
  return batch;
}

export interface Allocation {
  batchId: string | null;
  quantity: number;
  unitCost: number | null;
}

/** What a set of allocations cost, and how much of it has no known cost. */
export function allocationCost(allocations: { quantity: number; unitCost: number | null }[]) {
  let cost = 0;
  let unknownQuantity = 0;
  for (const a of allocations) {
    if (a.unitCost === null) unknownQuantity += a.quantity;
    else cost += a.quantity * a.unitCost;
  }
  return { cost: Math.round((cost + Number.EPSILON) * 100) / 100, unknownQuantity: round3(unknownQuantity) };
}

/**
 * Takes `quantity` out of stock, oldest batch first, and records an allocation per batch on `transactionId`. Throws
 * InsufficientStockError (changing nothing) when the usable stock is short; expired and quarantined stock is left alone
 * unless `includeUnusable` (a write-off), which takes that first.
 */
export async function consumeStock(tx: Tx, p: { inventoryId: string; quantity: number; transactionId: string; includeUnusable?: boolean; today?: Date }): Promise<Allocation[]> {
  if (!(p.quantity > 0)) throw new BatchError("Quantity must be greater than zero.");
  const today = p.today ?? todayDate();
  await lockInventory(tx, p.inventoryId);
  const position = await stockPosition(tx, p.inventoryId, today);
  const available = p.includeUnusable ? position.stockCount : position.usable;
  if (p.quantity > available + 0.0005) {
    const held = position.expired + position.quarantined;
    throw new InsufficientStockError(
      held > 0 && !p.includeUnusable
        ? `Only ${position.usable} is usable: ${position.expired > 0 ? `${position.expired} has expired` : ""}${position.expired > 0 && position.quarantined > 0 ? " and " : ""}${position.quarantined > 0 ? `${position.quarantined} is quarantined` : ""}.`
        : "This would take stock below zero.",
      position.usable,
    );
  }

  const batches = await tx.stockBatch.findMany({ where: { inventoryId: p.inventoryId, remainingQuantity: { gt: 0 } }, orderBy: [...FIFO_ORDER] });
  const unusable = (b: (typeof batches)[number]) => b.status === "QUARANTINED" || isExpired(b.expiryDate, today);
  // Unbatched stock first (the oldest there is), then batches; a write-off takes the unusable batches before the usable ones.
  const queue = p.includeUnusable ? [...batches.filter(unusable), ...batches.filter((b) => !unusable(b))] : batches.filter((b) => !unusable(b));

  const allocations: Allocation[] = [];
  let need = round3(p.quantity);
  const takeFromUnbatched = Math.min(need, position.unbatched);
  if (takeFromUnbatched > 0) {
    allocations.push({ batchId: null, quantity: round3(takeFromUnbatched), unitCost: null });
    need = round3(need - takeFromUnbatched);
  }
  for (const batch of queue) {
    if (need <= 0) break;
    const take = Math.min(need, Number(batch.remainingQuantity));
    // The guard in the write means two consumers can never both take the same units.
    const done = await tx.stockBatch.updateMany({ where: { id: batch.id, remainingQuantity: { gte: take } }, data: { remainingQuantity: { decrement: take } } });
    if (done.count === 0) throw new InsufficientStockError("Stock changed while this was being saved. Try again.", position.usable);
    allocations.push({ batchId: batch.id, quantity: round3(take), unitCost: batch.unitCost === null ? null : Number(batch.unitCost) });
    need = round3(need - take);
  }
  if (need > 0.0005) throw new InsufficientStockError("This would take stock below zero.", position.usable);

  const moved = await tx.inventory.updateMany({ where: { id: p.inventoryId, stockCount: { gte: p.quantity } }, data: { stockCount: { decrement: p.quantity } } });
  if (moved.count === 0) throw new InsufficientStockError("This would take stock below zero.", position.usable);
  await tx.stockAllocation.createMany({ data: allocations.map((a) => ({ transactionId: p.transactionId, batchId: a.batchId, quantity: a.quantity, unitCost: a.unitCost })) });
  return allocations;
}

/**
 * Puts `quantity` back for an order: into the same batches the order's earlier stock outs took from (latest taken first),
 * at the same costs. Anything that cannot be traced to a batch (sent before batches existed) goes back as unbatched stock.
 */
export async function restoreOrderStock(tx: Tx, p: { inventoryId: string; orderId: string; quantity: number; transactionId: string }): Promise<Allocation[]> {
  if (!(p.quantity > 0)) throw new BatchError("Quantity must be greater than zero.");
  await lockInventory(tx, p.inventoryId);
  const rows = await tx.stockAllocation.findMany({
    where: { transaction: { orderId: p.orderId, inventoryId: p.inventoryId } },
    orderBy: [{ transaction: { createdAt: "asc" } }, { id: "asc" }],
    select: { batchId: true, quantity: true, unitCost: true, transaction: { select: { type: true } } },
  });
  // Net still out of each batch for this order; the cost it was taken at stays with it.
  const net = new Map<string, { quantity: number; unitCost: number | null }>();
  const order: string[] = [];
  for (const r of rows) {
    if (!r.batchId) continue;
    const entry = net.get(r.batchId) ?? { quantity: 0, unitCost: r.unitCost === null ? null : Number(r.unitCost) };
    entry.quantity = round3(entry.quantity + (r.transaction.type === "STOCK_OUT" ? 1 : -1) * Number(r.quantity));
    if (!net.has(r.batchId)) order.push(r.batchId);
    net.set(r.batchId, entry);
  }
  const allocations: Allocation[] = [];
  let left = round3(p.quantity);
  for (const batchId of [...order].reverse()) {
    if (left <= 0) break;
    const entry = net.get(batchId)!;
    const give = Math.min(left, entry.quantity);
    if (give <= 0) continue;
    await tx.stockBatch.update({ where: { id: batchId }, data: { remainingQuantity: { increment: give } } });
    allocations.push({ batchId, quantity: round3(give), unitCost: entry.unitCost });
    left = round3(left - give);
  }
  if (left > 0) allocations.push({ batchId: null, quantity: left, unitCost: null });
  await tx.inventory.update({ where: { id: p.inventoryId }, data: { stockCount: { increment: p.quantity } } });
  await tx.stockAllocation.createMany({ data: allocations.map((a) => ({ transactionId: p.transactionId, batchId: a.batchId, quantity: a.quantity, unitCost: a.unitCost })) });
  return allocations;
}

/** The unit cost of the next unit that would be consumed (the oldest usable batch with a cost); the item's own cost when there is none. */
export async function currentUnitCosts(organizationId: string, inventoryIds: string[], today = todayDate()): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (inventoryIds.length === 0) return result;
  const [items, batches] = await Promise.all([
    prisma.inventory.findMany({ where: { organizationId, id: { in: inventoryIds } }, select: { id: true, costPerUnit: true } }),
    prisma.stockBatch.findMany({ where: { organizationId, inventoryId: { in: inventoryIds }, remainingQuantity: { gt: 0 }, status: "ACTIVE" }, orderBy: [...FIFO_ORDER], select: { inventoryId: true, unitCost: true, expiryDate: true } }),
  ]);
  const head = new Map<string, number | null>();
  for (const b of batches) {
    if (isExpired(b.expiryDate, today) || head.has(b.inventoryId)) continue;
    head.set(b.inventoryId, b.unitCost === null ? null : Number(b.unitCost));
  }
  for (const item of items) {
    const fromBatch = head.get(item.id);
    result.set(item.id, fromBatch ?? (item.costPerUnit === null ? null : Number(item.costPerUnit)));
  }
  return result;
}

export interface BatchView {
  id: string;
  source: StockBatchSource;
  status: StockBatchStatus;
  originalQuantity: number;
  remainingQuantity: number;
  unitCost: number | null;
  receivedDate: Date | null;
  expiryDate: Date | null;
  lotNumber: string | null;
  costNote: string | null;
  /** The item tracks expiry but this batch has no expiry date recorded (legacy stock; never invented). */
  expiryMissing: boolean;
  state: "usable" | "expired" | "quarantined" | "empty";
  expiringSoon: boolean;
  /** Position in the FIFO queue (1 = consumed next), for usable batches. */
  fifoRank: number | null;
}

/** Batches of one item for the Batches drawer, with FIFO order and the kitchen's FEFO recommendation. */
export async function listBatches(organizationId: string, inventoryId: string, today = todayDate()) {
  const [rows, item] = await Promise.all([prisma.stockBatch.findMany({ where: { organizationId, inventoryId }, orderBy: [...FIFO_ORDER] }), prisma.inventory.findFirst({ where: { id: inventoryId, organizationId }, select: { tracksExpiry: true } })]);
  let rank = 0;
  const batches: BatchView[] = rows.map((b) => {
    const remaining = Number(b.remainingQuantity);
    const state = remaining <= 0 ? "empty" : b.status === "QUARANTINED" ? "quarantined" : isExpired(b.expiryDate, today) ? "expired" : "usable";
    return {
      id: b.id,
      source: b.source,
      status: b.status,
      originalQuantity: Number(b.originalQuantity),
      remainingQuantity: remaining,
      unitCost: b.unitCost === null ? null : Number(b.unitCost),
      receivedDate: b.receivedDate,
      expiryDate: b.expiryDate,
      lotNumber: b.lotNumber,
      costNote: b.costNote,
      expiryMissing: Boolean(item?.tracksExpiry) && b.expiryDate === null && remaining > 0,
      state,
      expiringSoon: state === "usable" && isExpiringSoon(b.expiryDate, today),
      fifoRank: state === "usable" ? ++rank : null,
    };
  });
  return { batches, recommendedBatchId: recommendedBatchId(batches) };
}

/** Kitchen rotation advice (FEFO): the usable batch that expires soonest. Costing still follows FIFO. */
export function recommendedBatchId(batches: BatchView[]): string | null {
  const dated = batches.filter((b) => b.state === "usable" && b.expiryDate !== null).sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime());
  return dated[0]?.id ?? null;
}

/** Holds a batch back (never consumed) or releases it. */
export async function setBatchStatus(organizationId: string, batchId: string, status: StockBatchStatus, actorUserId: string) {
  const before = await prisma.stockBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!before) throw new BatchError("Batch not found.");
  if (before.status === status) return before;
  const after = await prisma.stockBatch.update({ where: { id: batchId }, data: { status } });
  await audit({ organizationId, actorUserId, action: status === "QUARANTINED" ? "inventory.batch_quarantined" : "inventory.batch_released", recordType: "StockBatch", recordId: batchId, before: { status: before.status }, after: { status } });
  return after;
}

/** Per item: the earliest expiry among batches with stock left, and whether any of that stock has expired or is about to. For the Inventory list. */
export async function expiryByItem(organizationId: string, inventoryIds: string[], today = todayDate()) {
  const out = new Map<string, { earliest: Date | null; expired: boolean; expiringSoon: boolean }>();
  if (inventoryIds.length === 0) return out;
  const batches = await prisma.stockBatch.findMany({ where: { organizationId, inventoryId: { in: inventoryIds }, remainingQuantity: { gt: 0 }, expiryDate: { not: null } }, select: { inventoryId: true, expiryDate: true } });
  for (const b of batches) {
    const entry = out.get(b.inventoryId) ?? { earliest: null, expired: false, expiringSoon: false };
    if (!entry.earliest || b.expiryDate!.getTime() < entry.earliest.getTime()) entry.earliest = b.expiryDate;
    if (isExpired(b.expiryDate, today)) entry.expired = true;
    else if (isExpiringSoon(b.expiryDate, today)) entry.expiringSoon = true;
    out.set(b.inventoryId, entry);
  }
  return out;
}

/** Items whose on-hand number and batches disagree: `unbatched` > 0 is stock with no batch (legacy), < 0 means batches hold more than the count. */
export async function findStockMismatches(organizationId: string) {
  const rows = await prisma.$queryRaw<{ id: string; name: string; stockCount: Prisma.Decimal; batched: Prisma.Decimal }[]>`
    SELECT i."id", i."name", i."stockCount", COALESCE(SUM(b."remainingQuantity"), 0) AS batched
    FROM "inventory" i LEFT JOIN "stock_batch" b ON b."inventoryId" = i."id"
    WHERE i."organizationId" = ${organizationId}
    GROUP BY i."id" HAVING i."stockCount" <> COALESCE(SUM(b."remainingQuantity"), 0)`;
  return rows.map((r) => ({ inventoryId: r.id, name: r.name, stockCount: Number(r.stockCount), batched: Number(r.batched), unbatched: round3(Number(r.stockCount) - Number(r.batched)) }));
}

/** Gives stock that has no batch an explicit opening batch (cost and dates only if the person supplies them). */
export async function recordOpeningBatch(organizationId: string, inventoryId: string, input: { unitCost?: number | null; expiryDate?: Date | null }, actorUserId: string) {
  const batch = await prisma.$transaction(async (tx) => {
    await lockInventory(tx, inventoryId);
    const item = await tx.inventory.findFirst({ where: { id: inventoryId, organizationId }, select: { stockCount: true } });
    if (!item) throw new BatchError("Item not found.");
    const batched = await tx.stockBatch.aggregate({ where: { inventoryId }, _sum: { remainingQuantity: true } });
    const gap = round3(Number(item.stockCount) - Number(batched._sum.remainingQuantity ?? 0));
    if (gap <= 0) throw new BatchError("All of this item's stock is already in batches.");
    // The batch holds stock already counted, so the count is not raised again.
    return tx.stockBatch.create({ data: { organizationId, inventoryId, source: "OPENING", originalQuantity: gap, remainingQuantity: gap, unitCost: input.unitCost ?? null, expiryDate: input.expiryDate ?? null } });
  });
  await audit({ organizationId, actorUserId, action: "inventory.opening_batch", recordType: "StockBatch", recordId: batch.id, after: { inventoryId, quantity: Number(batch.originalQuantity) } });
  return batch;
}

/** Usable (unexpired, not quarantined, plus unbatched) stock per item, in one pass, for planning screens. */
export async function usableStockMap(organizationId: string, inventoryIds: string[], today = todayDate()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (inventoryIds.length === 0) return out;
  const [items, batches] = await Promise.all([
    prisma.inventory.findMany({ where: { organizationId, id: { in: inventoryIds } }, select: { id: true, stockCount: true } }),
    prisma.stockBatch.findMany({ where: { organizationId, inventoryId: { in: inventoryIds }, remainingQuantity: { gt: 0 } }, select: { inventoryId: true, remainingQuantity: true, status: true, expiryDate: true } }),
  ]);
  const held = new Map<string, number>();
  const usableBatches = new Map<string, number>();
  for (const b of batches) {
    const q = Number(b.remainingQuantity);
    held.set(b.inventoryId, (held.get(b.inventoryId) ?? 0) + q);
    if (b.status === "ACTIVE" && !isExpired(b.expiryDate, today)) usableBatches.set(b.inventoryId, (usableBatches.get(b.inventoryId) ?? 0) + q);
  }
  for (const item of items) {
    const unbatched = Math.max(0, Number(item.stockCount) - (held.get(item.id) ?? 0));
    out.set(item.id, round3((usableBatches.get(item.id) ?? 0) + unbatched));
  }
  return out;
}

/**
 * What the stock sent to an order cost, per item, from the batch allocations written when it was sent (less what was
 * returned, at the cost it was taken at). It never changes when a later delivery arrives at another price. `unknownQuantity`
 * is stock whose cost was never known (opening stock without a cost, manual Stock In).
 */
export async function orderStockCost(orderId: string): Promise<Map<string, { cost: number; unknownQuantity: number }>> {
  const rows = await prisma.stockAllocation.findMany({
    where: { transaction: { orderId } },
    select: { quantity: true, unitCost: true, transaction: { select: { inventoryId: true, type: true } } },
  });
  const byItem = new Map<string, { quantity: number; unitCost: number | null }[]>();
  for (const r of rows) {
    const sign = r.transaction.type === "STOCK_OUT" ? 1 : -1;
    const list = byItem.get(r.transaction.inventoryId) ?? [];
    list.push({ quantity: sign * Number(r.quantity), unitCost: r.unitCost === null ? null : Number(r.unitCost) });
    byItem.set(r.transaction.inventoryId, list);
  }
  const out = new Map<string, { cost: number; unknownQuantity: number }>();
  for (const [id, list] of byItem) out.set(id, allocationCost(list));
  return out;
}

/**
 * Confirms the cost of a batch whose cost is unknown (opening stock, a manual Stock In with no price): a cost above zero, or 0
 * with a reason for free goods. A batch with a known cost is never changed, so the cost history stays what it was. It only
 * affects what is consumed from the batch from now on; consumption already recorded as unknown stays unknown.
 */
export async function confirmBatchCost(organizationId: string, batchId: string, input: { unitCost: number; costNote?: string | null }, actorUserId: string) {
  checkUnitCost("this batch", input.unitCost, input.costNote);
  const before = await prisma.stockBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!before) throw new BatchError("Batch not found.");
  if (before.unitCost !== null) throw new BatchError("This batch already has a confirmed cost, so it cannot be changed.");
  const claimed = await prisma.stockBatch.updateMany({ where: { id: batchId, unitCost: null }, data: { unitCost: input.unitCost, costNote: input.unitCost === 0 ? input.costNote?.trim() || null : null } });
  if (claimed.count === 0) throw new BatchError("This batch already has a confirmed cost, so it cannot be changed.");
  await audit({ organizationId, actorUserId, action: "inventory.batch_cost_confirmed", recordType: "StockBatch", recordId: batchId, after: { unitCost: input.unitCost, costNote: input.costNote ?? null } });
}
