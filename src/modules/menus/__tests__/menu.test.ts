import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem } from "@/modules/menus/item";
import { createCategory } from "@/modules/menus/category";
import { createMenu, updateMenu, deleteMenu, getMenu, listMenus } from "@/modules/menus/menu";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuMenuItem.deleteMany({ where: { menu: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuCategoryAssignment.deleteMany({ where: { menu: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menu.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuCategory.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Menu Test Org", slug: `menu-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
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

describe("Menu CRUD (Chunk 6, reworked 2026-09-14)", () => {
  it("createMenu stores menuType and pricePerPlate", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const menu = await createMenu(org.id, { name: "Wedding Veg Menu", menuType: "VEGETARIAN", pricePerPlate: 350 }, actor.id);

    expect(menu.menuType).toBe("VEGETARIAN");
    expect(Number(menu.pricePerPlate)).toBe(350);
  });

  it("createMenu attaches items in the given order", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const itemA = await createMenuItem(org.id, { name: "Dish A", foodType: "VEGETARIAN", price: 100 }, actor.id);
    const itemB = await createMenuItem(org.id, { name: "Dish B", foodType: "VEGETARIAN", price: 100 }, actor.id);

    const menu = await createMenu(
      org.id,
      { name: "Wedding Silver Menu", menuType: "VEGETARIAN", pricePerPlate: 300, itemIds: [itemB.id, itemA.id] },
      actor.id,
    );
    const fetched = await getMenu(org.id, menu.id);

    expect(fetched!.items.map((i) => i.menuItemId)).toEqual([itemB.id, itemA.id]);
  });

  it("the same Category can be assigned to two different Menus with different max-selection (AJ's exact scenario)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const starters = await createCategory(org.id, { name: "Starters" }, actor.id);

    const vegMenu = await createMenu(
      org.id,
      { name: "Wedding Veg Menu", menuType: "VEGETARIAN", pricePerPlate: 300, categoryAssignments: [{ categoryId: starters.id, maxSelection: 2, sortOrder: 0 }] },
      actor.id,
    );
    const nonVegMenu = await createMenu(
      org.id,
      { name: "Wedding Non-Veg Menu", menuType: "NON_VEGETARIAN", pricePerPlate: 400, categoryAssignments: [{ categoryId: starters.id, maxSelection: 3, sortOrder: 0 }] },
      actor.id,
    );

    const vegFetched = await getMenu(org.id, vegMenu.id);
    const nonVegFetched = await getMenu(org.id, nonVegMenu.id);
    expect(vegFetched!.categoryAssignments[0].maxSelection).toBe(2);
    expect(nonVegFetched!.categoryAssignments[0].maxSelection).toBe(3);
  });

  it("getMenu's categoryAssignments respect sortOrder", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const starters = await createCategory(org.id, { name: "Starters" }, actor.id);
    const mains = await createCategory(org.id, { name: "Mains" }, actor.id);

    const menu = await createMenu(
      org.id,
      {
        name: "Ordered Menu",
        menuType: "VEGETARIAN",
        pricePerPlate: 300,
        categoryAssignments: [
          { categoryId: mains.id, maxSelection: null, sortOrder: 1 },
          { categoryId: starters.id, maxSelection: null, sortOrder: 0 },
        ],
      },
      actor.id,
    );

    const fetched = await getMenu(org.id, menu.id);
    expect(fetched!.categoryAssignments.map((a) => a.categoryId)).toEqual([starters.id, mains.id]);
  });

  it("the same MenuItem can belong to two different Menus", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Shared Dish", foodType: "VEGETARIAN", price: 100 }, actor.id);

    const menuOne = await createMenu(org.id, { name: "Menu One", menuType: "VEGETARIAN", pricePerPlate: 200, itemIds: [item.id] }, actor.id);
    const menuTwo = await createMenu(org.id, { name: "Menu Two", menuType: "VEGETARIAN", pricePerPlate: 250, itemIds: [item.id] }, actor.id);

    expect((await getMenu(org.id, menuOne.id))!.items).toHaveLength(1);
    expect((await getMenu(org.id, menuTwo.id))!.items).toHaveLength(1);
  });

  it("updateMenu replaces the item list and category assignments wholesale", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const itemA = await createMenuItem(org.id, { name: "Dish A", foodType: "VEGETARIAN", price: 100 }, actor.id);
    const itemB = await createMenuItem(org.id, { name: "Dish B", foodType: "VEGETARIAN", price: 100 }, actor.id);
    const category = await createCategory(org.id, { name: "Starters" }, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, itemIds: [itemA.id] }, actor.id);

    await updateMenu(
      org.id,
      menu.id,
      { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, itemIds: [itemB.id], categoryAssignments: [{ categoryId: category.id, maxSelection: 1, sortOrder: 0 }] },
      actor.id,
    );
    const fetched = await getMenu(org.id, menu.id);

    expect(fetched!.items.map((i) => i.menuItemId)).toEqual([itemB.id]);
    expect(fetched!.categoryAssignments.map((a) => a.categoryId)).toEqual([category.id]);
  });

  it("updateMenu can switch pricingModel-adjacent fields (menuType/pricePerPlate)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);

    const updated = await updateMenu(org.id, menu.id, { name: "Menu", menuType: "NON_VEGETARIAN", pricePerPlate: 350 }, actor.id);
    expect(updated.menuType).toBe("NON_VEGETARIAN");
    expect(Number(updated.pricePerPlate)).toBe(350);
  });

  it("deleteMenu removes the menu without deleting its MenuItems or Categories", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Survives", foodType: "VEGETARIAN", price: 100 }, actor.id);
    const category = await createCategory(org.id, { name: "Survives Too" }, actor.id);
    const menu = await createMenu(
      org.id,
      { name: "Temp Menu", menuType: "VEGETARIAN", pricePerPlate: 200, itemIds: [item.id], categoryAssignments: [{ categoryId: category.id, maxSelection: null, sortOrder: 0 }] },
      actor.id,
    );

    await deleteMenu(org.id, menu.id, actor.id);

    expect(await getMenu(org.id, menu.id)).toBeNull();
    expect(await prisma.menuItem.findUnique({ where: { id: item.id } })).not.toBeNull();
    expect(await prisma.menuCategory.findUnique({ where: { id: category.id } })).not.toBeNull();
  });

  it("listMenus is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const menuA = await createMenu(orgA.id, { name: "Org A Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    await createMenu(orgB.id, { name: "Org B Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);

    const list = await listMenus(orgA.id);
    expect(list.map((m) => m.id)).toEqual([menuA.id]);
  });
});
