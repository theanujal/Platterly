import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem, duplicateMenuItem, updateMenuItem, MenuItemNameTakenError } from "@/modules/menus/item";
import { bulkAddFoodItems } from "../import/bulk-add";
import { importFoodItems } from "../import/import";
import { addCatalogItems, listCatalog } from "../catalog/catalog";

const orgIds: string[] = [];
const userIds: string[] = [];
const catalogIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuItemCategory.deleteMany({ where: { menuItem: { organizationId: { in: orgIds } } } });
  await prisma.menuCategory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.systemFoodItem.deleteMany({ where: { id: { in: catalogIds } } });
  orgIds.length = userIds.length = catalogIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Bulk Org", slug: `bulk-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
}
async function makeActor() {
  const u = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(u.id);
  return u;
}
const base = { foodType: "VEGETARIAN", price: 100 } as const;

describe("food item names are unique per business, ignoring case", () => {
  it("rejects a second item with the same name on create, rename and the database index", async () => {
    const [org, other, actor] = [await makeOrg(), await makeOrg(), await makeActor()];
    const first = await createMenuItem(org.id, { ...base, name: "Paneer Tikka" }, actor.id);
    await expect(createMenuItem(org.id, { ...base, name: "  paneer tikka " }, actor.id)).rejects.toBeInstanceOf(MenuItemNameTakenError);
    await createMenuItem(org.id, { ...base, name: "Dal" }, actor.id);
    await expect(updateMenuItem(org.id, first.id, { ...base, name: "DAL" }, actor.id)).rejects.toBeInstanceOf(MenuItemNameTakenError);
    // keeping its own name (even with a different case) is fine
    await updateMenuItem(org.id, first.id, { ...base, name: "PANEER TIKKA" }, actor.id);
    // another business may use the same name
    await createMenuItem(other.id, { ...base, name: "Dal" }, actor.id);
    // the database refuses it too, in case a path skips the service check
    await expect(prisma.menuItem.create({ data: { organizationId: org.id, name: "dal", foodType: "VEGETARIAN", price: 1 } })).rejects.toThrow();
  });

  it("duplicating an item twice gives (Copy) then (Copy 2)", async () => {
    const [org, actor] = [await makeOrg(), await makeActor()];
    const item = await createMenuItem(org.id, { ...base, name: "Biryani" }, actor.id);
    expect((await duplicateMenuItem(org.id, item.id, actor.id)).name).toBe("Biryani (Copy)");
    expect((await duplicateMenuItem(org.id, item.id, actor.id)).name).toBe("Biryani (Copy 2)");
  });
});

describe("bulkAddFoodItems / importFoodItems", () => {
  it("creates items and categories, skips existing and repeated names, reports invalid rows", async () => {
    const [org, actor] = [await makeOrg(), await makeActor()];
    await createMenuItem(org.id, { ...base, name: "Dal" }, actor.id);
    const csv = "Item Name,Category,Veg / Non-Veg,Price,Description\nPaneer Tikka,Starters,Veg,180,Smoky\ndal,Mains,Veg,90,\nPaneer TIKKA,Starters,Veg,180,\nChicken Biryani,Rice & Biryani,Non-Veg,260,\nBad,Mains,Fish,10,\n";
    const result = await importFoodItems(org.id, { name: "items.csv", data: new TextEncoder().encode(csv) }, actor.id);
    expect(result.created).toBe(2);
    expect(result.skipped.map((s) => s.name).sort()).toEqual(["Paneer TIKKA", "dal"]);
    expect(result.invalidRows.map((r) => r.row)).toEqual([6]);
    const items = await prisma.menuItem.findMany({ where: { organizationId: org.id }, include: { categories: { include: { category: true } } } });
    expect(items).toHaveLength(3);
    expect(items.find((i) => i.name === "Paneer Tikka")?.categories.map((c) => c.category.name)).toEqual(["Starters"]);
    expect(await prisma.menuCategory.count({ where: { organizationId: org.id } })).toBe(2);
    // a second run adds nothing
    expect((await bulkAddFoodItems(org.id, [{ name: "Chicken Biryani", foodType: "NON_VEGETARIAN", price: 1, categoryNames: [] }], actor.id)).created).toBe(0);
  });
});

describe("Platterly catalog", () => {
  it("adds independent copies at price 0 and marks them added, without touching the master or other businesses", async () => {
    const [org, other, actor] = [await makeOrg(), await makeOrg(), await makeActor()];
    const name = `Test Dish ${crypto.randomUUID().slice(0, 6)}`;
    const master = await prisma.systemFoodItem.create({ data: { name, description: "Nice", foodType: "VEGETARIAN", categoryName: "Starters" } });
    catalogIds.push(master.id);

    const result = await addCatalogItems(org.id, [master.id], actor.id);
    expect(result.created).toBe(1);
    const mine = await prisma.menuItem.findFirstOrThrow({ where: { organizationId: org.id, name } });
    expect(Number(mine.price)).toBe(0);
    expect(mine.sourceCatalogId).toBe(master.id);

    await prisma.menuItem.update({ where: { id: mine.id }, data: { price: 250, description: "Mine" } });
    expect((await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: master.id } })).description).toBe("Nice");
    expect((await listCatalog(org.id)).find((c) => c.id === master.id)?.alreadyAdded).toBe(true);
    expect((await listCatalog(other.id)).find((c) => c.id === master.id)?.alreadyAdded).toBe(false);

    expect((await addCatalogItems(org.id, [master.id], actor.id)).skipped).toHaveLength(1);
  });
});
