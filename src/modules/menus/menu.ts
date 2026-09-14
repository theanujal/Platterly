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

export interface StorefrontMenuItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  foodType: FoodType;
  price: number;
}

export interface StorefrontMenuSection {
  categoryId: string | null;
  categoryName: string;
  items: StorefrontMenuItem[];
}

export interface StorefrontMenu {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  menuType: FoodType;
  pricePerPlate: number;
  sections: StorefrontMenuSection[];
}

function toStorefrontItem(item: { id: string; name: string; description: string | null; image: string | null; foodType: FoodType; price: unknown }): StorefrontMenuItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image: item.image,
    foodType: item.foodType,
    price: Number(item.price),
  };
}

/**
 * Chunk 8 Group 8.3 — active Menus with their active items, grouped into
 * sections by the menu's own category assignments (items tagged with an
 * assigned category land in that section; anything else falls into a
 * trailing "Other Items" section). View-only: no `maxSelection`/customer
 * picking semantics here — that's Chunk 11's Menu Selection workflow.
 */
export async function listStorefrontMenus(organizationId: string): Promise<StorefrontMenu[]> {
  const menus = await prisma.menu.findMany({
    where: { organizationId, isActive: true },
    include: {
      items: {
        where: { menuItem: { isActive: true } },
        include: { menuItem: { include: { categories: { select: { categoryId: true } } } } },
        orderBy: { sortOrder: "asc" },
      },
      categoryAssignments: {
        where: { category: { isActive: true } },
        include: { category: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return menus.map((menu) => {
    const categorizedItemIds = new Set<string>();

    const sections: StorefrontMenuSection[] = menu.categoryAssignments
      .map((assignment) => {
        const categoryItems = menu.items
          .filter((mi) => mi.menuItem.categories.some((c) => c.categoryId === assignment.categoryId))
          .map((mi) => mi.menuItem);
        categoryItems.forEach((item) => categorizedItemIds.add(item.id));
        return {
          categoryId: assignment.categoryId,
          categoryName: assignment.category.name,
          items: categoryItems.map(toStorefrontItem),
        };
      })
      .filter((section) => section.items.length > 0);

    const uncategorized = menu.items.filter((mi) => !categorizedItemIds.has(mi.menuItemId)).map((mi) => mi.menuItem);
    if (uncategorized.length > 0) {
      sections.push({ categoryId: null, categoryName: "Other Items", items: uncategorized.map(toStorefrontItem) });
    }

    return {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      image: menu.image,
      menuType: menu.menuType,
      pricePerPlate: Number(menu.pricePerPlate),
      sections,
    };
  });
}
