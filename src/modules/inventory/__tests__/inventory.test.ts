import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  listInventoryItems,
  getInventoryItem,
  recordStockTransaction,
  getInventoryOverviewStats,
  listLowStockItems,
} from "@/modules/inventory/inventory";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Inventory Test Org", slug: `inv-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

describe("Inventory CRUD (Chunk 7)", () => {
  it("createInventoryItem defaults stockCount to 0 with no ledger entry, and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const item = await createInventoryItem(org.id, { name: "Basmati Rice", category: "Grains", unit: "kg" }, actor.id);
    expect(Number(item.stockCount)).toBe(0);

    const transactions = await prisma.inventoryTransaction.count({ where: { inventoryId: item.id } });
    expect(transactions).toBe(0);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "inventory.create", recordId: item.id } });
    expect(log).not.toBeNull();
  });

  it("createInventoryItem with an opening stock sets stockCount and writes one STOCK_IN ledger entry", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const item = await createInventoryItem(org.id, { name: "Sunflower Oil", category: "Oils", unit: "ltr" }, actor.id, 50);
    expect(Number(item.stockCount)).toBe(50);

    const transaction = await prisma.inventoryTransaction.findFirst({ where: { inventoryId: item.id } });
    expect(transaction).not.toBeNull();
    expect(transaction!.type).toBe("STOCK_IN");
    expect(Number(transaction!.quantity)).toBe(50);
    expect(transaction!.note).toBe("Opening stock");
  });

  it("updateInventoryItem changes metadata but never touches stockCount, and writes a before/after AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, actor.id, 10);

    const updated = await updateInventoryItem(
      org.id,
      item.id,
      { name: "Paneer (Fresh)", category: "Dairy", unit: "kg", storageLocation: "Cold Room 1" },
      actor.id,
    );
    expect(updated.name).toBe("Paneer (Fresh)");
    expect(updated.storageLocation).toBe("Cold Room 1");
    expect(Number(updated.stockCount)).toBe(10);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "inventory.update", recordId: item.id } });
    expect(log).not.toBeNull();
  });

  it("deleteInventoryItem hard-deletes the item and cascades its transactions", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Sugar", category: "Grocery", unit: "kg" }, actor.id, 20);

    await deleteInventoryItem(org.id, item.id, actor.id);

    expect(await prisma.inventory.findUnique({ where: { id: item.id } })).toBeNull();
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: item.id } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "inventory.delete", recordId: item.id } });
    expect(log).not.toBeNull();
  });

  it("listInventoryItems orders by name and is tenant-isolated; getInventoryItem is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    await createInventoryItem(orgA.id, { name: "Zesty Lime", category: "Produce", unit: "kg" }, actor.id);
    const first = await createInventoryItem(orgA.id, { name: "Ambient Salt", category: "Grocery", unit: "kg" }, actor.id);
    await createInventoryItem(orgB.id, { name: "Other Tenant's Item", category: "Grocery", unit: "kg" }, actor.id);

    const list = await listInventoryItems(orgA.id);
    expect(list.map((i) => i.name)).toEqual(["Ambient Salt", "Zesty Lime"]);

    expect(await getInventoryItem(orgA.id, first.id)).not.toBeNull();
    expect(await getInventoryItem(orgB.id, first.id)).toBeNull();
  });
});

describe("recordStockTransaction — stock quantity math (Verify line, dev plans/chunk-07-inventory-basic.md)", () => {
  it("STOCK_IN increases stockCount by the quantity and writes a ledger row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Flour", category: "Grains", unit: "kg" }, actor.id, 10);

    const { item: updated, transaction } = await recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 15 }, actor.id);
    expect(Number(updated.stockCount)).toBe(25);
    expect(transaction.type).toBe("STOCK_IN");
    expect(Number(transaction.quantity)).toBe(15);
  });

  it("STOCK_OUT decreases stockCount by the quantity", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Milk", category: "Dairy", unit: "ltr" }, actor.id, 20);

    const { item: updated } = await recordStockTransaction(org.id, item.id, { type: "STOCK_OUT", quantity: 8 }, actor.id);
    expect(Number(updated.stockCount)).toBe(12);
  });

  it("STOCK_OUT rejects a quantity that would take stock below zero, and changes nothing", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Eggs", category: "Dairy", unit: "dozen" }, actor.id, 5);

    await expect(recordStockTransaction(org.id, item.id, { type: "STOCK_OUT", quantity: 10 }, actor.id)).rejects.toThrow(
      "This would take stock below zero.",
    );
    const unchanged = await prisma.inventory.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(unchanged.stockCount)).toBe(5);
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: item.id } })).toBe(1); // only the opening-stock entry
  });

  it("ADJUSTMENT applies a positive delta (found extra stock)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Onions", category: "Produce", unit: "kg" }, actor.id, 30);

    const { item: updated } = await recordStockTransaction(org.id, item.id, { type: "ADJUSTMENT", quantity: 5 }, actor.id);
    expect(Number(updated.stockCount)).toBe(35);
  });

  it("ADJUSTMENT applies a negative delta (wastage correction)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Tomatoes", category: "Produce", unit: "kg" }, actor.id, 30);

    const { item: updated } = await recordStockTransaction(org.id, item.id, { type: "ADJUSTMENT", quantity: -12 }, actor.id);
    expect(Number(updated.stockCount)).toBe(18);
  });

  it("ADJUSTMENT rejects a negative delta that would take stock below zero", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Chillies", category: "Produce", unit: "kg" }, actor.id, 4);

    await expect(recordStockTransaction(org.id, item.id, { type: "ADJUSTMENT", quantity: -10 }, actor.id)).rejects.toThrow(
      "This would take stock below zero.",
    );
  });

  it("rejects a zero or negative quantity for STOCK_IN/STOCK_OUT, and a zero delta for ADJUSTMENT", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(org.id, { name: "Ghee", category: "Dairy", unit: "kg" }, actor.id, 5);

    await expect(recordStockTransaction(org.id, item.id, { type: "STOCK_IN", quantity: 0 }, actor.id)).rejects.toThrow();
    await expect(recordStockTransaction(org.id, item.id, { type: "STOCK_OUT", quantity: -1 }, actor.id)).rejects.toThrow();
    await expect(recordStockTransaction(org.id, item.id, { type: "ADJUSTMENT", quantity: 0 }, actor.id)).rejects.toThrow();
  });

  it("is tenant-isolated — cannot record a transaction against another tenant's item", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const item = await createInventoryItem(orgA.id, { name: "Cardamom", category: "Spices", unit: "kg" }, actor.id, 5);

    await expect(recordStockTransaction(orgB.id, item.id, { type: "STOCK_IN", quantity: 5 }, actor.id)).rejects.toThrow();
  });
});

describe("getInventoryOverviewStats / listLowStockItems — Dashboard Inventory Overview card", () => {
  it("aggregates total items, in/low/out-of-stock counts, distinct categories, and total value", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg", lowStockThreshold: 10, costPerUnit: 40 }, actor.id, 100); // in stock
    await createInventoryItem(org.id, { name: "Oil", category: "Oils", unit: "ltr", lowStockThreshold: 20, costPerUnit: 150 }, actor.id, 15); // low stock
    await createInventoryItem(org.id, { name: "Salt", category: "Grains", unit: "kg", costPerUnit: 20 }, actor.id, 0); // out of stock, no threshold

    const stats = await getInventoryOverviewStats(org.id);
    expect(stats.totalItems).toBe(3);
    expect(stats.inStock).toBe(1);
    expect(stats.lowStock).toBe(1);
    expect(stats.outOfStock).toBe(1);
    expect(stats.categories).toBe(2);
    expect(stats.totalValue).toBe(100 * 40 + 15 * 150 + 0 * 20);
  });

  it("listLowStockItems returns only items at or below their threshold, tenant-isolated", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const low = await createInventoryItem(org.id, { name: "Butter", category: "Dairy", unit: "kg", lowStockThreshold: 5 }, actor.id, 5);
    await createInventoryItem(org.id, { name: "Cheese", category: "Dairy", unit: "kg", lowStockThreshold: 5 }, actor.id, 20);
    await createInventoryItem(org.id, { name: "Cream", category: "Dairy", unit: "kg" }, actor.id, 0); // no threshold set, excluded

    const lowStock = await listLowStockItems(org.id);
    expect(lowStock.map((i) => i.id)).toEqual([low.id]);
  });
});
