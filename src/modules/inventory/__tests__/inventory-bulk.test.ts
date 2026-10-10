import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createInventoryItem, updateInventoryItem, listInventoryItems, getInventoryOverviewStats, InventoryNameTakenError } from "@/modules/inventory/inventory";
import { importInventoryItems } from "../import/import";
import { addIngredientsFromCatalog, listIngredientCatalog } from "../catalog/catalog";

const orgIds: string[] = [];
const userIds: string[] = [];
const ingredientIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.kitchen.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.branch.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.systemIngredient.deleteMany({ where: { id: { in: ingredientIds } } });
  orgIds.length = userIds.length = ingredientIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Inv Bulk Org", slug: `invbulk-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
}
async function makeActor() {
  const u = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(u.id);
  return u;
}
async function makeLocation(organizationId: string, name: string) {
  const branch = await prisma.branch.create({ data: { organizationId, name: `${name} branch` } });
  return prisma.kitchen.create({ data: { organizationId, branchId: branch.id, name } });
}
const csv = (rows: string[]) => ({ name: "items.csv", data: new TextEncoder().encode(["Item Name,Category,Unit,Purchase Price,Opening Stock,Low Stock Alert", ...rows].join("\n") + "\n") });
const base = { category: "Dairy", unit: "kg" };

describe("inventory item names are unique per business and location, ignoring case", () => {
  it("rejects a repeat on create, rename and the database index; another location or business may reuse a name", async () => {
    const [org, other, actor] = [await makeOrg(), await makeOrg(), await makeActor()];
    const loc = await makeLocation(org.id, "Kitchen 2");
    const first = await createInventoryItem(org.id, { ...base, name: "Paneer" }, actor.id);
    await expect(createInventoryItem(org.id, { ...base, name: "  paneer " }, actor.id)).rejects.toBeInstanceOf(InventoryNameTakenError);
    await createInventoryItem(org.id, { ...base, name: "Butter" }, actor.id);
    await expect(updateInventoryItem(org.id, first.id, { ...base, name: "BUTTER" }, actor.id)).rejects.toBeInstanceOf(InventoryNameTakenError);
    await updateInventoryItem(org.id, first.id, { ...base, name: "PANEER" }, actor.id); // its own name, different case
    await createInventoryItem(org.id, { ...base, name: "Paneer", kitchenId: loc.id }, actor.id); // another location slot
    await createInventoryItem(other.id, { ...base, name: "Paneer" }, actor.id); // another business
    await expect(prisma.inventory.create({ data: { organizationId: org.id, name: "paneer", category: "Dairy", unit: "kg" } })).rejects.toThrow();
  });
});

describe("importInventoryItems", () => {
  it("creates items at zero stock unless a file gives opening stock, which becomes one STOCK_IN entry", async () => {
    const [org, actor] = [await makeOrg(), await makeActor()];
    await createInventoryItem(org.id, { ...base, name: "Butter" }, actor.id);
    const result = await importInventoryItems(
      org.id,
      csv(["Basmati Rice,Grains & Cereals,kg,95,25,10", "Paneer,Dairy,kg,320,,", "butter,Dairy,kg,500,5,", "Paneer,Dairy,kg,1,,", "Bad,Dairy,bushel,1,,"]),
      actor.id,
      null,
    );
    expect(result.created).toBe(2);
    expect(result.skipped.map((s) => s.name).sort()).toEqual(["Paneer", "butter"]);
    expect(result.invalidRows.map((r) => r.row)).toEqual([6]);

    const rice = await prisma.inventory.findFirstOrThrow({ where: { organizationId: org.id, name: "Basmati Rice" }, include: { transactions: true } });
    expect(Number(rice.stockCount)).toBe(25);
    expect(Number(rice.costPerUnit)).toBe(95);
    expect(Number(rice.lowStockThreshold)).toBe(10);
    expect(rice.transactions.map((t) => [t.type, Number(t.quantity), t.note])).toEqual([["STOCK_IN", 25, "Opening stock"]]);

    const paneer = await prisma.inventory.findFirstOrThrow({ where: { organizationId: org.id, name: "Paneer" }, include: { transactions: true } });
    expect(Number(paneer.stockCount)).toBe(0);
    expect(paneer.transactions).toHaveLength(0);
    // a second run adds nothing
    expect((await importInventoryItems(org.id, csv(["Paneer,Dairy,kg,1,,"]), actor.id, null)).created).toBe(0);
  });

  it("puts items in the given location slot and lets the same name exist in another one", async () => {
    const [org, actor] = [await makeOrg(), await makeActor()];
    const loc = await makeLocation(org.id, "Kitchen 2");
    await importInventoryItems(org.id, csv(["Rice,Grains & Cereals,kg,,,"]), actor.id, null);
    const atLocation = await importInventoryItems(org.id, csv(["Rice,Grains & Cereals,kg,,,"]), actor.id, loc.id);
    expect(atLocation.created).toBe(1);
    expect(await prisma.inventory.count({ where: { organizationId: org.id, name: "Rice" } })).toBe(2);
    expect((await listInventoryItems(org.id, loc.id)).filter((i) => i.name === "Rice")).toHaveLength(2); // shared + its own
  });
});

describe("Platterly ingredient catalog", () => {
  it("adds the picked ingredients at zero stock in the chosen unit, with no ledger entry", async () => {
    const [org, actor] = [await makeOrg(), await makeActor()];
    const name = `Test Rice ${crypto.randomUUID().slice(0, 6)}`;
    const master = await prisma.systemIngredient.create({ data: { name, categoryName: "Grains & Cereals", unit: "kg" } });
    ingredientIds.push(master.id);

    const result = await addIngredientsFromCatalog(org.id, [{ id: master.id, unit: "g" }], actor.id, null);
    expect(result.created).toBe(1);
    const mine = await prisma.inventory.findFirstOrThrow({ where: { organizationId: org.id, name }, include: { transactions: true } });
    expect([mine.unit, mine.category, Number(mine.stockCount), mine.costPerUnit]).toEqual(["g", "Grains & Cereals", 0, null]);
    expect(mine.transactions).toHaveLength(0);
    expect(mine.image).toBe("/catalog/ingredients/grains-and-cereals.svg");
    // a new ingredient is not available stock
    expect((await getInventoryOverviewStats(org.id, null)).outOfStock).toBe(1);

    expect((await addIngredientsFromCatalog(org.id, [{ id: master.id, unit: "kg" }], actor.id, null)).skipped).toHaveLength(1);
  });

  it("asks for a valid unit", async () => {
    const [org, actor] = [await makeOrg(), await makeActor()];
    const master = await prisma.systemIngredient.create({ data: { name: `Test Flour ${crypto.randomUUID().slice(0, 6)}`, categoryName: "Flours", unit: "kg" } });
    ingredientIds.push(master.id);
    const result = await addIngredientsFromCatalog(org.id, [{ id: master.id, unit: "bushel" }], actor.id, null);
    expect(result.created).toBe(0);
    expect(result.failed[0].reason).toBe("Choose a unit.");
  });
});

describe("kitchens never see each other's inventory", () => {
  it("what kitchen A picks, imports, edits or deletes stays in kitchen A; the catalog stays whole for B", async () => {
    const [a, b, actor] = [await makeOrg(), await makeOrg(), await makeActor()];
    const name = `Shared Ingredient ${crypto.randomUUID().slice(0, 6)}`;
    const master = await prisma.systemIngredient.create({ data: { name, categoryName: "Dairy", unit: "kg" } });
    ingredientIds.push(master.id);

    await addIngredientsFromCatalog(a.id, [{ id: master.id, unit: "kg" }], actor.id, null);
    await importInventoryItems(a.id, csv(["A Only Spice,Spices & Masalas,kg,10,5,"]), actor.id, null);

    expect(await listInventoryItems(b.id, null)).toHaveLength(0);
    expect((await listIngredientCatalog(b.id, null)).find((c) => c.id === master.id)?.alreadyAdded).toBe(false);
    expect((await listIngredientCatalog(a.id, null)).find((c) => c.id === master.id)?.alreadyAdded).toBe(true);

    await addIngredientsFromCatalog(b.id, [{ id: master.id, unit: "ltr" }], actor.id, null);
    const mineA = await prisma.inventory.findFirstOrThrow({ where: { organizationId: a.id, name } });
    const mineB = await prisma.inventory.findFirstOrThrow({ where: { organizationId: b.id, name } });
    expect([mineA.unit, mineB.unit]).toEqual(["kg", "ltr"]);

    await updateInventoryItem(a.id, mineA.id, { ...base, name, unit: "g", costPerUnit: 99 }, actor.id);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: mineB.id } })).costPerUnit ?? 0)).toBe(0);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: mineB.id } })).unit).toBe("ltr");
  });
});
