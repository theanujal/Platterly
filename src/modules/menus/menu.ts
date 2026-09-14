import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { FoodType } from "@/generated/prisma/enums";

export interface CategoryAssignmentInput {
  categoryId: string;
  /** null = unlimited selections from this category. */
  maxSelection: number | null;
  sortOrder: number;
}

export interface MenuInput {
  name: string;
  description?: string;
  image?: string;
  menuType: FoodType;
  pricePerPlate: number;
  isActive?: boolean;
  /** Full replacement of this Menu's item list, in display order. */
  itemIds?: string[];
  /** Full replacement of this Menu's category assignments (max-selection + order per category). */
  categoryAssignments?: CategoryAssignmentInput[];
}

async function replaceMenuItems(menuId: string, itemIds: string[] | undefined) {
  if (itemIds === undefined) return;
  await prisma.menuMenuItem.deleteMany({ where: { menuId } });
  if (itemIds.length === 0) return;
  await prisma.menuMenuItem.createMany({
    data: itemIds.map((menuItemId, index) => ({ menuId, menuItemId, sortOrder: index })),
  });
}

async function replaceMenuCategoryAssignments(menuId: string, assignments: CategoryAssignmentInput[] | undefined) {
  if (assignments === undefined) return;
  await prisma.menuCategoryAssignment.deleteMany({ where: { menuId } });
  if (assignments.length === 0) return;
  await prisma.menuCategoryAssignment.createMany({
    data: assignments.map((a) => ({
      menuId,
      categoryId: a.categoryId,
      maxSelection: a.maxSelection,
      sortOrder: a.sortOrder,
    })),
  });
}

export async function createMenu(organizationId: string, input: MenuInput, actorUserId: string) {
  const menu = await prisma.menu.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      menuType: input.menuType,
      pricePerPlate: input.pricePerPlate,
      isActive: input.isActive ?? true,
    },
  });
  await replaceMenuItems(menu.id, input.itemIds);
  await replaceMenuCategoryAssignments(menu.id, input.categoryAssignments);

  await audit({
    organizationId,
    actorUserId,
    action: "menu.create",
    recordType: "Menu",
    recordId: menu.id,
    after: JSON.parse(JSON.stringify(menu)),
  });

  return menu;
}

export async function updateMenu(organizationId: string, id: string, input: MenuInput, actorUserId: string) {
  const before = await prisma.menu.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.menu.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      menuType: input.menuType,
      pricePerPlate: input.pricePerPlate,
      isActive: input.isActive ?? before.isActive,
    },
  });
  await replaceMenuItems(id, input.itemIds);
  await replaceMenuCategoryAssignments(id, input.categoryAssignments);

  await audit({
    organizationId,
    actorUserId,
    action: "menu.update",
    recordType: "Menu",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

export async function deleteMenu(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menu.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.menu.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu.delete",
    recordType: "Menu",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listMenus(organizationId: string) {
  return prisma.menu.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export async function getMenu(organizationId: string, id: string) {
  return prisma.menu.findFirst({
    where: { id, organizationId },
    include: {
      items: { include: { menuItem: true }, orderBy: { sortOrder: "asc" } },
      categoryAssignments: { include: { category: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}
