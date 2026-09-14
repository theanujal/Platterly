"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createAddOn, updateAddOn, deleteAddOn, type AddOnInput } from "@/modules/addons/addon";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";
import type { AddOnType, AddOnPriceType } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string): Promise<AddOnInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const type = stringField(formData, "type") as AddOnType | undefined;
  if (type !== "LIVE_COUNTER" && type !== "SPECIAL_ADD_ON") throw new Error("Type is required.");

  const priceType = stringField(formData, "priceType") as AddOnPriceType | undefined;
  if (priceType !== "PER_PLATE" && priceType !== "FIXED") throw new Error("Price Type is required.");

  const priceRaw = formData.get("price");
  const price = typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : NaN;
  if (Number.isNaN(price) || price < 0) throw new Error("A valid, non-negative price is required.");

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
  revalidatePath("/addons");
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
    const input = await buildInput(organizationId, formData, existingImage);
    await updateAddOn(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/addons");
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
  revalidatePath("/addons");
  return { ok: true };
}
