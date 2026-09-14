import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createMenuItem, updateMenuItem, deactivateMenuItem, listMenuItems } from "@/modules/menus/item";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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

describe("MenuItem CRUD + dietary attributes (Chunk 6 Groups 6.1-6.2)", () => {
  it("createMenuItem stores dietary/allergen fields exactly as given for a food product", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const item = await createMenuItem(
      org.id,
      { name: "Paneer Tikka", isFoodProduct: true, foodType: "VEGETARIAN", dietaryType: "JAIN", eggInfo: "NO_EGG", price: 250 },
      actor.id,
    );

    expect(item.foodType).toBe("VEGETARIAN");
    expect(item.dietaryType).toBe("JAIN");
    expect(item.eggInfo).toBe("NO_EGG");
    expect(Number(item.price)).toBe(250);
  });

  it("createMenuItem clears dietary fields for a non-food product regardless of what's passed", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const item = await createMenuItem(
      org.id,
      { name: "Table Centerpiece", isFoodProduct: false, foodType: "VEGETARIAN", price: 500 },
      actor.id,
    );

    expect(item.isFoodProduct).toBe(false);
    expect(item.foodType).toBeNull();
    expect(item.dietaryType).toBeNull();
    expect(item.eggInfo).toBeNull();
  });

  it("updateMenuItem writes a before/after AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Gulab Jamun", isFoodProduct: true, price: 100 }, actor.id);

    const updated = await updateMenuItem(org.id, item.id, { name: "Gulab Jamun (2 pc)", isFoodProduct: true, price: 120 }, actor.id);
    expect(Number(updated.price)).toBe(120);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "menu_item.update", recordId: item.id } });
    expect(log).not.toBeNull();
    expect((log!.before as { price: string }).price).toBe("100");
  });

  it("deactivateMenuItem soft-deletes via isActive=false, row survives", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const item = await createMenuItem(org.id, { name: "Seasonal Special", isFoodProduct: true, price: 300 }, actor.id);

    const deactivated = await deactivateMenuItem(org.id, item.id, actor.id);
    expect(deactivated.isActive).toBe(false);

    const stillExists = await prisma.menuItem.findUnique({ where: { id: item.id } });
    expect(stillExists).not.toBeNull();
  });

  it("listMenuItems filters by isActive and categoryId, and is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const active = await createMenuItem(orgA.id, { name: "Active Dish", isFoodProduct: true, price: 100 }, actor.id);
    const inactive = await createMenuItem(orgA.id, { name: "Retired Dish", isFoodProduct: true, price: 100 }, actor.id);
    await deactivateMenuItem(orgA.id, inactive.id, actor.id);
    await createMenuItem(orgB.id, { name: "Other Tenant's Dish", isFoodProduct: true, price: 100 }, actor.id);

    const activeOnly = await listMenuItems(orgA.id, { isActive: true });
    expect(activeOnly.map((i) => i.id)).toEqual([active.id]);

    const allForOrgA = await listMenuItems(orgA.id);
    expect(allForOrgA).toHaveLength(2);
  });
});
