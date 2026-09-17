import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type {
  FoodType,
  MenuItemOrigin,
  MenuItemBaseType,
  MenuItemPreparationMethod,
  MenuItemSpiceLevel,
  MenuItemOnionGarlic,
  MenuItemTexture,
  MenuItemTasteProfile,
} from "@/generated/prisma/enums";

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
  /** Additional Details (2026-09-17) — all optional, dynamically consumed by the future customer-facing menu. */
  origin?: MenuItemOrigin | null;
  baseType?: MenuItemBaseType | null;
  preparationMethod?: MenuItemPreparationMethod | null;
  spiceLevel?: MenuItemSpiceLevel | null;
  onionGarlic?: MenuItemOnionGarlic | null;
  vegFriendly?: boolean | null;
  nonVegFriendly?: boolean | null;
  texture?: MenuItemTexture | null;
  tasteProfile?: MenuItemTasteProfile | null;
  keyIngredients?: string | null;
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
      origin: input.origin,
      baseType: input.baseType,
      preparationMethod: input.preparationMethod,
      spiceLevel: input.spiceLevel,
      onionGarlic: input.onionGarlic,
      vegFriendly: input.vegFriendly,
      nonVegFriendly: input.nonVegFriendly,
      texture: input.texture,
      tasteProfile: input.tasteProfile,
      keyIngredients: input.keyIngredients,
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
      origin: input.origin !== undefined ? input.origin : before.origin,
      baseType: input.baseType !== undefined ? input.baseType : before.baseType,
      preparationMethod: input.preparationMethod !== undefined ? input.preparationMethod : before.preparationMethod,
      spiceLevel: input.spiceLevel !== undefined ? input.spiceLevel : before.spiceLevel,
      onionGarlic: input.onionGarlic !== undefined ? input.onionGarlic : before.onionGarlic,
      vegFriendly: input.vegFriendly !== undefined ? input.vegFriendly : before.vegFriendly,
      nonVegFriendly: input.nonVegFriendly !== undefined ? input.nonVegFriendly : before.nonVegFriendly,
      texture: input.texture !== undefined ? input.texture : before.texture,
      tasteProfile: input.tasteProfile !== undefined ? input.tasteProfile : before.tasteProfile,
      keyIngredients: input.keyIngredients !== undefined ? input.keyIngredients : before.keyIngredients,
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

/**
 * Hard delete (2026-09-14, replaces the old one-way `deactivateMenuItem`
 * now that the item form has a real Active checkbox — deactivating is just
 * unchecking Active and saving, which also supports reactivation, unlike
 * the old flow). Menus/categories referencing this item never dangle:
 * `MenuItemCategory`/`MenuMenuItem` both cascade (DB-level onDelete:
 * Cascade) off this row.
 */
export async function deleteMenuItem(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.menuItem.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.menuItem.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_item.delete",
    recordType: "MenuItem",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listMenuItems(organizationId: string, filter?: { categoryId?: string; isActive?: boolean }) {
  return prisma.menuItem.findMany({
    where: {
      organizationId,
      categories: filter?.categoryId ? { some: { categoryId: filter.categoryId } } : undefined,
      isActive: filter?.isActive,
    },
    // `menus: true` (no nested include) is enough — the edit dialog only
    // needs each row's scalar `menuId`, not the related Menu record itself.
    include: { categories: { include: { category: true } }, menus: true },
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
