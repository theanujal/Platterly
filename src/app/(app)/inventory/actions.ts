"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  recordStockTransaction,
  type InventoryItemInput,
} from "@/modules/inventory/inventory";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";
import type { InventoryTransactionType } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function numberField(formData: FormData, name: string): number | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function dateField(formData: FormData, name: string): Date | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function buildInput(organizationId: string, formData: FormData, existingImage?: string): Promise<InventoryItemInput> {
  const name = stringField(formData, "name");
  if (!name) throw new Error("Item name is required.");
  const category = stringField(formData, "category");
  if (!category) throw new Error("Category is required.");
  const unit = stringField(formData, "unit");
  if (!unit) throw new Error("Unit is required.");

  let image = existingImage;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    image = await uploadCatalogImage(organizationId, "inventory", file);
  }

  return {
    name,
    category,
    description: stringField(formData, "description"),
    image,
    unit,
    lowStockThreshold: numberField(formData, "lowStockThreshold"),
    costPerUnit: numberField(formData, "costPerUnit"),
    storageLocation: stringField(formData, "storageLocation"),
    supplierName: stringField(formData, "supplierName"),
    supplierContact: stringField(formData, "supplierContact"),
    expiryDate: dateField(formData, "expiryDate"),
  };
}

export async function createInventoryItemAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData);
    const openingStock = numberField(formData, "openingStock");
    await createInventoryItem(organizationId, input, session.user.id, openingStock);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateInventoryItemAction(
  id: string,
  existingImage: string | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  try {
    const input = await buildInput(organizationId, formData, existingImage);
    await updateInventoryItem(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInventoryItemAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["delete"] }, organizationId);
  try {
    await deleteInventoryItem(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function recordStockTransactionAction(
  inventoryId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  try {
    const type = stringField(formData, "type") as InventoryTransactionType | undefined;
    if (type !== "STOCK_IN" && type !== "STOCK_OUT" && type !== "ADJUSTMENT") {
      throw new Error("A valid transaction type is required.");
    }
    const quantity = numberField(formData, "quantity");
    if (quantity === undefined) throw new Error("A quantity is required.");
    await recordStockTransaction(
      organizationId,
      inventoryId,
      { type, quantity, note: stringField(formData, "note") },
      session.user.id,
    );
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}
