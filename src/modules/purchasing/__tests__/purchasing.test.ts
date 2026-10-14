import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createSupplier, deleteSupplier, SupplierInUseError } from "@/modules/suppliers/supplier";
import { createInventoryItem } from "@/modules/inventory/inventory";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  markOrdered,
  receiveStock,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  listPurchaseOrders,
  listReceipts,
  suggestReorder,
  PurchaseOrderError,
} from "@/modules/purchasing/purchase-order";
import { recordSupplierPayment, getSupplierBalance, deleteSupplierPayment, SupplierPaymentError } from "@/modules/purchasing/supplier-payment";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplierPayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "PO Org", slug: `po-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const supplier = await createSupplier(org.id, { name: "Grain Co" }, actor.id);
  const rice = await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg", lowStockThreshold: 20 }, actor.id);
  const dal = await createInventoryItem(org.id, { name: "Dal", category: "Grains", unit: "kg" }, actor.id);
  // Orders can only list items the supplier provides (Products Supplied).
  await prisma.supplierItem.createMany({ data: [rice, dal].map((i) => ({ organizationId: org.id, supplierId: supplier.id, inventoryId: i.id })) });
  return { org, actor, supplier, rice, dal };
}

describe("Purchase orders (Chunk 18.3)", () => {
  it("numbers orders per kitchen and starts them as a draft", async () => {
    const { org, actor, supplier, rice } = await setup();
    const a = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 50, unitCost: 40 }] }, actor.id);
    const b = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 5, unitCost: 40 }] }, actor.id);
    expect([a.number, b.number]).toEqual(["PO-0001", "PO-0002"]);
    expect(a.status).toBe("DRAFT");
  });

  it("rejects empty, duplicate, zero and cross-kitchen lines", async () => {
    const a = await setup();
    const b = await setup();
    const mk = (items: { inventoryId: string; quantity: number; unitCost: number }[], supplierId = a.supplier.id) => createPurchaseOrder(a.org.id, { supplierId, items }, a.actor.id);
    await expect(mk([])).rejects.toBeInstanceOf(PurchaseOrderError);
    await expect(mk([{ inventoryId: a.rice.id, quantity: 1, unitCost: 1 }, { inventoryId: a.rice.id, quantity: 2, unitCost: 1 }])).rejects.toThrow();
    await expect(mk([{ inventoryId: a.rice.id, quantity: 0, unitCost: 1 }])).rejects.toThrow();
    await expect(mk([{ inventoryId: b.rice.id, quantity: 1, unitCost: 1 }])).rejects.toThrow();
    await expect(mk([{ inventoryId: a.rice.id, quantity: 1, unitCost: 1 }], b.supplier.id)).rejects.toThrow();
  });

  it("only a draft can be edited; ordering locks it", async () => {
    const { org, actor, supplier, rice, dal } = await setup();
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 10, unitCost: 40 }] }, actor.id);
    const edited = await updatePurchaseOrder(org.id, po.id, { supplierId: supplier.id, items: [{ inventoryId: dal.id, quantity: 4, unitCost: 90 }] }, actor.id);
    expect(edited.items.map((i) => i.inventoryId)).toEqual([dal.id]);
    await markOrdered(org.id, po.id, actor.id);
    await expect(updatePurchaseOrder(org.id, po.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 1, unitCost: 1 }] }, actor.id)).rejects.toThrow();
    await expect(markOrdered(org.id, po.id, actor.id)).rejects.toBeInstanceOf(PurchaseOrderError);
  });

  it("receiving books real stock-in rows, supports partial receipts, and refuses more than is outstanding", async () => {
    const { org, actor, supplier, rice } = await setup();
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 50, unitCost: 40 }] }, actor.id);
    await expect(receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 1 }], actor.id)).rejects.toThrow(); // still a draft
    await markOrdered(org.id, po.id, actor.id);
    await expect(receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 51 }], actor.id)).rejects.toThrow();

    const first = await receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 30 }], actor.id);
    expect(first.status).toBe("PARTIALLY_RECEIVED");
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: rice.id } })).stockCount)).toBe(30);
    const second = await receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 20 }], actor.id);
    expect(second.status).toBe("RECEIVED");
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: rice.id } })).stockCount)).toBe(50);
    const ledger = await prisma.inventoryTransaction.findMany({ where: { inventoryId: rice.id }, orderBy: { createdAt: "asc" } });
    expect(ledger.map((l) => [l.type, Number(l.quantity), l.note])).toEqual([["STOCK_IN", 30, "Received on PO-0001"], ["STOCK_IN", 20, "Received on PO-0001"]]);
    await expect(receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 1 }], actor.id)).rejects.toThrow();
  });

  it("cancel works before anything arrives, not after; delete only for draft or cancelled", async () => {
    const { org, actor, supplier, rice } = await setup();
    const items = [{ inventoryId: rice.id, quantity: 10, unitCost: 40 }];
    const a = await createPurchaseOrder(org.id, { supplierId: supplier.id, items }, actor.id);
    await markOrdered(org.id, a.id, actor.id);
    await expect(deletePurchaseOrder(org.id, a.id, actor.id)).rejects.toThrow();
    await cancelPurchaseOrder(org.id, a.id, actor.id);
    await deletePurchaseOrder(org.id, a.id, actor.id);

    const b = await createPurchaseOrder(org.id, { supplierId: supplier.id, items }, actor.id);
    await markOrdered(org.id, b.id, actor.id);
    await receiveStock(org.id, b.id, [{ itemId: b.items[0].id, quantity: 3 }], actor.id);
    await expect(cancelPurchaseOrder(org.id, b.id, actor.id)).rejects.toThrow();
  });

  it("two receipts at once cannot take more than ordered", async () => {
    const { org, actor, supplier, rice } = await setup();
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 10, unitCost: 40 }] }, actor.id);
    await markOrdered(org.id, po.id, actor.id);
    const results = await Promise.allSettled([
      receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 10 }], actor.id),
      receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 10 }], actor.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: rice.id } })).stockCount)).toBe(10);
  });

  it("supplier balance = value received minus payments; cancelled orders do not count; the supplier cannot be deleted", async () => {
    const { org, actor, supplier, rice } = await setup();
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 50, unitCost: 40 }] }, actor.id);
    await markOrdered(org.id, po.id, actor.id);
    await receiveStock(org.id, po.id, [{ itemId: po.items[0].id, quantity: 25 }], actor.id);
    expect(await getSupplierBalance(org.id, supplier.id)).toEqual({ received: 1000, paid: 0, outstanding: 1000 });
    const pay = await recordSupplierPayment(org.id, supplier.id, { amount: 400, paidAt: new Date() }, actor.id);
    expect((await getSupplierBalance(org.id, supplier.id)).outstanding).toBe(600);
    await expect(recordSupplierPayment(org.id, supplier.id, { amount: 0, paidAt: new Date() }, actor.id)).rejects.toBeInstanceOf(SupplierPaymentError);
    await expect(deleteSupplier(org.id, supplier.id, actor.id)).rejects.toBeInstanceOf(SupplierInUseError);
    await deleteSupplierPayment(org.id, pay.id, actor.id);
    expect((await getSupplierBalance(org.id, supplier.id)).outstanding).toBe(1000);
  });

  it("another kitchen cannot pay or read this supplier's orders; low-stock suggestions list items at or below the alert", async () => {
    const a = await setup();
    const b = await setup();
    await expect(recordSupplierPayment(b.org.id, a.supplier.id, { amount: 10, paidAt: new Date() }, b.actor.id)).rejects.toThrow();
    await createPurchaseOrder(a.org.id, { supplierId: a.supplier.id, items: [{ inventoryId: a.rice.id, quantity: 1, unitCost: 1 }] }, a.actor.id);
    expect(await listPurchaseOrders(b.org.id)).toHaveLength(0);
    expect((await suggestReorder(a.org.id)).map((s) => s.name)).toEqual(["Rice"]);
  });
});

describe("Purchase orders raised without prices (Purchasing workflow)", () => {
  it("a draft changes no stock and makes no stock movement; its lines are unpriced", async () => {
    const { org, actor, supplier, rice } = await setup();
    const before = await prisma.inventory.findUniqueOrThrow({ where: { id: rice.id } });
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 12 }] }, actor.id);
    expect(Number(po.items[0].unitCost)).toBe(0);
    const after = await prisma.inventory.findUniqueOrThrow({ where: { id: rice.id } });
    expect(Number(after.stockCount)).toBe(Number(before.stockCount));
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: rice.id } })).toBe(0);
    // ordering it does not add stock either
    await markOrdered(org.id, po.id, actor.id);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: rice.id } })).stockCount)).toBe(Number(before.stockCount));
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: rice.id } })).toBe(0);
  });

  it("only items the supplier provides can be ordered, and an inactive supplier is refused", async () => {
    const { org, actor, supplier, rice } = await setup();
    const salt = await createInventoryItem(org.id, { name: "Salt", category: "Spices", unit: "kg" }, actor.id); // not mapped
    await expect(createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: salt.id, quantity: 1 }] }, actor.id)).rejects.toThrow(/provides/);
    await expect(createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 1 }, { inventoryId: salt.id, quantity: 1 }] }, actor.id)).rejects.toThrow(/provides/);
    await prisma.supplier.update({ where: { id: supplier.id }, data: { isActive: false } });
    await expect(createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 1 }] }, actor.id)).rejects.toThrow(/inactive/);
    expect(await prisma.purchaseOrder.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("a draft keeps the lines it had when edited, even if the mapping was removed since", async () => {
    const { org, actor, supplier, rice, dal } = await setup();
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 5, unitCost: 40 }] }, actor.id);
    await prisma.supplierItem.deleteMany({ where: { supplierId: supplier.id, inventoryId: rice.id } });
    const edited = await updatePurchaseOrder(org.id, po.id, { supplierId: supplier.id, notes: "n", items: [{ inventoryId: rice.id, quantity: 8 }, { inventoryId: dal.id, quantity: 2 }] }, actor.id);
    const rows = Object.fromEntries(edited.items.map((i) => [i.inventoryId, [Number(i.quantity), Number(i.unitCost)]]));
    expect(rows[rice.id]).toEqual([8, 40]); // an older price on a kept line survives
    expect(rows[dal.id]).toEqual([2, 0]);
  });

  it("ordering happens once; a second confirmation is refused; a cancelled order cannot be ordered", async () => {
    const { org, actor, supplier, rice } = await setup();
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 5 }] }, actor.id);
    await markOrdered(org.id, po.id, actor.id);
    await expect(markOrdered(org.id, po.id, actor.id)).rejects.toBeInstanceOf(PurchaseOrderError);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, recordId: po.id, action: "purchase_order.ordered" } })).toBe(1);
    const other = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 1 }] }, actor.id);
    await cancelPurchaseOrder(org.id, other.id, actor.id);
    await expect(markOrdered(org.id, other.id, actor.id)).rejects.toBeInstanceOf(PurchaseOrderError);
  });

  it("lists the receipts booked against an order from the stock ledger, and filters by status", async () => {
    const { org, actor, supplier, rice } = await setup();
    const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: rice.id, quantity: 10 }] }, actor.id);
    await markOrdered(org.id, po.id, actor.id);
    const line = (await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).id;
    await receiveStock(org.id, po.id, [{ itemId: line, quantity: 4 }], actor.id);
    await receiveStock(org.id, po.id, [{ itemId: line, quantity: 6 }], actor.id);
    const full = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: po.id }, include: { items: true } });
    const receipts = await listReceipts(org.id, full);
    expect(receipts.map((r) => r.quantity).sort()).toEqual([4, 6]);
    expect((await listPurchaseOrders(org.id, "RECEIVED")).map((p) => p.id)).toEqual([po.id]);
    expect(await listPurchaseOrders(org.id, "DRAFT")).toHaveLength(0);
  });
});

