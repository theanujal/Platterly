import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem, updateMenuItem, deactivateMenuItem, listMenuItems, getMenuItem } from "@/modules/menus/item";
import { createCategory } from "@/modules/menus/category";
import { createMenu } from "@/modules/menus/menu";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuItemCategory.deleteMany({ where: { menuItem: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuMenuItem.deleteMany({ where: { menuItem: { organizationId: { in: cleanupOrgIds } } } });
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
    data: { id: crypto.randomUUID(), name: "Item Test Org", slug: `item-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
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

describe("MenuItem CRUD (Chunk 6, reworked 2026-09-14)", () => {
  it("createMenuItem stores the required foodType", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const item = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 250 }, actor.id);

    expect(item.foodType).toBe("VEGETARIAN");
    expect(Number(item.price)).toBe(250);
  });

  it("an item can be tagged with multiple categories at once", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const starters = await createCategory(org.id, { name: "Starters" }, actor.id);
    const chefSpecial = await createCategory(org.id, { name: "Chef's Special" }, actor.id);

    const item = await createMenuItem(
      org.id,
      { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 250, categoryIds: [starters.id, chefSpecial.id] },
      actor.id,
    );

    const fetched = await getMenuItem(org.id, item.id);
    expect(fetched!.categories.map((c) => c.categoryId).sort()).toEqual([starters.id, chefSpecial.id].sort());
  });

  it("an item's categoryIds and menuIds are stored and replaced independently of each other", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(org.id, { name: "Starters" }, actor.id);
    const menu = await createMenu(org.id, { name: "Wedding Menu", menuType: "VEGETARIAN", pricePerPlate: 300 }, actor.id);

    const item = await createMenuItem(
      org.id,
      { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 250, categoryIds: [category.id], menuIds: [menu.id] },
      actor.id,
    );
    let fetched = await getMenuItem(org.id, item.id);
    expect(fetched!.categories.map((c) => c.categoryId)).toEqual([category.id]);
    expect(fetched!.menus.map((m) => m.menuId)).toEqual([menu.id]);

    // Remove the category, keep the menu — the two sets must not affect each other.
    await updateMenuItem(org.id, item.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 250, categoryIds: [], menuIds: [menu.id] }, actor.id);
    fetched = await getMenuItem(org.id, item.id);
    expect(fetched!.categories).toHaveLength(0);
    expect(fetched!.menus.map((m) => m.menuId)).toEqual([menu.id]);
  });

  it("updateMenuItem writes a before/after AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Gulab Jamun", foodType: "VEGETARIAN", price: 100 }, actor.id);

    const updated = await updateMenuItem(org.id, item.id, { name: "Gulab Jamun (2 pc)", foodType: "VEGETARIAN", price: 120 }, actor.id);
    expect(Number(updated.price)).toBe(120);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "menu_item.update", recordId: item.id } });
    expect(log).not.toBeNull();
    expect((log!.before as { price: string }).price).toBe("100");
  });

  it("deactivateMenuItem soft-deletes via isActive=false, row survives", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Seasonal Special", foodType: "VEGETARIAN", price: 300 }, actor.id);

    const deactivated = await deactivateMenuItem(org.id, item.id, actor.id);
    expect(deactivated.isActive).toBe(false);

    const stillExists = await prisma.menuItem.findUnique({ where: { id: item.id } });
    expect(stillExists).not.toBeNull();
  });

  it("listMenuItems filters by isActive and categoryId, and is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(orgA.id, { name: "Mains" }, actor.id);
    const active = await createMenuItem(orgA.id, { name: "Active Dish", foodType: "VEGETARIAN", price: 100, categoryIds: [category.id] }, actor.id);
    const inactive = await createMenuItem(orgA.id, { name: "Retired Dish", foodType: "VEGETARIAN", price: 100 }, actor.id);
    await deactivateMenuItem(orgA.id, inactive.id, actor.id);
    await createMenuItem(orgB.id, { name: "Other Tenant's Dish", foodType: "VEGETARIAN", price: 100 }, actor.id);

    const activeOnly = await listMenuItems(orgA.id, { isActive: true });
    expect(activeOnly.map((i) => i.id)).toEqual([active.id]);

    const byCategoryOnly = await listMenuItems(orgA.id, { categoryId: category.id });
    expect(byCategoryOnly.map((i) => i.id)).toEqual([active.id]);

    const allForOrgA = await listMenuItems(orgA.id);
    expect(allForOrgA).toHaveLength(2);
  });
});
