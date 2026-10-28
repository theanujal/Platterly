"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireActiveOrganization, requirePermission, canSee, requireSensitive } from "@/lib/auth/require-session";
import { duplicateMenuItem, setMenuItemActive, createMenuItem, updateMenuItem, deleteMenuItem, type MenuItemInput } from "@/modules/menus/item";
import { catalogImageFromForm } from "@/lib/storage/catalog-image";
import { importFoodItems } from "@/modules/menus/import/import";
import { addCatalogItems } from "@/modules/menus/catalog/catalog";
import { saveRecipe, deleteRecipe, setRecipeStatus } from "@/modules/recipes/recipe";
import { createInventoryItem } from "@/modules/inventory/inventory";
import { myHeldLocation } from "@/modules/locations/active-location";
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
import { stringField, toErrorResult } from "@/lib/form-data";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function buildInput(organizationId: string, formData: FormData, existingId?: string): Promise<MenuItemInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const foodType = stringField(formData, "foodType") as FoodType | undefined;
  if (foodType !== "VEGETARIAN" && foodType !== "NON_VEGETARIAN") throw new Error("Menu Type is required.");

  // Menu and dish prices are sensitive data (AJ, 2026-10-17): without the right a submitted price is ignored, an edit keeps the saved one and a new dish starts at 0.
  let price: number;
  if (await canSee("menuPrices", organizationId)) {
    const priceRaw = formData.get("price");
    price = typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : NaN;
    if (Number.isNaN(price) || price < 0) throw new Error("A valid, non-negative price is required.");
  } else {
    price = existingId ? Number((await prisma.menuItem.findFirstOrThrow({ where: { id: existingId, organizationId }, select: { price: true } })).price) : 0;
  }

  const image = await catalogImageFromForm(organizationId, "items", formData);

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
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData, id);
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

export async function duplicateMenuItemAction(id: string): Promise<ActionResult | { ok: true; name: string }> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  let copy;
  try {
    copy = await duplicateMenuItem(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  return { ok: true, name: copy.name };
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
  // Recipes have their own permission (AJ, 2026-10-17): a first recipe for a dish needs "create", changing one needs "edit".
  const existing = await prisma.recipe.findFirst({ where: { organizationId, menuItemId }, select: { id: true } });
  await requirePermission({ recipes: [existing ? "edit" : "create"] }, organizationId);
  try {
    await saveRecipe(organizationId, menuItemId, payload, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  revalidatePath("/recipes");
  return { ok: true };
}

/** Approves a recipe for production (Active) or returns it to Draft. Same permission as editing the recipe; the module re-checks the recipe on the server. */
export async function setRecipeStatusAction(menuItemId: string, status: "ACTIVE" | "DRAFT"): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ recipes: ["edit"] }, organizationId);
  try {
    await setRecipeStatus(organizationId, menuItemId, status === "ACTIVE" ? "ACTIVE" : "DRAFT", session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/items");
  revalidatePath("/recipes");
  revalidatePath("/orders");
  return { ok: true };
}

/** An ingredient that is not in Inventory yet, added from the recipe form: zero stock, category Other, the unit it is stocked in. */
export async function createRecipeIngredientAction(
  name: string,
  unit: string,
): Promise<{ ok: true; id: string; name: string; unit: string } | { ok: false; error: string }> {
  const { session, organizationId } = await requireActiveOrganization();
  // Writing a recipe may need an ingredient the store has not listed yet; adding it (zero stock) belongs to writing the recipe.
  await requirePermission({ recipes: ["create"] }, organizationId);
  try {
    const kitchenId = await myHeldLocation(organizationId, session.user.id);
    const item = await createInventoryItem(organizationId, { name: name.trim(), category: "Other", unit, kitchenId }, session.user.id);
    revalidatePath("/inventory");
    return { ok: true, id: item.id, name: item.name, unit: item.unit };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Something went wrong.") };
  }
}

export async function deleteRecipeAction(menuItemId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ recipes: ["delete"] }, organizationId);
  try {
    await deleteRecipe(organizationId, menuItemId, session.user.id);
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
  // The sheet carries a price column, so importing needs the right to set dish prices.
  await requireSensitive("menuPrices", organizationId);
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
