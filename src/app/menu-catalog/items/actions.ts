"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createMenuItem, updateMenuItem, deactivateMenuItem, type MenuItemInput } from "@/modules/menus/item";
import { uploadCatalogImage } from "@/modules/menus/image-upload";
import type { FoodType, DietaryType, EggInfo } from "@/generated/prisma/enums";

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
    categoryId: stringField(formData, "categoryId") ?? null,
    isFoodProduct: formData.get("isFoodProduct") === "true",
    foodType: (stringField(formData, "foodType") as FoodType | undefined) ?? null,
    dietaryType: (stringField(formData, "dietaryType") as DietaryType | undefined) ?? null,
    eggInfo: (stringField(formData, "eggInfo") as EggInfo | undefined) ?? null,
    price,
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
  revalidatePath(`/menu-catalog/items/${id}`);
  return { ok: true };
}

export async function deactivateMenuItemAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["delete"] }, organizationId);
  await deactivateMenuItem(organizationId, id, session.user.id);
  revalidatePath("/menu-catalog/items");
  return { ok: true };
}
