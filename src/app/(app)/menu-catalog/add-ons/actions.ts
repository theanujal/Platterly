"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireActiveOrganization, requirePermission, canSee } from "@/lib/auth/require-session";
import { duplicateAddOn, setAddOnActive, createAddOn, updateAddOn, deleteAddOn, type AddOnInput } from "@/modules/addons/addon";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";
import type { AddOnType, AddOnPriceType } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: userMessage(error, "Something went wrong.") };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string, existingId?: string): Promise<AddOnInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const type = stringField(formData, "type") as AddOnType | undefined;
  if (type !== "LIVE_COUNTER" && type !== "SPECIAL_ADD_ON" && type !== "SETUP_STYLE") throw new Error("Type is required.");

  // Add-on pricing is sensitive data (AJ, 2026-10-17): without the menu-prices right the price, price type and "in the package" choice are
  // not taken from the form: an edit keeps what is saved and a new add-on starts at 0 per plate.
  let priceType: AddOnPriceType;
  let includedInPackage: boolean;
  let price: number;
  if (await canSee("menuPrices", organizationId)) {
    const submittedType = stringField(formData, "priceType") as AddOnPriceType | undefined;
    if (submittedType !== "PER_PLATE" && submittedType !== "FIXED") throw new Error("Price Type is required.");
    priceType = submittedType;
    // An add-on in the package has no price to enter (the form hides the field); it is stored as 0.
    includedInPackage = formData.get("includedInPackage") === "true";
    const priceRaw = formData.get("price");
    price = includedInPackage ? 0 : typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : NaN;
    if (Number.isNaN(price) || price < 0) throw new Error("A valid, non-negative price is required.");
  } else if (existingId) {
    const saved = await prisma.addOn.findFirstOrThrow({ where: { id: existingId, organizationId } });
    priceType = saved.priceType;
    includedInPackage = saved.includedInPackage;
    price = Number(saved.price);
  } else {
    priceType = "PER_PLATE";
    includedInPackage = false;
    price = 0;
  }

  const appliesToAllMenus = formData.get("appliesToAllMenus") !== "false";
  const menuIds = formData.getAll("menuIds").filter((v): v is string => typeof v === "string" && v !== "");
  if (!appliesToAllMenus && menuIds.length === 0) throw new Error("Choose at least one menu, or tick All menus.");

  let image = existingImage;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    image = await uploadCatalogImage(organizationId, "add-ons", file);
  }

  return {
    name,
    description: stringField(formData, "description"),
    image,
    type,
    priceType,
    price,
    includedInPackage,
    appliesToAllMenus,
    menuIds,
    isActive: formData.get("isActive") === "true",
  };
}

export async function createAddOnAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData);
    await createAddOn(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/add-ons");
  return { ok: true };
}

export async function updateAddOnAction(
  id: string,
  existingImage: string | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData, existingImage, id);
    await updateAddOn(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/add-ons");
  return { ok: true };
}

export async function deleteAddOnAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["delete"] }, organizationId);
  try {
    await deleteAddOn(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/add-ons");
  return { ok: true };
}

export async function duplicateAddOnAction(id: string): Promise<ActionResult | { ok: true; name: string }> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  let copy;
  try {
    copy = await duplicateAddOn(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/add-ons");
  return { ok: true, name: copy.name };
}

export async function setAddOnActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    await setAddOnActive(organizationId, id, isActive, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/add-ons");
  return { ok: true };
}
