import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { FoodType } from "@/generated/prisma/enums";

export interface MenuItemInput {
  name: string;
  description?: string;
  image?: string;
  foodType: FoodType;
  price: number;
  isActive?: boolean;
  /** Full replacement of this item's category tags — independent of menuIds below (AJ, 2026-09-14). */
  categoryIds?: string[];
  /** Full replacement of this item's direct menu assignments — independent of categoryIds above. */
  menuIds?: string[];
}

async function replaceItemCategories(menuItemId: string, categoryIds: string[] | undefined) {
  if (categoryIds === undefined) return;
  await prisma.menuItemCategory.deleteMany({ where: { menuItemId } });
  if (categoryIds.length === 0) return;
  await prisma.menuItemCategory.createMany({
    data: categoryIds.map((categoryId) => ({ menuItemId, categoryId })),
  });
}

async function replaceItemMenus(menuItemId: string, menuIds: string[] | undefined) {
  if (menuIds === undefined) return;
  await prisma.menuMenuItem.deleteMany({ where: { menuItemId } });
  if (menuIds.length === 0) return;
  await prisma.menuMenuItem.createMany({
    data: menuIds.map((menuId, index) => ({ menuId, menuItemId, sortOrder: index })),
  });
}

export async function createMenuItem(organizationId: string, input: MenuItemInput, actorUserId: string) {
  const item = await prisma.menuItem.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      foodType: input.foodType,
      price: input.price,
      isActive: input.isActive ?? true,
    },
  });
  await replaceItemCategories(item.id, input.categoryIds);
  await replaceItemMenus(item.id, input.menuIds);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_item.create",
    recordType: "MenuItem",
    recordId: item.id,
    after: JSON.parse(JSON.stringify(item)),
  });

  return item;
}

export async function updateMenuItem(
  organizationId: string,
  id: string,
  input: MenuItemInput,
  actorUserId: string,
) {
  const before = await prisma.menuItem.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.menuItem.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      foodType: input.foodType,
      price: input.price,
      isActive: input.isActive ?? before.isActive,
    },
  });
  await replaceItemCategories(id, input.categoryIds);
  await replaceItemMenus(id, input.menuIds);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_item.update",
    recordType: "MenuItem",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/** Soft-delete via isActive=false — a menu referencing this item elsewhere never dangles. */
export async function deactivateMenuItem(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menuItem.findFirstOrThrow({ where: { id, organizationId } });
  const after = await prisma.menuItem.update({ where: { id }, data: { isActive: false } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_item.deactivate",
    recordType: "MenuItem",
    recordId: id,
    before: { isActive: before.isActive },
    after: { isActive: after.isActive },
  });

  return after;
}

export async function listMenuItems(organizationId: string, filter?: { categoryId?: string; isActive?: boolean }) {
  return prisma.menuItem.findMany({
    where: {
      organizationId,
      categories: filter?.categoryId ? { some: { categoryId: filter.categoryId } } : undefined,
      isActive: filter?.isActive,
    },
    include: { categories: { include: { category: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getMenuItem(organizationId: string, id: string) {
  return prisma.menuItem.findFirst({
    where: { id, organizationId },
    include: {
      categories: { include: { category: true } },
      menus: { include: { menu: true } },
    },
  });
}
