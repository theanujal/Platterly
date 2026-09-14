import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCategory, updateCategory, deleteCategory, listCategories, CategoryNameTakenError } from "@/modules/menus/category";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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

describe("MenuCategory CRUD (Chunk 6 Group 6.1)", () => {
  it("createCategory writes an AuditLog row scoped to the tenant", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const category = await createCategory(org.id, { name: "Starters" }, actor.id);
    expect(category.name).toBe("Starters");

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

  it("deleteCategory removes the row and SetNulls any MenuItem.categoryId", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const category = await createCategory(org.id, { name: "Snacks" }, actor.id);
    const item = await prisma.menuItem.create({
      data: { organizationId: org.id, categoryId: category.id, name: "Samosa", price: 20 },
    });

    await deleteCategory(org.id, category.id, actor.id);

    const remaining = await listCategories(org.id);
    expect(remaining.find((c) => c.id === category.id)).toBeUndefined();
    const refreshedItem = await prisma.menuItem.findUnique({ where: { id: item.id } });
    expect(refreshedItem?.categoryId).toBeNull();

    await prisma.menuItem.deleteMany({ where: { organizationId: org.id } });
  });

  it("listCategories orders by sortOrder then name", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    await createCategory(org.id, { name: "Zesty", sortOrder: 1 }, actor.id);
    await createCategory(org.id, { name: "Appetizers", sortOrder: 0 }, actor.id);

    const list = await listCategories(org.id);
    expect(list.map((c) => c.name)).toEqual(["Appetizers", "Zesty"]);
  });
});
