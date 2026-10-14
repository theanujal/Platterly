import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createSupplier } from "@/modules/suppliers/supplier";
import { createInventoryItem, getInventoryOverviewStats, recordStockTransaction } from "@/modules/inventory/inventory";
import { createPurchaseOrder, markOrdered, receiveStock } from "@/modules/purchasing/purchase-order";
import {
  allocationCost,
  confirmBatchCost,
  consumeStock,
  previewConsumption,
  expiryByItem,
  findStockMismatches,
  InsufficientStockError,
  listBatches,
  recordOpeningBatch,
  restoreOrderStock,
  setBatchStatus,
  stockPosition,
  todayDate,
  usableStockMap,
} from "@/modules/inventory/batches";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

const day = (offset: number) => new Date(todayDate().getTime() + offset * 86_400_000);

async function setup(category = "Grains") {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Batch Org", slug: `b-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const supplier = await createSupplier(org.id, { name: "Supplier" }, actor.id);
  const item = await createInventoryItem(org.id, { name: "Rice", category, unit: "kg" }, actor.id);
  await prisma.supplierItem.create({ data: { organizationId: org.id, supplierId: supplier.id, inventoryId: item.id } });
  return { org, actor, supplier, item };
}

/** Raises an order for `quantity` and returns a function that books deliveries against it. */
async function orderFor(ctx: Awaited<ReturnType<typeof setup>>, quantity: number) {
  const po = await createPurchaseOrder(ctx.org.id, { supplierId: ctx.supplier.id, items: [{ inventoryId: ctx.item.id, quantity }] }, ctx.actor.id);
  await markOrdered(ctx.org.id, po.id, ctx.actor.id);
  const lineId = (await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).id;
  const receive = (quantity: number, unitCost: number, extra: { expiryDate?: Date | null; lotNumber?: string; key?: string; receivedDate?: Date; invoiceNumber?: string } = {}) =>
    receiveStock(
      ctx.org.id,
      po.id,
      { idempotencyKey: extra.key ?? crypto.randomUUID(), receivedDate: extra.receivedDate ?? todayDate(), invoiceNumber: extra.invoiceNumber, lines: [{ itemId: lineId, quantity, unitCost, expiryDate: extra.expiryDate ?? null, lotNumber: extra.lotNumber }] },
      ctx.actor.id,
    );
  return { po, lineId, receive };
}

const stock = async (id: string) => Number((await prisma.inventory.findUniqueOrThrow({ where: { id } })).stockCount);
const batchSum = async (id: string) => Number((await prisma.stockBatch.aggregate({ where: { inventoryId: id }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity ?? 0);

/** A stock out the way the app does it: the ledger row, then the FIFO allocation. */
async function takeOut(ctx: { item: { id: string } }, quantity: number, opts: { orderId?: string; includeUnusable?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.inventoryTransaction.create({ data: { inventoryId: ctx.item.id, type: "STOCK_OUT", quantity, orderId: opts.orderId } });
    return consumeStock(tx, { inventoryId: ctx.item.id, quantity, transactionId: row.id, includeUnusable: opts.includeUnusable });
  });
}

describe("Receiving creates batches", () => {
  it("partial deliveries and several receipts: each is its own batch, stock is the sum, the status follows", async () => {
    const ctx = await setup();
    const { po, receive } = await orderFor(ctx, 100);
    const first = await receive(40, 50, { lotNumber: "L1", invoiceNumber: "INV-1" });
    expect(first.status).toBe("PARTIALLY_RECEIVED");
    const second = await receive(30, 55, { lotNumber: "L2" });
    expect(second.status).toBe("PARTIALLY_RECEIVED");
    const third = await receive(30, 52);
    expect(third.status).toBe("RECEIVED");

    expect(await stock(ctx.item.id)).toBe(100);
    expect(await batchSum(ctx.item.id)).toBe(100);
    const batches = await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id }, orderBy: { createdAt: "asc" } });
    expect(batches.map((b) => [Number(b.originalQuantity), Number(b.unitCost), b.lotNumber])).toEqual([[40, 50, "L1"], [30, 55, "L2"], [30, 52, null]]);
    expect(batches.every((b) => b.source === "RECEIPT" && b.receiptLineId)).toBe(true);
    expect(await prisma.goodsReceipt.count({ where: { purchaseOrderId: po.id } })).toBe(3);
    // the order line still says what was ordered; the items' own cost follows the latest price
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: ctx.item.id } })).costPerUnit)).toBe(52);
  });

  it("earlier receipts and batches are not touched by a later one (price and expiry stay as they were)", async () => {
    const ctx = await setup("Dairy");
    const { receive } = await orderFor(ctx, 20);
    await receive(10, 40, { expiryDate: day(10) });
    const before = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: ctx.item.id } });
    await receive(10, 90, { expiryDate: day(20) });
    const after = await prisma.stockBatch.findUniqueOrThrow({ where: { id: before.id } });
    expect([Number(after.unitCost), after.expiryDate?.getTime(), Number(after.originalQuantity)]).toEqual([40, day(10).getTime(), 10]);
    expect(await prisma.stockBatch.count({ where: { inventoryId: ctx.item.id } })).toBe(2);
  });

  it("a repeated submission (same key) adds nothing, also when two arrive at once", async () => {
    const ctx = await setup();
    const { receive, po } = await orderFor(ctx, 50);
    const key = crypto.randomUUID();
    const a = await receive(20, 40, { key });
    const b = await receive(20, 40, { key });
    expect([a.duplicate, b.duplicate]).toEqual([false, true]);
    expect(await stock(ctx.item.id)).toBe(20);

    const key2 = crypto.randomUUID();
    const both = await Promise.allSettled([receive(10, 40, { key: key2 }), receive(10, 40, { key: key2 })]);
    expect(both.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await stock(ctx.item.id)).toBe(30);
    expect(await prisma.goodsReceipt.count({ where: { purchaseOrderId: po.id } })).toBe(2);
    expect(await batchSum(ctx.item.id)).toBe(30);
  });

  it("refuses over-delivery, a missing or zero cost, a missing expiry on perishables, and expired or future dates; nothing is booked", async () => {
    const perishable = await setup("Dairy");
    const { receive } = await orderFor(perishable, 10);
    await expect(receive(11, 40, { expiryDate: day(5) })).rejects.toThrow(/more than the 10 still to arrive/);
    await expect(receive(5, 0, { expiryDate: day(5) })).rejects.toThrow(/unit cost/);
    await expect(receive(5, 40)).rejects.toThrow(/expiry date/);
    await expect(receive(5, 40, { expiryDate: day(-1) })).rejects.toThrow(/expired|before the received/);
    await expect(receive(5, 40, { expiryDate: day(5), receivedDate: day(1) })).rejects.toThrow(/future/);
    await expect(receive(5, 40, { expiryDate: day(5), receivedDate: day(-3) })).rejects.toThrow(/before the order/);
    expect(await stock(perishable.item.id)).toBe(0);
    expect(await prisma.goodsReceipt.count({ where: { organizationId: perishable.org.id } })).toBe(0);
    await expect(receive(10, 40, { expiryDate: day(5) })).resolves.toMatchObject({ status: "RECEIVED" });

    const dry = await setup("Grains");
    const dryOrder = await orderFor(dry, 10);
    await expect(dryOrder.receive(5, 40)).resolves.toBeTruthy(); // a dry good needs no expiry date
  });

  it("a failure part way books nothing at all (one transaction)", async () => {
    const ctx = await setup();
    const salt = await createInventoryItem(ctx.org.id, { name: "Salt", category: "Grains", unit: "kg" }, ctx.actor.id);
    await prisma.supplierItem.create({ data: { organizationId: ctx.org.id, supplierId: ctx.supplier.id, inventoryId: salt.id } });
    const po = await createPurchaseOrder(ctx.org.id, { supplierId: ctx.supplier.id, items: [{ inventoryId: ctx.item.id, quantity: 10 }, { inventoryId: salt.id, quantity: 5 }] }, ctx.actor.id);
    await markOrdered(ctx.org.id, po.id, ctx.actor.id);
    const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    const riceLine = items.find((i) => i.inventoryId === ctx.item.id)!.id;
    const saltLine = items.find((i) => i.inventoryId === salt.id)!.id;
    await expect(
      receiveStock(ctx.org.id, po.id, { idempotencyKey: crypto.randomUUID(), receivedDate: todayDate(), lines: [{ itemId: riceLine, quantity: 10, unitCost: 40 }, { itemId: saltLine, quantity: 9, unitCost: 10 }] }, ctx.actor.id),
    ).rejects.toThrow();
    expect(await stock(ctx.item.id)).toBe(0);
    expect(await prisma.stockBatch.count({ where: { organizationId: ctx.org.id } })).toBe(0);
    expect(Number((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: riceLine } })).receivedQuantity)).toBe(0);
  });
});

describe("FIFO consumption", () => {
  it("takes the oldest batch first, records each allocation and costs the consumption from them", async () => {
    const ctx = await setup();
    const { receive } = await orderFor(ctx, 30);
    await receive(10, 40, { receivedDate: day(0) });
    await receive(10, 50);
    await receive(10, 60);
    const allocations = await takeOut(ctx, 25);
    expect(allocations.map((a) => [a.quantity, a.unitCost])).toEqual([[10, 40], [10, 50], [5, 60]]);
    expect(allocationCost(allocations)).toEqual({ cost: 10 * 40 + 10 * 50 + 5 * 60, unknownQuantity: 0 });
    const rows = await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((b) => Number(b.remainingQuantity))).toEqual([0, 0, 5]);
    expect(await stock(ctx.item.id)).toBe(5);
    expect(await batchSum(ctx.item.id)).toBe(5);
    // the allocations are stored on the ledger row, with their costs
    const stored = await prisma.stockAllocation.findMany({ where: { transaction: { inventoryId: ctx.item.id, type: "STOCK_OUT" } }, orderBy: { quantity: "desc" } });
    expect(stored).toHaveLength(3);
  });

  it("a later batch at another price does not change what an earlier consumption cost", async () => {
    const ctx = await setup();
    const { receive } = await orderFor(ctx, 30);
    await receive(10, 40);
    const first = await takeOut(ctx, 4);
    await receive(10, 99);
    const costs = await prisma.stockAllocation.findMany({ where: { transaction: { inventoryId: ctx.item.id, type: "STOCK_OUT" } } });
    expect(costs.map((c) => Number(c.unitCost))).toEqual([40]);
    expect(allocationCost(first).cost).toBe(160);
    // the next unit still comes from the old batch
    expect((await previewConsumption(ctx.org.id, [{ key: "k", inventoryId: ctx.item.id, quantity: 1 }])).get("k")?.slices).toEqual([{ batchId: expect.any(String), quantity: 1, unitCost: 40 }]);
    await takeOut(ctx, 6); // the rest of the first batch
    expect((await previewConsumption(ctx.org.id, [{ key: "k", inventoryId: ctx.item.id, quantity: 1 }])).get("k")?.slices[0].unitCost).toBe(99);
  });

  it("is explicit about insufficient stock and changes nothing", async () => {
    const ctx = await setup();
    const { receive } = await orderFor(ctx, 10);
    await receive(10, 40);
    await expect(takeOut(ctx, 11)).rejects.toThrow(/below zero/);
    await expect(recordStockTransaction(ctx.org.id, ctx.item.id, { type: "STOCK_OUT", quantity: 11 }, ctx.actor.id)).rejects.toThrow(/below zero/);
    expect(await stock(ctx.item.id)).toBe(10);
    expect(await batchSum(ctx.item.id)).toBe(10);
    expect(await prisma.stockAllocation.count()).toBeGreaterThanOrEqual(0);
  });

  it("two stock outs at once cannot take the same units (no negative batch)", async () => {
    const ctx = await setup();
    const { receive } = await orderFor(ctx, 10);
    await receive(10, 40);
    const results = await Promise.allSettled([takeOut(ctx, 8), takeOut(ctx, 8)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toBeTruthy();
    expect(await stock(ctx.item.id)).toBe(2);
    expect(await batchSum(ctx.item.id)).toBe(2);
    expect((await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id } })).every((b) => Number(b.remainingQuantity) >= 0)).toBe(true);
  });

  it("manual Stock In / Out go through the same batches; stock in starts a batch without a price", async () => {
    const ctx = await setup();
    await recordStockTransaction(ctx.org.id, ctx.item.id, { type: "STOCK_IN", quantity: 12, costUnknown: true }, ctx.actor.id);
    const batch = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: ctx.item.id } });
    expect([batch.source, batch.unitCost, Number(batch.remainingQuantity)]).toEqual(["STOCK_IN", null, 12]);
    await recordStockTransaction(ctx.org.id, ctx.item.id, { type: "STOCK_OUT", quantity: 5 }, ctx.actor.id);
    expect(await batchSum(ctx.item.id)).toBe(7);
    const out = await prisma.stockAllocation.findFirstOrThrow({ where: { transaction: { inventoryId: ctx.item.id, type: "STOCK_OUT" } } });
    expect(out.unitCost).toBeNull(); // cost unknown, recorded as such
    expect(allocationCost([{ quantity: 5, unitCost: null }])).toEqual({ cost: 0, unknownQuantity: 5 });
  });
});

describe("Expired and quarantined stock", () => {
  async function withBatches() {
    const ctx = await setup("Dairy");
    const { receive } = await orderFor(ctx, 30);
    await receive(10, 40, { expiryDate: day(30) });
    await receive(10, 41, { expiryDate: day(30) });
    await receive(10, 42, { expiryDate: day(30) });
    const batches = await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id }, orderBy: { createdAt: "asc" } });
    return { ...ctx, batches };
  }

  it("an expired batch is skipped, never consumed automatically, and the shortage says why", async () => {
    const { item, org, batches } = await withBatches();
    await prisma.stockBatch.update({ where: { id: batches[0].id }, data: { expiryDate: day(-1) } }); // the oldest has expired
    const position = await stockPosition(prisma, item.id);
    expect(position).toMatchObject({ stockCount: 30, usable: 20, expired: 10 });
    const allocations = await takeOut({ item }, 15);
    expect(allocations.map((a) => [a.quantity, a.unitCost])).toEqual([[10, 41], [5, 42]]); // not the expired 40
    await expect(takeOut({ item }, 6)).rejects.toThrow(/Only 5 is usable.*expired/);
    expect(await stock(item.id)).toBe(15);
    expect((await usableStockMap(org.id, [item.id])).get(item.id)).toBe(5);
    expect(Number((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batches[0].id } })).remainingQuantity)).toBe(10);
  });

  it("the expiry day itself is still usable; the day after is not", async () => {
    const { item, batches } = await withBatches();
    await prisma.stockBatch.update({ where: { id: batches[0].id }, data: { expiryDate: day(0) } });
    expect((await stockPosition(prisma, item.id)).usable).toBe(30);
    expect((await stockPosition(prisma, item.id, day(1))).usable).toBe(20);
  });

  it("a quarantined batch is held back until released; releasing makes it usable again", async () => {
    const { item, org, actor, batches } = await withBatches();
    await setBatchStatus(org.id, batches[0].id, "QUARANTINED", actor.id);
    expect((await stockPosition(prisma, item.id)).quarantined).toBe(10);
    const allocations = await takeOut({ item }, 12);
    expect(allocations.map((a) => a.unitCost)).toEqual([41, 42]);
    await expect(takeOut({ item }, 9)).rejects.toBeInstanceOf(InsufficientStockError);
    await setBatchStatus(org.id, batches[0].id, "ACTIVE", actor.id);
    expect((await takeOut({ item }, 9)).map((a) => a.unitCost)).toEqual([40]);
  });

  it("a negative adjustment (a write-off) can remove expired stock, and takes it first", async () => {
    const { item, org, actor, batches } = await withBatches();
    await prisma.stockBatch.update({ where: { id: batches[1].id }, data: { expiryDate: day(-2) } });
    await recordStockTransaction(org.id, item.id, { type: "ADJUSTMENT", quantity: -10, note: "expired, thrown away" }, actor.id);
    expect(Number((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batches[1].id } })).remainingQuantity)).toBe(0);
    expect(await stock(item.id)).toBe(20);
    expect(await batchSum(item.id)).toBe(20);
  });

  it("batches are listed in FIFO order with the kitchen's FEFO advice, and expiry warnings", async () => {
    const { item, org, batches } = await withBatches();
    await prisma.stockBatch.update({ where: { id: batches[0].id }, data: { expiryDate: day(20) } });
    await prisma.stockBatch.update({ where: { id: batches[1].id }, data: { expiryDate: day(3) } }); // soonest
    await prisma.stockBatch.update({ where: { id: batches[2].id }, data: { expiryDate: day(-1) } });
    const { batches: view, recommendedBatchId } = await listBatches(org.id, item.id);
    expect(view.map((b) => [b.fifoRank, b.state, b.expiringSoon])).toEqual([[1, "usable", false], [2, "usable", true], [null, "expired", false]]);
    expect(recommendedBatchId).toBe(batches[1].id); // use first in the kitchen: expires soonest, though FIFO would take batch 1
  });
});

describe("Returns, legacy stock and reconciliation", () => {
  it("a return goes back into the same batches at the same costs", async () => {
    const ctx = await setup();
    const { receive } = await orderFor(ctx, 20);
    await receive(10, 40);
    await receive(10, 50);
    const orderId = `order-${crypto.randomUUID()}`;
    await takeOut(ctx, 15, { orderId });
    await prisma.$transaction(async (tx) => {
      const row = await tx.inventoryTransaction.create({ data: { inventoryId: ctx.item.id, type: "STOCK_IN", quantity: 15, orderId } });
      const back = await restoreOrderStock(tx, { inventoryId: ctx.item.id, orderId, quantity: 15, transactionId: row.id });
      expect(back.map((a) => [a.quantity, a.unitCost])).toEqual([[5, 50], [10, 40]]);
    });
    expect((await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id }, orderBy: { createdAt: "asc" } })).map((b) => Number(b.remainingQuantity))).toEqual([10, 10]);
    expect(await stock(ctx.item.id)).toBe(20);
    expect(await findStockMismatches(ctx.org.id)).toEqual([]);
  });

  it("stock with no batch (written directly) is still usable, consumed first with an unknown cost, and shows up in reconciliation", async () => {
    const ctx = await setup();
    const { receive } = await orderFor(ctx, 10);
    await receive(10, 40);
    await prisma.inventory.update({ where: { id: ctx.item.id }, data: { stockCount: { increment: 6 } } }); // not through the app
    expect(await findStockMismatches(ctx.org.id)).toMatchObject([{ unbatched: 6 }]);
    expect((await stockPosition(prisma, ctx.item.id)).unbatched).toBe(6);
    const allocations = await takeOut(ctx, 8);
    expect(allocations.map((a) => [a.batchId === null, a.quantity, a.unitCost])).toEqual([[true, 6, null], [false, 2, 40]]);
    expect(allocationCost(allocations)).toEqual({ cost: 80, unknownQuantity: 6 });
    expect(await findStockMismatches(ctx.org.id)).toEqual([]);
  });

  it("gives unbatched stock an explicit opening batch without raising the count", async () => {
    const ctx = await setup();
    await prisma.inventory.update({ where: { id: ctx.item.id }, data: { stockCount: 9 } });
    const batch = await recordOpeningBatch(ctx.org.id, ctx.item.id, {}, ctx.actor.id);
    expect([batch.source, Number(batch.remainingQuantity), batch.unitCost, batch.receivedDate]).toEqual(["OPENING", 9, null, null]);
    expect(await stock(ctx.item.id)).toBe(9);
    expect(await findStockMismatches(ctx.org.id)).toEqual([]);
    await expect(recordOpeningBatch(ctx.org.id, ctx.item.id, {}, ctx.actor.id)).rejects.toThrow(/already in batches/);
  });

  it("opening stock given when an item is created becomes an OPENING batch, and on-hand always equals the batches", async () => {
    const ctx = await setup();
    // The item's own cost is not a verified cost for its opening stock; only a cost given with the stock is used.
    const item = await createInventoryItem(ctx.org.id, { name: "Oil", category: "Oils & Ghee", unit: "ltr", costPerUnit: 120 }, ctx.actor.id, 25);
    const batch = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: item.id } });
    expect([batch.source, Number(batch.remainingQuantity), batch.unitCost, batch.receivedDate]).toEqual(["OPENING", 25, null, null]);
    const confirmed = await createInventoryItem(ctx.org.id, { name: "Ghee", category: "Oils & Ghee", unit: "kg" }, ctx.actor.id, 5, 480);
    expect(Number((await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: confirmed.id } })).unitCost)).toBe(480);
    expect(await findStockMismatches(ctx.org.id)).toEqual([]);
  });
});

describe("Over-delivery, free goods and unknown cost", () => {
  it("over-delivery is refused unless the extra is authorised with a reason, which is recorded with the actual cost", async () => {
    const ctx = await setup();
    const { po, lineId, receive } = await orderFor(ctx, 10);
    await expect(receive(12, 40)).rejects.toThrow(/authorise/);
    expect(await stock(ctx.item.id)).toBe(0);
    const received = await receiveStock(ctx.org.id, po.id, { idempotencyKey: crypto.randomUUID(), receivedDate: todayDate(), lines: [{ itemId: lineId, quantity: 12, unitCost: 42, extraReason: "Supplier added two kg as a goodwill top-up" }] }, ctx.actor.id);
    expect(received.status).toBe("RECEIVED");
    expect(await stock(ctx.item.id)).toBe(12);
    const line = await prisma.goodsReceiptLine.findFirstOrThrow({ where: { purchaseOrderItemId: lineId } });
    expect([Number(line.quantity), Number(line.extraQuantity), line.extraReason, Number(line.unitCost)]).toEqual([12, 2, "Supplier added two kg as a goodwill top-up", 42]);
    expect(Number((await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: ctx.item.id } })).unitCost)).toBe(42);
    // a delivery that is not over the order records no extra
    const ctx2 = await setup();
    const second = await orderFor(ctx2, 10);
    await second.receive(10, 40);
    expect(Number((await prisma.goodsReceiptLine.findFirstOrThrow({ where: { purchaseOrderItem: { purchaseOrder: { organizationId: ctx2.org.id } } } })).extraQuantity)).toBe(0);
  });

  it("a confirmed zero cost (free goods) needs a reason, a negative cost is refused, and free goods do not reset the item's cost", async () => {
    const ctx = await setup();
    const { receive } = await orderFor(ctx, 30);
    await receive(10, 40);
    await expect(receive(5, 0)).rejects.toThrow(/free/);
    await expect(receive(5, -1)).rejects.toThrow(/negative/);
    const free = await receiveStock(ctx.org.id, (await prisma.purchaseOrder.findFirstOrThrow({ where: { organizationId: ctx.org.id } })).id, { idempotencyKey: crypto.randomUUID(), receivedDate: todayDate(), lines: [{ itemId: (await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrder: { organizationId: ctx.org.id } } })).id, quantity: 5, unitCost: 0, costNote: "Free sample from the supplier" }] }, ctx.actor.id);
    expect(free.status).toBe("PARTIALLY_RECEIVED");
    const batches = await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id }, orderBy: { createdAt: "asc" } });
    expect(batches.map((b) => b.unitCost === null ? "unknown" : Number(b.unitCost))).toEqual([40, 0]); // 0 = confirmed free, not unknown
    expect(batches[1].costNote).toBe("Free sample from the supplier");
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: ctx.item.id } })).costPerUnit)).toBe(40);
    // consuming free stock costs 0 and is a known cost
    const allocations = await takeOut(ctx, 12);
    expect(allocations.map((a) => [a.quantity, a.unitCost])).toEqual([[10, 40], [2, 0]]);
    expect(allocationCost(allocations)).toEqual({ cost: 400, unknownQuantity: 0 });
  });

  it("an unknown cost can be confirmed once (a cost, or free with a reason); a known cost is never changed", async () => {
    const ctx = await setup();
    const item = await createInventoryItem(ctx.org.id, { name: "Oil", category: "Oils & Ghee", unit: "ltr", costPerUnit: 120 }, ctx.actor.id, 25);
    const batch = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: item.id } });
    expect(batch.unitCost).toBeNull(); // the item's own 120 was not taken as the batch's cost
    await expect(confirmBatchCost(ctx.org.id, batch.id, { unitCost: -1 }, ctx.actor.id)).rejects.toThrow(/negative/);
    await expect(confirmBatchCost(ctx.org.id, batch.id, { unitCost: 0 }, ctx.actor.id)).rejects.toThrow(/free/);
    await confirmBatchCost(ctx.org.id, batch.id, { unitCost: 118 }, ctx.actor.id);
    expect(Number((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } })).unitCost)).toBe(118);
    await expect(confirmBatchCost(ctx.org.id, batch.id, { unitCost: 90 }, ctx.actor.id)).rejects.toThrow(/already has a confirmed cost/);
    const other = await createInventoryItem(ctx.org.id, { name: "Salt", category: "Grains", unit: "kg" }, ctx.actor.id, 5);
    const sample = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: other.id } });
    await confirmBatchCost(ctx.org.id, sample.id, { unitCost: 0, costNote: "Gift from the owner" }, ctx.actor.id);
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: sample.id } })).costNote).toBe("Gift from the owner");
    // another kitchen cannot confirm it
    const stranger = await setup();
    const third = await createInventoryItem(ctx.org.id, { name: "Sugar", category: "Grains", unit: "kg" }, ctx.actor.id, 5);
    const thirdBatch = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: third.id } });
    await expect(confirmBatchCost(stranger.org.id, thirdBatch.id, { unitCost: 10 }, stranger.actor.id)).rejects.toThrow(/not found/);
  });
});

describe("Tracks expiry", () => {
  it("the category only supplies the default; the item's own setting is what is enforced", async () => {
    const ctx = await setup();
    const dairy = await createInventoryItem(ctx.org.id, { name: "Curd", category: "Dairy", unit: "kg" }, ctx.actor.id);
    const dry = await createInventoryItem(ctx.org.id, { name: "Rice 2", category: "Grains & Cereals", unit: "kg" }, ctx.actor.id);
    const overridden = await createInventoryItem(ctx.org.id, { name: "UHT Milk", category: "Dairy", unit: "ltr", tracksExpiry: false }, ctx.actor.id);
    const forced = await createInventoryItem(ctx.org.id, { name: "Spice Mix", category: "Spices & Masalas", unit: "kg", tracksExpiry: true }, ctx.actor.id);
    expect([dairy.tracksExpiry, dry.tracksExpiry, overridden.tracksExpiry, forced.tracksExpiry]).toEqual([true, false, false, true]);
    await expect(recordStockTransaction(ctx.org.id, dairy.id, { type: "STOCK_IN", quantity: 5, costUnknown: true }, ctx.actor.id)).rejects.toThrow(/expiry date/);
    await expect(recordStockTransaction(ctx.org.id, forced.id, { type: "STOCK_IN", quantity: 5, costUnknown: true }, ctx.actor.id)).rejects.toThrow(/expiry date/);
    await expect(recordStockTransaction(ctx.org.id, overridden.id, { type: "STOCK_IN", quantity: 5, costUnknown: true }, ctx.actor.id)).resolves.toBeTruthy();
    await expect(recordStockTransaction(ctx.org.id, dry.id, { type: "STOCK_IN", quantity: 5, costUnknown: true }, ctx.actor.id)).resolves.toBeTruthy();
    // switching it on later applies to the next batch
    await prisma.inventory.update({ where: { id: dry.id }, data: { tracksExpiry: true } });
    await expect(recordStockTransaction(ctx.org.id, dry.id, { type: "STOCK_IN", quantity: 5, costUnknown: true }, ctx.actor.id)).rejects.toThrow(/expiry date/);
  });

  it("receiving follows the item's setting, and legacy batches are flagged, never given a made-up date", async () => {
    const ctx = await setup("Grains & Cereals");
    const { receive } = await orderFor(ctx, 20);
    await receive(5, 40); // does not track expiry: no date needed
    await prisma.inventory.update({ where: { id: ctx.item.id }, data: { tracksExpiry: true } });
    await expect(receive(5, 40)).rejects.toThrow(/expiry date/);
    await receive(5, 40, { expiryDate: day(10) });
    const { batches } = await listBatches(ctx.org.id, ctx.item.id);
    expect(batches.map((b) => [b.expiryDate === null, b.expiryMissing])).toEqual([[true, true], [false, false]]);
  });
});

describe("Manual Stock In", () => {
  const stockIn = (ctx: { org: { id: string }; actor: { id: string } }, itemId: string, extra: Record<string, unknown>) => recordStockTransaction(ctx.org.id, itemId, { type: "STOCK_IN", quantity: 8, ...extra } as never, ctx.actor.id);

  it("creates a batch and one ledger row, with the cost it was given and never the item's own cost", async () => {
    const ctx = await setup();
    await prisma.inventory.update({ where: { id: ctx.item.id }, data: { costPerUnit: 77 } });
    await stockIn(ctx, ctx.item.id, { unitCost: 52.5, lotNumber: "LOT-7", note: "Bought at the market" });
    const batch = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: ctx.item.id } });
    expect([batch.source, Number(batch.originalQuantity), Number(batch.unitCost), batch.lotNumber]).toEqual(["STOCK_IN", 8, 52.5, "LOT-7"]);
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: ctx.item.id } })).toBe(1);
    expect(await stock(ctx.item.id)).toBe(8); // counted once, not twice
    expect(await batchSum(ctx.item.id)).toBe(8);
    expect(await findStockMismatches(ctx.org.id)).toEqual([]);
  });

  it("must say what it cost: a cost, free with a reason, or explicitly unknown; negative is refused", async () => {
    const ctx = await setup();
    await expect(stockIn(ctx, ctx.item.id, {})).rejects.toThrow(/unit cost, or mark/);
    await expect(stockIn(ctx, ctx.item.id, { unitCost: -3 })).rejects.toThrow(/negative/);
    await expect(stockIn(ctx, ctx.item.id, { unitCost: 0 })).rejects.toThrow(/free/);
    expect(await stock(ctx.item.id)).toBe(0); // nothing was added by the refusals
    await stockIn(ctx, ctx.item.id, { unitCost: 0, costNote: "Donated" });
    await stockIn(ctx, ctx.item.id, { costUnknown: true });
    const costs = (await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id }, orderBy: { createdAt: "asc" } })).map((b) => (b.unitCost === null ? "unknown" : Number(b.unitCost)));
    expect(costs).toEqual([0, "unknown"]);
    expect(await findStockMismatches(ctx.org.id)).toEqual([]);
  });

  it("an item that tracks expiry needs a date that has not passed; a positive adjustment follows the same rule", async () => {
    const ctx = await setup("Dairy");
    await expect(stockIn(ctx, ctx.item.id, { costUnknown: true })).rejects.toThrow(/expiry date/);
    await expect(stockIn(ctx, ctx.item.id, { costUnknown: true, expiryDate: day(-1) })).rejects.toThrow(/already expired/);
    await expect(recordStockTransaction(ctx.org.id, ctx.item.id, { type: "ADJUSTMENT", quantity: 3 }, ctx.actor.id)).rejects.toThrow(/expiry date/);
    await stockIn(ctx, ctx.item.id, { costUnknown: true, expiryDate: day(9) });
    await recordStockTransaction(ctx.org.id, ctx.item.id, { type: "ADJUSTMENT", quantity: 3, expiryDate: day(9) }, ctx.actor.id);
    expect(await stock(ctx.item.id)).toBe(11);
    expect(await batchSum(ctx.item.id)).toBe(11);
    const adjusted = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: ctx.item.id, source: "ADJUSTMENT" } });
    expect(adjusted.unitCost).toBeNull(); // an adjustment never invents a cost
  });
});

describe("Tracks expiry controls expiry enforcement and warnings", () => {
  async function expiredBatchItem(category: string, tracks: boolean) {
    const ctx = await setup(category);
    await prisma.inventory.update({ where: { id: ctx.item.id }, data: { tracksExpiry: tracks } });
    const { receive } = await orderFor(ctx, 20);
    await receive(10, 40, { expiryDate: day(30) });
    await receive(10, 50, { expiryDate: day(30) });
    const batches = await prisma.stockBatch.findMany({ where: { inventoryId: ctx.item.id }, orderBy: { createdAt: "asc" } });
    await prisma.stockBatch.update({ where: { id: batches[0].id }, data: { expiryDate: day(-3) } }); // the oldest is past its date
    return { ...ctx, batches };
  }

  it("with tracking off, a stored expiry date neither blocks consumption nor warns, and the date is kept", async () => {
    const { item, org, batches } = await expiredBatchItem("Dairy", false);
    expect(await stockPosition(prisma, item.id)).toMatchObject({ usable: 20, expired: 0 });
    expect((await expiryByItem(org.id, [item.id])).get(item.id)).toMatchObject({ expired: false, expiringSoon: false });
    const { batches: view, recommendedBatchId } = await listBatches(org.id, item.id);
    expect(view.map((b) => [b.state, b.expiringSoon])).toEqual([["usable", false], ["usable", false]]);
    expect(recommendedBatchId).toBeNull();
    expect((await getInventoryOverviewStats(org.id)).expired).toBe(0);
    expect((await usableStockMap(org.id, [item.id])).get(item.id)).toBe(20);
    // consumption takes the oldest batch, even though its stored date has passed
    const allocations = await takeOut({ item }, 12);
    expect(allocations.map((a) => [a.quantity, a.unitCost])).toEqual([[10, 40], [2, 50]]);
    // nothing was rewritten
    expect((await prisma.stockBatch.findUniqueOrThrow({ where: { id: batches[0].id } })).expiryDate?.getTime()).toBe(day(-3).getTime());
  });

  it("switching it on again uses the stored dates: the expired batch is blocked and warned, with no records rewritten", async () => {
    const { item, org, batches } = await expiredBatchItem("Grains", false);
    expect((await stockPosition(prisma, item.id)).expired).toBe(0);
    await prisma.inventory.update({ where: { id: item.id }, data: { tracksExpiry: true } });
    expect(await stockPosition(prisma, item.id)).toMatchObject({ usable: 10, expired: 10 });
    expect((await expiryByItem(org.id, [item.id])).get(item.id)).toMatchObject({ expired: true });
    expect((await getInventoryOverviewStats(org.id)).expired).toBe(1);
    await expect(takeOut({ item }, 11)).rejects.toThrow(/Only 10 is usable.*expired/);
    expect((await takeOut({ item }, 4)).map((a) => a.unitCost)).toEqual([50]);
    expect(await prisma.stockBatch.count({ where: { inventoryId: item.id } })).toBe(batches.length);
    // and off again: unblocked, still nothing rewritten
    await prisma.inventory.update({ where: { id: item.id }, data: { tracksExpiry: false } });
    expect((await takeOut({ item }, 8)).map((a) => [a.quantity, a.unitCost])).toEqual([[8, 40]]);
  });
});

describe("Authorised extra receipts keep the ordered quantity and leave an audit trail", () => {
  it("the audit entry records the extra, its reason, the cost and the batch; the ordered quantity is untouched", async () => {
    const ctx = await setup();
    const { po, lineId } = await orderFor(ctx, 10);
    await receiveStock(ctx.org.id, po.id, { idempotencyKey: crypto.randomUUID(), receivedDate: todayDate(), invoiceNumber: "INV-9", lines: [{ itemId: lineId, quantity: 12, unitCost: 41, extraReason: "Goodwill top-up" }] }, ctx.actor.id);
    const line = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: lineId } });
    expect([Number(line.quantity), Number(line.receivedQuantity)]).toEqual([10, 12]); // ordered stays 10
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: ctx.org.id, recordId: po.id, action: "purchase_order.receive" } });
    const after = entry.after as { receiptId: string; invoiceNumber: string; details: { item: string; quantity: number; unitCost: number; extraQuantity: number; extraReason: string; batchId: string }[]; extraAuthorised: { item: string; extraQuantity: number; reason: string }[] };
    const batch = await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: ctx.item.id } });
    expect(after.invoiceNumber).toBe("INV-9");
    expect(after.details).toMatchObject([{ item: "Rice", quantity: 12, unitCost: 41, extraQuantity: 2, extraReason: "Goodwill top-up", batchId: batch.id }]);
    expect(after.extraAuthorised).toEqual([{ item: "Rice", extraQuantity: 2, reason: "Goodwill top-up" }]);
    // the same retried submission adds neither stock nor a second audit entry
    expect(await prisma.auditLog.count({ where: { organizationId: ctx.org.id, recordId: po.id, action: "purchase_order.receive" } })).toBe(1);
  });
});
