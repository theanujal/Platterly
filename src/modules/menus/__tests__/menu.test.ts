import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem } from "@/modules/menus/item";
import { createCategory, updateCategory } from "@/modules/menus/category";
import { createMenu, updateMenu, deleteMenu, getMenu, listMenus, reorderMenuCategoryAssignments } from "@/modules/menus/menu";

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

describe("Menu CRUD (Chunk 6, reworked 2026-09-14; ownership restructured again 2026-09-14)", () => {
  it("createMenu stores menuType and pricePerPlate", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const menu = await createMenu(org.id, { name: "Wedding Veg Menu", menuType: "VEGETARIAN", pricePerPlate: 350 }, actor.id);

    expect(menu.menuType).toBe("VEGETARIAN");
    expect(Number(menu.pricePerPlate)).toBe(350);
  });

  it("the same Category can be assigned to two different Menus with different max-selection (AJ's exact scenario), via the Category side", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const vegMenu = await createMenu(org.id, { name: "Wedding Veg Menu", menuType: "VEGETARIAN", pricePerPlate: 300 }, actor.id);
    const nonVegMenu = await createMenu(org.id, { name: "Wedding Non-Veg Menu", menuType: "NON_VEGETARIAN", pricePerPlate: 400 }, actor.id);
    const starters = await createCategory(
      org.id,
      {
        name: "Starters",
        menuAssignments: [
          { menuId: vegMenu.id, maxSelection: 2 },
          { menuId: nonVegMenu.id, maxSelection: 3 },
        ],
      },
      actor.id,
    );

    const vegFetched = await getMenu(org.id, vegMenu.id);
    const nonVegFetched = await getMenu(org.id, nonVegMenu.id);
    expect(vegFetched!.categoryAssignments.find((a) => a.categoryId === starters.id)!.maxSelection).toBe(2);
    expect(nonVegFetched!.categoryAssignments.find((a) => a.categoryId === starters.id)!.maxSelection).toBe(3);
  });

  it("reorderMenuCategoryAssignments persists a new sortOrder for a menu's already-assigned categories", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menu = await createMenu(org.id, { name: "Ordered Menu", menuType: "VEGETARIAN", pricePerPlate: 300 }, actor.id);
    const starters = await createCategory(org.id, { name: "Starters", menuAssignments: [{ menuId: menu.id, maxSelection: null }] }, actor.id);
    const mains = await createCategory(org.id, { name: "Mains", menuAssignments: [{ menuId: menu.id, maxSelection: null }] }, actor.id);

    // Appended in creation order: Starters (sortOrder 0), Mains (sortOrder 1).
    let fetched = await getMenu(org.id, menu.id);
    expect(fetched!.categoryAssignments.map((a) => a.categoryId)).toEqual([starters.id, mains.id]);

    await reorderMenuCategoryAssignments(org.id, menu.id, [mains.id, starters.id], actor.id);

    fetched = await getMenu(org.id, menu.id);
    expect(fetched!.categoryAssignments.map((a) => a.categoryId)).toEqual([mains.id, starters.id]);
  });

  it("reorderMenuCategoryAssignments rejects a category not currently assigned to that menu", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const unassigned = await createCategory(org.id, { name: "Not On This Menu" }, actor.id);

    await expect(reorderMenuCategoryAssignments(org.id, menu.id, [unassigned.id], actor.id)).rejects.toThrow();
  });

  it("the same MenuItem can belong to two different Menus (via the item's own menuIds)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menuOne = await createMenu(org.id, { name: "Menu One", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const menuTwo = await createMenu(org.id, { name: "Menu Two", menuType: "VEGETARIAN", pricePerPlate: 250 }, actor.id);

    await createMenuItem(org.id, { name: "Shared Dish", foodType: "VEGETARIAN", price: 100, menuIds: [menuOne.id, menuTwo.id] }, actor.id);

    expect((await getMenu(org.id, menuOne.id))!.items).toHaveLength(1);
    expect((await getMenu(org.id, menuTwo.id))!.items).toHaveLength(1);
  });

  it("updateCategory can replace a menu assignment's max-selection without disturbing its sortOrder", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const first = await createCategory(org.id, { name: "First", menuAssignments: [{ menuId: menu.id, maxSelection: null }] }, actor.id);
    await createCategory(org.id, { name: "Second", menuAssignments: [{ menuId: menu.id, maxSelection: null }] }, actor.id);
    await reorderMenuCategoryAssignments(org.id, menu.id, (await getMenu(org.id, menu.id))!.categoryAssignments.map((a) => a.categoryId).reverse(), actor.id);

    await updateCategory(org.id, first.id, { name: "First", menuAssignments: [{ menuId: menu.id, maxSelection: 5 }] }, actor.id);

    const fetched = await getMenu(org.id, menu.id);
    const firstAssignment = fetched!.categoryAssignments.find((a) => a.categoryId === first.id)!;
    expect(firstAssignment.maxSelection).toBe(5);
    expect(firstAssignment.sortOrder).toBe(1); // untouched by updateCategory, still reflects the earlier reorder
  });

  it("updateMenu can switch menuType/pricePerPlate", async () => {
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
    const menu = await createMenu(org.id, { name: "Temp Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const item = await createMenuItem(org.id, { name: "Survives", foodType: "VEGETARIAN", price: 100, menuIds: [menu.id] }, actor.id);
    const category = await createCategory(org.id, { name: "Survives Too", menuAssignments: [{ menuId: menu.id, maxSelection: null }] }, actor.id);

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
