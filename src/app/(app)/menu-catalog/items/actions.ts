"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { duplicateMenuItem, setMenuItemActive, createMenuItem, updateMenuItem, deleteMenuItem, type MenuItemInput } from "@/modules/menus/item";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";
import { importFoodItems } from "@/modules/menus/import/import";
import { addCatalogItems } from "@/modules/menus/catalog/catalog";
import { saveRecipe, deleteRecipe, copyRecipe } from "@/modules/recipes/recipe";
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
  return { ok: false, error: userMessage(error, "Something went wrong.") };
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
    isPopular: formData.get("isPopular") === "true",
    isChefsSpecial: formData.get("isChefsSpecial") === "true",
    isLiveCounter: formData.get("isLiveCounter") === "true",
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

export async function duplicateMenuItemAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  try {
    await duplicateMenuItem(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  return { ok: true };
}

export async function setMenuItemActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await setMenuItemActive(organizationId, id, isActive, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  return { ok: true };
}

export interface RecipePayload {
  yieldServings: number;
  notes?: string;
  ingredients: { inventoryId: string; quantity: number }[];
}

export async function saveRecipeAction(menuItemId: string, payload: RecipePayload): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await saveRecipe(organizationId, menuItemId, payload, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function deleteRecipeAction(menuItemId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await deleteRecipe(organizationId, menuItemId, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  revalidatePath("/recipes");
  return { ok: true };
}

/** Starts a dish's recipe from another dish's (the Recipes page: "Copy from another dish"). */
export async function copyRecipeAction(fromMenuItemId: string, toMenuItemId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await copyRecipe(organizationId, fromMenuItemId, toMenuItemId, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  revalidatePath("/recipes");
  return { ok: true };
}

export type BulkActionResult =
  | { ok: true; created: number; skipped: { name: string; reason: string }[]; failed: { name: string; reason: string }[]; invalidRows?: { row: number; name: string; reason: string }[] }
  | { ok: false; error: string };

export async function importFoodItemsAction(formData: FormData): Promise<BulkActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an Excel or CSV file." };
    const result = await importFoodItems(organizationId, { name: file.name, data: new Uint8Array(await file.arrayBuffer()) }, session.user.id);
    revalidatePath("/menu-catalog/items");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Could not read that file.") };
  }
}

export async function addCatalogItemsAction(catalogIds: string[]): Promise<BulkActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  if (catalogIds.length === 0) return { ok: false, error: "Select at least one dish." };
  try {
    const result = await addCatalogItems(organizationId, catalogIds, session.user.id);
    revalidatePath("/menu-catalog/items");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Could not add those dishes.") };
  }
}
