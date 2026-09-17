"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createMenuItem, updateMenuItem, deleteMenuItem, type MenuItemInput } from "@/modules/menus/item";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";
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

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string): Promise<MenuItemInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const foodType = stringField(formData, "foodType") as FoodType | undefined;
  if (foodType !== "VEGETARIAN" && foodType !== "NON_VEGETARIAN") throw new Error("Menu Type is required.");

  const priceRaw = formData.get("price");
  const price = typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : NaN;
  if (Number.isNaN(price) || price < 0) throw new Error("A valid, non-negative price is required.");

  let image = existingImage;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    image = await uploadCatalogImage(organizationId, "items", file);
  }

  return {
    name,
    description: stringField(formData, "description"),
    image,
    foodType,
    price,
    isActive: formData.get("isActive") === "true",
    categoryIds: formData.getAll("categoryIds").filter((v): v is string => typeof v === "string"),
    menuIds: formData.getAll("menuIds").filter((v): v is string => typeof v === "string"),
    origin: (stringField(formData, "origin") as MenuItemOrigin | undefined) ?? null,
    baseType: (stringField(formData, "baseType") as MenuItemBaseType | undefined) ?? null,
    preparationMethod: (stringField(formData, "preparationMethod") as MenuItemPreparationMethod | undefined) ?? null,
    spiceLevel: (stringField(formData, "spiceLevel") as MenuItemSpiceLevel | undefined) ?? null,
    onionGarlic: (stringField(formData, "onionGarlic") as MenuItemOnionGarlic | undefined) ?? null,
    vegFriendly: formData.get("vegFriendly") === "true" ? true : null,
    nonVegFriendly: formData.get("nonVegFriendly") === "true" ? true : null,
    texture: (stringField(formData, "texture") as MenuItemTexture | undefined) ?? null,
    tasteProfile: (stringField(formData, "tasteProfile") as MenuItemTasteProfile | undefined) ?? null,
    keyIngredients: stringField(formData, "keyIngredients") ?? null,
  };
}

export async function createMenuItemAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData);
    await createMenuItem(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  return { ok: true };
}

export async function updateMenuItemAction(
  id: string,
  existingImage: string | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData, existingImage);
    await updateMenuItem(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  return { ok: true };
}

export async function deleteMenuItemAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["delete"] }, organizationId);
  try {
    await deleteMenuItem(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  return { ok: true };
}
