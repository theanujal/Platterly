"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createMenu, updateMenu, deleteMenu, reorderMenuCategoryAssignments, type MenuInput } from "@/modules/menus/menu";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";
import type { FoodType, ChildPricingType } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string): Promise<MenuInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const menuType = stringField(formData, "menuType") as FoodType | undefined;
  if (menuType !== "VEGETARIAN" && menuType !== "NON_VEGETARIAN") throw new Error("Menu Type is required.");

  const priceRaw = formData.get("pricePerPlate");
  const pricePerPlate = typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : NaN;
  if (Number.isNaN(pricePerPlate) || pricePerPlate < 0) throw new Error("A valid, non-negative Price Per Plate is required.");

  let image = existingImage;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    image = await uploadCatalogImage(organizationId, "menus", file);
  }

  const childUnder5Chargeable = formData.get("childUnder5Chargeable") === "true";
  const childUnder5PriceRaw = stringField(formData, "childUnder5Price");
  const childUnder5Price = childUnder5PriceRaw !== undefined ? Number.parseFloat(childUnder5PriceRaw) : undefined;
  if (childUnder5Chargeable && (childUnder5Price === undefined || Number.isNaN(childUnder5Price) || childUnder5Price < 0)) {
    throw new Error("A valid, non-negative price is required when charging for children under 5.");
  }

  const child5To10PricingType = (stringField(formData, "child5To10PricingType") as ChildPricingType | undefined) ?? "FIXED";
  if (child5To10PricingType !== "PERCENTAGE" && child5To10PricingType !== "FIXED") {
    throw new Error("Invalid 5–10 Years Pricing type.");
  }
  const child5To10PriceValueRaw = stringField(formData, "child5To10PriceValue");
  const child5To10PriceValue = child5To10PriceValueRaw !== undefined ? Number.parseFloat(child5To10PriceValueRaw) : undefined;
  if (child5To10PriceValue !== undefined && (Number.isNaN(child5To10PriceValue) || child5To10PriceValue < 0)) {
    throw new Error("5–10 Years price must be non-negative.");
  }
  if (child5To10PricingType === "PERCENTAGE" && (child5To10PriceValue ?? 0) > 100) {
    throw new Error("Percentage can't exceed 100.");
  }

  return {
    name,
    description: stringField(formData, "description"),
    image,
    menuType,
    pricePerPlate,
    isActive: formData.get("isActive") === "true",
    childUnder5Chargeable,
    childUnder5Price: childUnder5Chargeable ? childUnder5Price : null,
    child5To10PricingType,
    child5To10PriceValue: child5To10PriceValue ?? null,
  };
}

export async function createMenuAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData);
    await createMenu(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/menus");
  return { ok: true };
}

export async function updateMenuAction(
  id: string,
  existingImage: string | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData, existingImage);
    await updateMenu(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/menus");
  return { ok: true };
}

export async function deleteMenuAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["delete"] }, organizationId);
  try {
    await deleteMenu(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/menus");
  return { ok: true };
}

export async function reorderMenuCategoriesAction(menuId: string, orderedCategoryIds: string[]): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await reorderMenuCategoryAssignments(organizationId, menuId, orderedCategoryIds, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/menus");
  return { ok: true };
}
