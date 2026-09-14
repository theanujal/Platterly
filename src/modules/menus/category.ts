import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export class CategoryNameTakenError extends Error {}

export interface MenuAssignmentInput {
  menuId: string;
  /** null = unlimited selections from this category on that menu. */
  maxSelection: number | null;
}

export interface CategoryInput {
  name: string;
  description?: string;
  isActive?: boolean;
  /** Full replacement of which Menus this Category is assigned to, and each one's max-selection. */
  menuAssignments?: MenuAssignmentInput[];
}

/**
 * Assigning a Category to Menus is owned here (2026-09-14, AJ) — the Menu
 * Type screen only *displays* and *reorders* its already-assigned
 * categories now, it can no longer add/remove them or edit max-selection.
 * Deliberately preserves each surviving assignment's existing `sortOrder`
 * (the Menu Type screen's Move Up/Down owns that), and appends new
 * assignments after the current max sortOrder for that specific menu.
 */
async function replaceCategoryMenuAssignments(categoryId: string, assignments: MenuAssignmentInput[] | undefined) {
  if (assignments === undefined) return;

  const existing = await prisma.menuCategoryAssignment.findMany({ where: { categoryId } });
  const existingByMenu = new Map(existing.map((a) => [a.menuId, a]));
  const keepMenuIds = assignments.map((a) => a.menuId);

  await prisma.menuCategoryAssignment.deleteMany({
    where: { categoryId, menuId: { notIn: keepMenuIds } },
  });

  for (const assignment of assignments) {
    const prior = existingByMenu.get(assignment.menuId);
    if (prior) {
      await prisma.menuCategoryAssignment.update({
        where: { id: prior.id },
        data: { maxSelection: assignment.maxSelection },
      });
      continue;
    }
    const { _max } = await prisma.menuCategoryAssignment.aggregate({
      where: { menuId: assignment.menuId },
      _max: { sortOrder: true },
    });
    await prisma.menuCategoryAssignment.create({
      data: {
        categoryId,
        menuId: assignment.menuId,
        maxSelection: assignment.maxSelection,
        sortOrder: _max.sortOrder != null ? _max.sortOrder + 1 : 0,
      },
    });
  }
}

export async function createCategory(organizationId: string, input: CategoryInput, actorUserId: string) {
  const existing = await prisma.menuCategory.findUnique({
    where: { organizationId_name: { organizationId, name: input.name } },
  });
  if (existing) {
    throw new CategoryNameTakenError(`Category "${input.name}" already exists.`);
  }

  const category = await prisma.menuCategory.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      isActive: input.isActive ?? true,
    },
  });
  await replaceCategoryMenuAssignments(category.id, input.menuAssignments);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_category.create",
    recordType: "MenuCategory",
    recordId: category.id,
    after: JSON.parse(JSON.stringify(category)),
  });

  return category;
}

export async function updateCategory(
  organizationId: string,
  id: string,
  input: CategoryInput,
  actorUserId: string,
) {
  const before = await prisma.menuCategory.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.menuCategory.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      isActive: input.isActive ?? before.isActive,
    },
  });
  await replaceCategoryMenuAssignments(id, input.menuAssignments);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_category.update",
    recordType: "MenuCategory",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/** Items keep this category tag until explicitly untagged — deleting a category just removes the (cascading) tag/assignment rows, never the items or menus themselves. */
export async function deleteCategory(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menuCategory.findFirstOrThrow({ where: { id, organizationId } });

  await prisma.menuCategory.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_category.delete",
    recordType: "MenuCategory",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listCategories(organizationId: string) {
  return prisma.menuCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getCategory(organizationId: string, id: string) {
  return prisma.menuCategory.findFirst({ where: { id, organizationId } });
}

/** Which Menus this Category is assigned to, and with what max-selection/order on each — seeds the Category form's "Assign to Menus" checklist. */
export async function listCategoryMenuAssignments(organizationId: string, categoryId: string) {
  return prisma.menuCategoryAssignment.findMany({
    where: { categoryId, menu: { organizationId } },
    include: { menu: true },
    orderBy: { menu: { name: "asc" } },
  });
}
