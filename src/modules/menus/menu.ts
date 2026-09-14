import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { FoodType } from "@/generated/prisma/enums";

export interface MenuInput {
  name: string;
  description?: string;
  image?: string;
  menuType: FoodType;
  pricePerPlate: number;
  isActive?: boolean;
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

/**
 * Reorders (never adds/removes) a Menu's already-assigned categories —
 * assignment itself is owned by category.ts's `replaceCategoryMenuAssignments`
 * now (2026-09-14, AJ). `orderedCategoryIds` must exactly match the menu's
 * current assignment set; one audit row for the whole batch.
 */
export async function reorderMenuCategoryAssignments(
  organizationId: string,
  menuId: string,
  orderedCategoryIds: string[],
  actorUserId: string,
) {
  await prisma.menu.findFirstOrThrow({ where: { id: menuId, organizationId } });

  const existing = await prisma.menuCategoryAssignment.findMany({
    where: { menuId, categoryId: { in: orderedCategoryIds } },
    select: { id: true, categoryId: true, sortOrder: true },
  });
  if (existing.length !== orderedCategoryIds.length) {
    throw new Error("One or more categories are not currently assigned to this menu.");
  }
  const byCategory = new Map(existing.map((a) => [a.categoryId, a]));

  await prisma.$transaction(
    orderedCategoryIds.map((categoryId, index) =>
      prisma.menuCategoryAssignment.update({
        where: { id: byCategory.get(categoryId)!.id },
        data: { sortOrder: index },
      }),
    ),
  );

  await audit({
    organizationId,
    actorUserId,
    action: "menu.reorder_categories",
    recordType: "Menu",
    recordId: menuId,
    before: JSON.parse(JSON.stringify(existing)),
    after: JSON.parse(JSON.stringify(orderedCategoryIds.map((categoryId, index) => ({ categoryId, sortOrder: index })))),
  });
}

export async function listMenus(organizationId: string) {
  return prisma.menu.findMany({
    where: { organizationId },
    // Scalar-only — menus/page.tsx resolves each categoryId to a name via
    // the `categories` list it already fetches, same pattern as before.
    include: { categoryAssignments: true },
    orderBy: { createdAt: "desc" },
  });
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
