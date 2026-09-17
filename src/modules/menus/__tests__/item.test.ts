import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem, updateMenuItem, deleteMenuItem, listMenuItems, getMenuItem } from "@/modules/menus/item";
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

  it("createMenuItem defaults every Additional Details field to null when omitted", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const item = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 250 }, actor.id);

    expect(item.origin).toBeNull();
    expect(item.baseType).toBeNull();
    expect(item.preparationMethod).toBeNull();
    expect(item.spiceLevel).toBeNull();
    expect(item.onionGarlic).toBeNull();
    expect(item.vegFriendly).toBeNull();
    expect(item.nonVegFriendly).toBeNull();
    expect(item.texture).toBeNull();
    expect(item.tasteProfile).toBeNull();
    expect(item.keyIngredients).toBeNull();
  });

  it("createMenuItem/updateMenuItem persist Additional Details, and updateMenuItem preserves them when omitted", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const item = await createMenuItem(
      org.id,
      {
        name: "Paneer Tikka",
        foodType: "VEGETARIAN",
        price: 250,
        origin: "NORTH_INDIAN",
        baseType: "GRAVY_BASED",
        preparationMethod: "TANDOOR",
        spiceLevel: "MEDIUM",
        onionGarlic: "WITHOUT_ONION_GARLIC",
        vegFriendly: true,
        nonVegFriendly: false,
        texture: "CREAMY",
        tasteProfile: "SAVORY",
        keyIngredients: "Paneer, Tomato, Cashew",
      },
      actor.id,
    );

    expect(item.origin).toBe("NORTH_INDIAN");
    expect(item.baseType).toBe("GRAVY_BASED");
    expect(item.preparationMethod).toBe("TANDOOR");
    expect(item.spiceLevel).toBe("MEDIUM");
    expect(item.onionGarlic).toBe("WITHOUT_ONION_GARLIC");
    expect(item.vegFriendly).toBe(true);
    expect(item.nonVegFriendly).toBe(false);
    expect(item.texture).toBe("CREAMY");
    expect(item.tasteProfile).toBe("SAVORY");
    expect(item.keyIngredients).toBe("Paneer, Tomato, Cashew");

    // A partial update (name only) preserves every Additional Details field untouched.
    const updated = await updateMenuItem(org.id, item.id, { name: "Paneer Tikka Deluxe", foodType: "VEGETARIAN", price: 250 }, actor.id);
    expect(updated.origin).toBe("NORTH_INDIAN");
    expect(updated.spiceLevel).toBe("MEDIUM");
    expect(updated.keyIngredients).toBe("Paneer, Tomato, Cashew");

    // An explicit update can change a subset and null out another explicitly.
    const changed = await updateMenuItem(
      org.id,
      item.id,
      { name: "Paneer Tikka Deluxe", foodType: "VEGETARIAN", price: 250, spiceLevel: "SPICY", origin: null },
      actor.id,
    );
    expect(changed.spiceLevel).toBe("SPICY");
    expect(changed.origin).toBeNull();
    expect(changed.baseType).toBe("GRAVY_BASED");
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

  it("updateMenuItem can set isActive=false, and back to true (replaces the old one-way deactivate flow)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Seasonal Special", foodType: "VEGETARIAN", price: 300 }, actor.id);
    expect(item.isActive).toBe(true);

    const deactivated = await updateMenuItem(org.id, item.id, { name: "Seasonal Special", foodType: "VEGETARIAN", price: 300, isActive: false }, actor.id);
    expect(deactivated.isActive).toBe(false);

    const reactivated = await updateMenuItem(org.id, item.id, { name: "Seasonal Special", foodType: "VEGETARIAN", price: 300, isActive: true }, actor.id);
    expect(reactivated.isActive).toBe(true);
  });

  it("deleteMenuItem hard-deletes the row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Seasonal Special", foodType: "VEGETARIAN", price: 300 }, actor.id);

    await deleteMenuItem(org.id, item.id, actor.id);

    const stillExists = await prisma.menuItem.findUnique({ where: { id: item.id } });
    expect(stillExists).toBeNull();
  });

  it("listMenuItems filters by isActive and categoryId, and is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(orgA.id, { name: "Mains" }, actor.id);
    const active = await createMenuItem(orgA.id, { name: "Active Dish", foodType: "VEGETARIAN", price: 100, categoryIds: [category.id] }, actor.id);
    await createMenuItem(orgA.id, { name: "Retired Dish", foodType: "VEGETARIAN", price: 100, isActive: false }, actor.id);
    await createMenuItem(orgB.id, { name: "Other Tenant's Dish", foodType: "VEGETARIAN", price: 100 }, actor.id);

    const activeOnly = await listMenuItems(orgA.id, { isActive: true });
    expect(activeOnly.map((i) => i.id)).toEqual([active.id]);

    const byCategoryOnly = await listMenuItems(orgA.id, { categoryId: category.id });
    expect(byCategoryOnly.map((i) => i.id)).toEqual([active.id]);

    const allForOrgA = await listMenuItems(orgA.id);
    expect(allForOrgA).toHaveLength(2);
  });
});
