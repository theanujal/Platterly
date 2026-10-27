"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireActiveOrganization, requirePermission, canSee } from "@/lib/auth/require-session";
import { duplicateMenu, setMenuActive, createMenu, updateMenu, deleteMenu, reorderMenuCategoryAssignments, reorderMenus, type MenuInput } from "@/modules/menus/menu";
import { catalogImageFromForm } from "@/lib/storage/catalog-image";
import type { FoodType, ChildPricingType } from "@/generated/prisma/enums";
import { stringField, toErrorResult } from "@/lib/form-data";

export type ActionResult = { ok: true } | { ok: false; error: string };

type MenuPricing = Pick<MenuInput, "pricePerPlate" | "childUnder5Chargeable" | "childUnder5Price" | "child5To10PricingType" | "child5To10PriceValue">;

/** Without the menu-prices right a menu keeps the pricing it has (a new one starts free of charge): nothing submitted can set it. */
async function keptPricing(organizationId: string, existingId?: string): Promise<MenuPricing> {
  if (!existingId) return { pricePerPlate: 0, childUnder5Chargeable: false, childUnder5Price: null, child5To10PricingType: "FIXED", child5To10PriceValue: null };
  const menu = await prisma.menu.findFirstOrThrow({ where: { id: existingId, organizationId } });
  return {
    pricePerPlate: Number(menu.pricePerPlate),
    childUnder5Chargeable: menu.childUnder5Chargeable,
    childUnder5Price: menu.childUnder5Price === null ? null : Number(menu.childUnder5Price),
    child5To10PricingType: menu.child5To10PricingType,
    child5To10PriceValue: menu.child5To10PriceValue === null ? null : Number(menu.child5To10PriceValue),
  };
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string, existingId?: string): Promise<MenuInput> {
  const mayPrice = await canSee("menuPrices", organizationId);
  if (!mayPrice) {
    const name = stringField(formData, "name");
    if (!name) throw new Error("Name is required.");
    const menuType = stringField(formData, "menuType") as FoodType | undefined;
    if (menuType !== "VEGETARIAN" && menuType !== "NON_VEGETARIAN") throw new Error("Menu Type is required.");
    const image = await catalogImageFromForm(organizationId, "menus", formData, existingImage);
    const categoryAssignments = formData.getAll("categoryAssignment").flatMap((raw) => {
      if (typeof raw !== "string") return [];
      const parsed = JSON.parse(raw) as { categoryId?: unknown; maxSelection?: unknown };
      if (typeof parsed.categoryId !== "string") return [];
      const max = typeof parsed.maxSelection === "number" && Number.isInteger(parsed.maxSelection) && parsed.maxSelection > 0 ? parsed.maxSelection : null;
      return [{ categoryId: parsed.categoryId, maxSelection: max }];
    });
    return { name, description: stringField(formData, "description"), image, categoryAssignments, menuType, isActive: formData.get("isActive") === "true", ...(await keptPricing(organizationId, existingId)) };
  }

  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const menuType = stringField(formData, "menuType") as FoodType | undefined;
  if (menuType !== "VEGETARIAN" && menuType !== "NON_VEGETARIAN") throw new Error("Menu Type is required.");

  const priceRaw = formData.get("pricePerPlate");
  const pricePerPlate = typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : NaN;
  if (Number.isNaN(pricePerPlate) || pricePerPlate < 0) throw new Error("A valid, non-negative Price Per Plate is required.");

  const image = await catalogImageFromForm(organizationId, "menus", formData, existingImage);

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

  const categoryAssignments = formData.getAll("categoryAssignment").flatMap((raw) => {
    if (typeof raw !== "string") return [];
    const parsed = JSON.parse(raw) as { categoryId?: unknown; maxSelection?: unknown };
    if (typeof parsed.categoryId !== "string") return [];
    const max = typeof parsed.maxSelection === "number" && Number.isInteger(parsed.maxSelection) && parsed.maxSelection > 0 ? parsed.maxSelection : null;
    return [{ categoryId: parsed.categoryId, maxSelection: max }];
  });

  return {
    name,
    description: stringField(formData, "description"),
    image,
    categoryAssignments,
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
    const input = await buildInput(organizationId, formData, existingImage, id);
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

export async function duplicateMenuAction(id: string): Promise<ActionResult | { ok: true; name: string }> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  let copy;
  try {
    copy = await duplicateMenu(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/menus");
  return { ok: true, name: copy.name };
}

export async function setMenuActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await setMenuActive(organizationId, id, isActive, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/menus");
  return { ok: true };
}

/** Owner and Manager (anyone who can edit menus) shuffle the order menus show in on the storefront and here. */
export async function reorderMenusAction(orderedIds: string[]): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await reorderMenus(organizationId, orderedIds, session.user.id);
  } catch (error) {
    return { ok: false, error: userMessage(error, "Could not reorder menus.") };
  }
  revalidatePath("/menu-catalog/menus");
  return { ok: true };
}
