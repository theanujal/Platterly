import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInventoryItem, recordStockTransaction } from "@/modules/inventory/inventory";
import { consumeStock, findStockMismatches, previewConsumption, restoreOrderStock, stockPosition, todayDate } from "@/modules/inventory/batches";
import { valueStock } from "@/modules/inventory/valuation";
import { loadInventoryReport } from "@/modules/reports/more-reports";
import { createSupplier } from "@/modules/suppliers/supplier";
import { createPurchaseOrder, markOrdered, receiveStock } from "@/modules/purchasing/purchase-order";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Audit Org", slug: `a-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const item = await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg" }, actor.id);
  return { org, actor, item };
}

describe("Precision of stored quantities and costs", () => {
  it("a cost that would be rounded to a different value (or to 0) is refused, not stored silently", async () => {
    const { org, actor, item } = await setup();
    await expect(recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 5, unitCost: 0.004 }, actor.id)).rejects.toThrow(/2 decimal/);
    await expect(recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 5, unitCost: 12.345 }, actor.id)).rejects.toThrow(/2 decimal/);
    expect(await prisma.stockBatch.count({ where: { inventoryId: item.id } })).toBe(0);
  });

  it("a quantity finer than 3 decimals is refused, so the count, the batch and the ledger cannot drift", async () => {
    const { org, actor, item } = await setup();
    await expect(recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 0.0004, unitCost: 10 }, actor.id)).rejects.toThrow(/3 decimal/);
    await expect(recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 1.2345, unitCost: 10 }, actor.id)).rejects.toThrow(/3 decimal/);
    expect(await findStockMismatches(org.id)).toEqual([]);
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: item.id } })).toBe(0);
    await recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 1.234, unitCost: 12.34, receivedDate: todayDate() } as never, actor.id);
  });
});

describe("Stock reconciliation across batches, count, ledger and allocations", () => {
  it("holds after receipts, stock in, adjustments, consumption, a return and a write-off", async () => {
    const { org, actor, item } = await setup();
    const supplier = await createSupplier(org.id, { name: "S" }, actor.id);
    await prisma.supplierItem.create({ data: { organizationId: org.id, supplierId: supplier.id, inventoryId: item.id } });
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: item.id, quantity: 30 }] }, actor.id);
    await markOrdered(org.id, po.id, actor.id);
    const lineId = (await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).id;
    const receive = (quantity: number, unitCost: number) =>
      receiveStock(org.id, po.id, { idempotencyKey: crypto.randomUUID(), receivedDate: todayDate(), lines: [{ itemId: lineId, quantity, unitCost }] }, actor.id);
    await receive(10, 40);
    await receive(20, 50);
    await recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 5, unitCost: 60 }, actor.id);
    await recordStockTransaction(org.id, item.id, { type: "ADJUSTMENT", quantity: 2 }, actor.id);

    // Preview first: it plans across batches and changes nothing.
    const before = await prisma.stockBatch.findMany({ where: { inventoryId: item.id }, orderBy: { id: "asc" } });
    const plan = (await previewConsumption(org.id, [{ key: "r", inventoryId: item.id, quantity: 25 }])).get("r")!;
    expect(plan.slices.map((x) => [x.quantity, x.unitCost])).toEqual([[10, 40], [15, 50]]);
    expect(await prisma.stockBatch.findMany({ where: { inventoryId: item.id }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await prisma.stockAllocation.count({ where: { batch: { inventoryId: item.id }, transaction: { type: "STOCK_OUT" } } })).toBe(0);

    // Consume 25 (FIFO across two batches), then a negative adjustment.
    const out = await prisma.$transaction(async (tx) => {
      const row = await tx.inventoryTransaction.create({ data: { inventoryId: item.id, type: "STOCK_OUT", quantity: 25 } });
      return consumeStock(tx, { inventoryId: item.id, quantity: 25, transactionId: row.id });
    });
    expect(out.map((a) => [a.quantity, a.unitCost])).toEqual([[10, 40], [15, 50]]);
    await recordStockTransaction(org.id, item.id, { type: "ADJUSTMENT", quantity: -3 }, actor.id);

    const count = Number((await prisma.inventory.findUniqueOrThrow({ where: { id: item.id } })).stockCount);
    const batches = await prisma.stockBatch.findMany({ where: { inventoryId: item.id } });
    const ledger = (await prisma.inventoryTransaction.findMany({ where: { inventoryId: item.id } })).reduce((n, t) => n + (t.type === "STOCK_OUT" ? -1 : 1) * Number(t.quantity), 0);
    expect(count).toBe(9); // 10 + 20 + 5 + 2 received, 25 consumed, 3 written off
    expect(batches.reduce((n, b) => n + Number(b.remainingQuantity), 0)).toBe(count);
    expect(ledger).toBe(count);
    expect(await findStockMismatches(org.id)).toEqual([]);
    // Every batch: remaining = original - what was taken from it, and every ledger row is fully allocated.
    for (const b of batches) {
      const taken = (await prisma.stockAllocation.findMany({ where: { batchId: b.id, transaction: { OR: [{ type: "STOCK_OUT" }, { type: "ADJUSTMENT", quantity: { lt: 0 } }] } } })).reduce((n, a) => n + Number(a.quantity), 0);
      expect(Number(b.remainingQuantity)).toBe(Number(b.originalQuantity) - taken);
    }
    for (const t of await prisma.inventoryTransaction.findMany({ where: { inventoryId: item.id }, include: { allocations: true } })) {
      expect(t.allocations.reduce((n, a) => n + Number(a.quantity), 0)).toBe(Math.abs(Number(t.quantity)));
    }
  });
});

describe("A legacy return (stock sent before batches existed) stays visible as unknown-cost stock", () => {
  it("goes back unbatched: shown in reconciliation, position, valuation and the Inventory report; nothing is invented", async () => {
    const { org, item } = await setup();
    // Before batches: 10 kg on hand, 4 kg sent to an order with a plain ledger row and no allocation.
    await prisma.inventory.update({ where: { id: item.id }, data: { stockCount: 6 } });
    const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "C", phone: "+919800000001" } });
    const order = await prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() } as never });
    await prisma.inventoryTransaction.create({ data: { inventoryId: item.id, type: "STOCK_OUT", quantity: 4, orderId: order.id } });

    // The order is cancelled after the upgrade: the 4 kg comes back, but no batch can be traced.
    const allocations = await prisma.$transaction(async (tx) => {
      const row = await tx.inventoryTransaction.create({ data: { inventoryId: item.id, type: "STOCK_IN", quantity: 4, orderId: order.id } });
      return restoreOrderStock(tx, { inventoryId: item.id, orderId: order.id, quantity: 4, transactionId: row.id });
    });
    expect(allocations).toEqual([{ batchId: null, quantity: 4, unitCost: null }]);
    expect(await prisma.stockBatch.count({ where: { inventoryId: item.id } })).toBe(0); // no batch fabricated

    // Reconciliation reports all 10 kg as stock with no batch (positive = legacy, not a defect)
    expect(await findStockMismatches(org.id)).toEqual([{ inventoryId: item.id, name: "Rice", stockCount: 10, batched: 0, unbatched: 10 }]);
    expect(await stockPosition(prisma, item.id)).toMatchObject({ stockCount: 10, unbatched: 10, usable: 10 });
    // Valuation and the Inventory report count it as unknown-cost, never as a guessed amount
    const valuation = await valueStock(org.id);
    expect(valuation).toMatchObject({ totalValue: 0, incomplete: true, itemsWithUnknownCost: 1 });
    expect(valuation.items.get(item.id)).toMatchObject({ knownValue: 0, unknownQuantity: 10 });
    const report = await loadInventoryReport({ organizationId: org.id }, { from: null, to: null });
    expect(report.stock).toMatchObject({ totalValue: 0, incomplete: true, itemsWithUnknownCost: 1 });
    // The return itself is in the ledger with one unknown-cost allocation
    const returned = await prisma.stockAllocation.findMany({ where: { transaction: { orderId: order.id, type: "STOCK_IN" } } });
    expect(returned.map((a) => [a.batchId, Number(a.quantity), a.unitCost])).toEqual([[null, 4, null]]);
  });
});
