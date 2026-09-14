"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createPackage, updatePackage, deletePackage, type PackageInput, type PackageItemInput } from "@/modules/menus/package";
import { uploadCatalogImage } from "@/modules/menus/image-upload";
import type { PackagePricingModel } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function toOptionalNumber(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? undefined : n;
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string): Promise<PackageInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Name is required.");

  const pricingModel = stringField(formData, "pricingModel") as PackagePricingModel | undefined;
  if (pricingModel !== "FIXED" && pricingModel !== "PER_PERSON") throw new Error("A pricing model is required.");

  let image = existingImage;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    image = await uploadCatalogImage(organizationId, "packages", file);
  }

  const itemsRaw = stringField(formData, "items");
  const items: PackageItemInput[] = itemsRaw ? JSON.parse(itemsRaw) : [];

  return {
    name,
    description: stringField(formData, "description"),
    image,
    pricingModel,
    fixedPrice: toOptionalNumber(stringField(formData, "fixedPrice")),
    perPersonPrice: toOptionalNumber(stringField(formData, "perPersonPrice")),
    minGuests: toOptionalNumber(stringField(formData, "minGuests")),
    maxGuests: toOptionalNumber(stringField(formData, "maxGuests")),
    items,
  };
}

export async function createPackageAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData);
    await createPackage(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/packages");
  return { ok: true };
}

export async function updatePackageAction(
  id: string,
  existingImage: string | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData, existingImage);
    await updatePackage(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/packages");
  revalidatePath(`/menu-catalog/packages/${id}`);
  return { ok: true };
}

export async function deletePackageAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["delete"] }, organizationId);
  try {
    await deletePackage(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/menu-catalog/packages");
  return { ok: true };
}
