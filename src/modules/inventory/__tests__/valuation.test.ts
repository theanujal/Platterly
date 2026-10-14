import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { summariseValuation } from "../valuation-math";
import { valueStock } from "../valuation";
import { getInventoryOverviewStats } from "../inventory";
import { createBatch } from "../batches";

describe("shared stock valuation (pure)", () => {
  it("sums remaining x batch cost over known-cost batches, values free goods at 0, and reports unknown-cost stock apart", () => {
    const v = summariseValuation([
      { id: "rice", stockCount: 30, batches: [{ remainingQuantity: 10, unitCost: 40 }, { remainingQuantity: 20, unitCost: 55 }] },
      { id: "sample", stockCount: 5, batches: [{ remainingQuantity: 5, unitCost: 0 }] },
      { id: "oil", stockCount: 8, batches: [{ remainingQuantity: 6, unitCost: null }, { remainingQuantity: 2, unitCost: 100 }] },
      { id: "loose", stockCount: 7, batches: [] }, // on hand but in no batch
    ]);
    expect(v.items.get("rice")).toEqual({ knownValue: 10 * 40 + 20 * 55, knownQuantity: 30, unknownQuantity: 0 });
    expect(v.items.get("sample")).toEqual({ knownValue: 0, knownQuantity: 5, unknownQuantity: 0 }); // confirmed free is known
    expect(v.items.get("oil")).toEqual({ knownValue: 200, knownQuantity: 2, unknownQuantity: 6 });
    expect(v.items.get("loose")).toEqual({ knownValue: 0, knownQuantity: 0, unknownQuantity: 7 });
    expect(v.totalValue).toBe(1500 + 0 + 200);
    expect(v.itemsWithUnknownCost).toBe(2);
    expect(v.incomplete).toBe(true);
  });
  it("is complete when every unit has a known cost", () => {
    const v = summariseValuation([{ id: "a", stockCount: 4, batches: [{ remainingQuantity: 4, unitCost: 25 }] }]);
    expect(v).toMatchObject({ totalValue: 100, itemsWithUnknownCost: 0, incomplete: false });
  });
});

describe("one valuation across the Dashboard, Inventory and Reports", () => {
  const orgIds: string[] = [];
  afterEach(async () => {
    await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    orgIds.length = 0;
  });

  it("the Dashboard figures and the Inventory page's valueStock agree, and ignore the item's own cost", async () => {
    const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Val Org", slug: `v-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
    orgIds.push(org.id);
    const a = await prisma.inventory.create({ data: { organizationId: org.id, name: "A", category: "Grains", unit: "kg", costPerUnit: 999 } });
    const b = await prisma.inventory.create({ data: { organizationId: org.id, name: "B", category: "Grains", unit: "kg", costPerUnit: 999 } });
    await prisma.$transaction(async (tx) => {
      await createBatch(tx, { organizationId: org.id, inventoryId: a.id, source: "RECEIPT", quantity: 10, unitCost: 40, receivedDate: new Date() });
      await createBatch(tx, { organizationId: org.id, inventoryId: a.id, source: "RECEIPT", quantity: 5, unitCost: 60, receivedDate: new Date() });
      await createBatch(tx, { organizationId: org.id, inventoryId: b.id, source: "STOCK_IN", quantity: 3, unitCost: null, receivedDate: new Date() });
    });
    const stats = await getInventoryOverviewStats(org.id);
    const valuation = await valueStock(org.id);
    expect(stats.totalValue).toBe(700);
    expect(stats.totalValue).toBe(valuation.totalValue);
    expect(stats).toMatchObject({ valuationIncomplete: true, itemsWithUnknownCost: 1 });
    expect(valuation.items.get(b.id)).toMatchObject({ knownValue: 0, unknownQuantity: 3 });
  });
});
