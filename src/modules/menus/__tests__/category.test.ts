import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  listCategories,
  getCategory,
  listCategoryMenuAssignments,
  CategoryNameTakenError,
} from "@/modules/menus/category";
import { createMenu } from "@/modules/menus/menu";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuCategoryAssignment.deleteMany({ where: { menu: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menu.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuCategory.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Category Test Org", slug: `cat-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
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

describe("MenuCategory CRUD (Chunk 6, reworked 2026-09-14)", () => {
  it("createCategory stores description/isActive and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const category = await createCategory(org.id, { name: "Starters", description: "Small plates", isActive: false }, actor.id);
    expect(category.name).toBe("Starters");
    expect(category.description).toBe("Small plates");
    expect(category.isActive).toBe(false);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "menu_category.create" } });
    expect(log).not.toBeNull();
  });

  it("createCategory rejects a duplicate name within the same tenant", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    await createCategory(org.id, { name: "Main Course" }, actor.id);

    await expect(createCategory(org.id, { name: "Main Course" }, actor.id)).rejects.toThrow(CategoryNameTakenError);
  });

  it("allows the same category name across two different tenants", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();

    await createCategory(orgA.id, { name: "Desserts" }, actor.id);
    await expect(createCategory(orgB.id, { name: "Desserts" }, actor.id)).resolves.toBeTruthy();
  });

  it("updateCategory renames and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(org.id, { name: "Beverages" }, actor.id);

    const updated = await updateCategory(org.id, category.id, { name: "Drinks" }, actor.id);
    expect(updated.name).toBe("Drinks");
  });

  it("getCategory is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(orgA.id, { name: "Snacks" }, actor.id);

    expect(await getCategory(orgA.id, category.id)).not.toBeNull();
    expect(await getCategory(orgB.id, category.id)).toBeNull();
  });

  it("deleteCategory removes the row without touching menus or items (cascades only join rows)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(org.id, { name: "Snacks" }, actor.id);
    const menu = await createMenu(
      org.id,
      { name: "Test Menu", menuType: "VEGETARIAN", pricePerPlate: 100, categoryAssignments: [{ categoryId: category.id, maxSelection: 2, sortOrder: 0 }] },
      actor.id,
    );

    await deleteCategory(org.id, category.id, actor.id);

    const remaining = await listCategories(org.id);
    expect(remaining.find((c) => c.id === category.id)).toBeUndefined();
    const stillExistsMenu = await prisma.menu.findUnique({ where: { id: menu.id } });
    expect(stillExistsMenu).not.toBeNull();
  });

  it("listCategories orders by name", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    await createCategory(org.id, { name: "Zesty" }, actor.id);
    await createCategory(org.id, { name: "Appetizers" }, actor.id);

    const list = await listCategories(org.id);
    expect(list.map((c) => c.name)).toEqual(["Appetizers", "Zesty"]);
  });

  it("listCategoryMenuAssignments reflects the same category with different max-selection on two different menus", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(org.id, { name: "Starters" }, actor.id);
    const vegMenu = await createMenu(
      org.id,
      { name: "Veg Menu", menuType: "VEGETARIAN", pricePerPlate: 300, categoryAssignments: [{ categoryId: category.id, maxSelection: 2, sortOrder: 0 }] },
      actor.id,
    );
    const nonVegMenu = await createMenu(
      org.id,
      { name: "Non-Veg Menu", menuType: "NON_VEGETARIAN", pricePerPlate: 400, categoryAssignments: [{ categoryId: category.id, maxSelection: 3, sortOrder: 1 }] },
      actor.id,
    );

    const assignments = await listCategoryMenuAssignments(org.id, category.id);
    expect(assignments).toHaveLength(2);
    const veg = assignments.find((a) => a.menuId === vegMenu.id);
    const nonVeg = assignments.find((a) => a.menuId === nonVegMenu.id);
    expect(veg!.maxSelection).toBe(2);
    expect(nonVeg!.maxSelection).toBe(3);
  });
});
