import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem } from "@/modules/menus/item";
import { createMenu, updateMenu, deleteMenu, getMenu, listMenus } from "@/modules/menus/menu";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuMenuItem.deleteMany({ where: { menu: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menu.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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

describe("Menu (named item grouping) CRUD (Chunk 6 Group 6.1)", () => {
  it("createMenu attaches items in the given order", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const itemA = await createMenuItem(org.id, { name: "Dish A", isFoodProduct: true, price: 100 }, actor.id);
    const itemB = await createMenuItem(org.id, { name: "Dish B", isFoodProduct: true, price: 100 }, actor.id);

    const menu = await createMenu(org.id, { name: "Wedding Silver Menu", itemIds: [itemB.id, itemA.id] }, actor.id);
    const fetched = await getMenu(org.id, menu.id);

    expect(fetched!.items.map((i) => i.menuItemId)).toEqual([itemB.id, itemA.id]);
  });

  it("the same MenuItem can belong to two different Menus", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Shared Dish", isFoodProduct: true, price: 100 }, actor.id);

    const menuOne = await createMenu(org.id, { name: "Menu One", itemIds: [item.id] }, actor.id);
    const menuTwo = await createMenu(org.id, { name: "Menu Two", itemIds: [item.id] }, actor.id);

    expect((await getMenu(org.id, menuOne.id))!.items).toHaveLength(1);
    expect((await getMenu(org.id, menuTwo.id))!.items).toHaveLength(1);
  });

  it("updateMenu replaces the item list wholesale", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const itemA = await createMenuItem(org.id, { name: "Dish A", isFoodProduct: true, price: 100 }, actor.id);
    const itemB = await createMenuItem(org.id, { name: "Dish B", isFoodProduct: true, price: 100 }, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", itemIds: [itemA.id] }, actor.id);

    await updateMenu(org.id, menu.id, { name: "Menu", itemIds: [itemB.id] }, actor.id);
    const fetched = await getMenu(org.id, menu.id);

    expect(fetched!.items.map((i) => i.menuItemId)).toEqual([itemB.id]);
  });

  it("deleteMenu removes the menu without deleting its MenuItems", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Survives", isFoodProduct: true, price: 100 }, actor.id);
    const menu = await createMenu(org.id, { name: "Temp Menu", itemIds: [item.id] }, actor.id);

    await deleteMenu(org.id, menu.id, actor.id);

    expect(await getMenu(org.id, menu.id)).toBeNull();
    expect(await prisma.menuItem.findUnique({ where: { id: item.id } })).not.toBeNull();
  });

  it("listMenus is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const menuA = await createMenu(orgA.id, { name: "Org A Menu" }, actor.id);
    await createMenu(orgB.id, { name: "Org B Menu" }, actor.id);

    const list = await listMenus(orgA.id);
    expect(list.map((m) => m.id)).toEqual([menuA.id]);
  });
});
