import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { FoodType, DietaryType, EggInfo } from "@/generated/prisma/enums";

export interface MenuItemInput {
  name: string;
  description?: string;
  image?: string;
  categoryId?: string | null;
  isFoodProduct: boolean;
  foodType?: FoodType | null;
  dietaryType?: DietaryType | null;
  eggInfo?: EggInfo | null;
  price: number;
  isActive?: boolean;
}

export async function createMenuItem(organizationId: string, input: MenuItemInput, actorUserId: string) {
  const item = await prisma.menuItem.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      categoryId: input.categoryId ?? undefined,
      isFoodProduct: input.isFoodProduct,
      foodType: input.isFoodProduct ? (input.foodType ?? undefined) : undefined,
      dietaryType: input.isFoodProduct ? (input.dietaryType ?? undefined) : undefined,
      eggInfo: input.isFoodProduct ? (input.eggInfo ?? undefined) : undefined,
      price: input.price,
      isActive: input.isActive ?? true,
    },
  });

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
      categoryId: input.categoryId ?? null,
      isFoodProduct: input.isFoodProduct,
      foodType: input.isFoodProduct ? (input.foodType ?? null) : null,
      dietaryType: input.isFoodProduct ? (input.dietaryType ?? null) : null,
      eggInfo: input.isFoodProduct ? (input.eggInfo ?? null) : null,
      price: input.price,
      isActive: input.isActive ?? before.isActive,
    },
  });

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

/** Soft-delete via isActive=false — a package/menu referencing this item elsewhere never dangles. */
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
      categoryId: filter?.categoryId,
      isActive: filter?.isActive,
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });
}

export async function getMenuItem(organizationId: string, id: string) {
  return prisma.menuItem.findFirst({ where: { id, organizationId }, include: { category: true } });
}
