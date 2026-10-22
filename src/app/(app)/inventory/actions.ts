"use server";

import { assertInventoryItemAtMyLocation, getActiveLocation, myHeldLocation } from "@/modules/locations/active-location";
import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireActiveOrganization, requirePermission, canSee, requireSensitive } from "@/lib/auth/require-session";
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  recordStockTransaction,
  type InventoryItemInput,
} from "@/modules/inventory/inventory";
import { lowStockError } from "@/modules/inventory/options";
import { confirmBatchCost, listBatches, setBatchStatus, stockPosition } from "@/modules/inventory/batches";
import { importInventoryItems } from "@/modules/inventory/import/import";
import { addIngredientsFromCatalog } from "@/modules/inventory/catalog/catalog";
import { uploadCatalogImage } from "@/lib/storage/catalog-image";
import type { InventoryTransactionType } from "@/generated/prisma/enums";
import { numberField, stringField, toErrorResult } from "@/lib/form-data";

/** `id` is set by the create action, so a caller that opened the form from elsewhere (the supplier drawer) can pick the new item. */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

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
    supplierId: stringField(formData, "supplierId") ?? null,
    // Only sent while multiple locations are on; absent leaves the item as it is.
    kitchenId: formData.has("kitchenId") ? (stringField(formData, "kitchenId") ?? null) : undefined,
    expiryDate: dateField(formData, "expiryDate"),
    // Left out of the form data = the category's default on create, unchanged on update.
    tracksExpiry: formData.has("tracksExpiry") ? formData.get("tracksExpiry") === "true" : undefined,
  };
}

export async function createInventoryItemAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  let created: Awaited<ReturnType<typeof createInventoryItem>>;
  try {
    const input = await buildInput(organizationId, formData);
    // The New Inventory Item form asks for no cost, supplier, expiry or opening stock: whatever is posted for them is ignored, and no stock movement is created.
    const problem = lowStockError(input.unit, input.lowStockThreshold);
    if (problem) throw new Error(problem);
    input.costPerUnit = undefined;
    input.supplierId = null;
    input.expiryDate = undefined;
    // A person held to a location creates items at that location.
    const held = await myHeldLocation(organizationId, session.user.id);
    if (held) input.kitchenId = held;
    created = await createInventoryItem(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/recipes");
  revalidatePath("/suppliers");
  return { ok: true, id: created.id };
}

export async function updateInventoryItemAction(
  id: string,
  existingImage: string | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertInventoryItemAtMyLocation(organizationId, session.user.id, id);
  try {
    const input = await buildInput(organizationId, formData, existingImage);
    // The item's cost per unit is a supplier cost (Sensitive data, AJ 2026-10-17): without that right a submitted cost is ignored and the saved one stays.
    if (!(await canSee("supplierCosts", organizationId))) input.costPerUnit = (await prisma.inventory.findFirstOrThrow({ where: { id, organizationId }, select: { costPerUnit: true } })).costPerUnit?.toNumber() ?? undefined;
    // ...and cannot move an item to another location or make it shared.
    if (await myHeldLocation(organizationId, session.user.id)) input.kitchenId = undefined;
    await updateInventoryItem(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function deleteInventoryItemAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["delete"] }, organizationId);
  await assertInventoryItemAtMyLocation(organizationId, session.user.id, id);
  try {
    await deleteInventoryItem(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/recipes");
  return { ok: true };
}

export async function recordStockTransactionAction(
  inventoryId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertInventoryItemAtMyLocation(organizationId, session.user.id, inventoryId);
  try {
    const type = stringField(formData, "type") as InventoryTransactionType | undefined;
    if (type !== "STOCK_IN" && type !== "STOCK_OUT" && type !== "ADJUSTMENT") {
      throw new Error("A valid transaction type is required.");
    }
    const quantity = numberField(formData, "quantity");
    if (quantity === undefined) throw new Error("A quantity is required.");
    // Without the supplier-costs right the person cannot state a cost: the batch is booked with an unknown cost, which the store confirms later from the item's Batches.
    const mayCost = await canSee("supplierCosts", organizationId);
    await recordStockTransaction(
      organizationId,
      inventoryId,
      {
        type,
        quantity,
        note: stringField(formData, "note"),
        // Stock In says what it cost, or that the cost is unknown; the item's own cost is never copied in.
        unitCost: mayCost ? numberField(formData, "unitCost") : undefined,
        costUnknown: mayCost ? formData.get("costUnknown") === "true" : true,
        costNote: mayCost ? stringField(formData, "costNote") : undefined,
        expiryDate: dateField(formData, "expiryDate") ?? null,
        lotNumber: stringField(formData, "lotNumber"),
      },
      session.user.id,
    );
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/recipes");
  return { ok: true };
}

export type BulkActionResult =
  | { ok: true; created: number; skipped: { name: string; reason: string }[]; failed: { name: string; reason: string }[]; invalidRows?: { row: number; name: string; reason: string }[] }
  | { ok: false; error: string };

export async function importInventoryItemsAction(formData: FormData): Promise<BulkActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  // The sheet carries a cost column, so importing needs the right to set supplier costs.
  await requireSensitive("supplierCosts", organizationId);
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an Excel or CSV file." };
    // Same rule as adding one by hand: a person held to a location adds there, the owner at the location they are viewing, otherwise shared.
    const active = await getActiveLocation(organizationId, session.user.id);
    const result = await importInventoryItems(organizationId, { name: file.name, data: new Uint8Array(await file.arrayBuffer()) }, session.user.id, active.locationId);
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/recipes");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Could not read that file.") };
  }
}

export async function addIngredientsAction(picks: { id: string; unit: string }[]): Promise<BulkActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  if (picks.length === 0) return { ok: false, error: "Select at least one ingredient." };
  try {
    const active = await getActiveLocation(organizationId, session.user.id);
    const result = await addIngredientsFromCatalog(organizationId, picks, session.user.id, active.locationId);
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/recipes");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Could not add those ingredients.") };
  }
}

export interface BatchRow {
  id: string;
  source: "OPENING" | "RECEIPT" | "STOCK_IN" | "ADJUSTMENT";
  state: "usable" | "expired" | "quarantined" | "empty";
  expiringSoon: boolean;
  fifoRank: number | null;
  originalQuantity: number;
  remainingQuantity: number;
  unitCost: number | null;
  /** YYYY-MM-DD, or null when never recorded. */
  receivedDate: string | null;
  expiryDate: string | null;
  lotNumber: string | null;
  costNote: string | null;
  expiryMissing: boolean;
}

export type BatchesResult =
  | { ok: true; batches: BatchRow[]; recommendedBatchId: string | null; position: { stockCount: number; usable: number; expired: number; quarantined: number; unbatched: number } }
  | { ok: false; error: string };

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** The batches of one item for the Batches drawer. */
export async function listBatchesAction(inventoryId: string): Promise<BatchesResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["view"] }, organizationId);
  await assertInventoryItemAtMyLocation(organizationId, session.user.id, inventoryId);
  try {
    const [{ batches, recommendedBatchId }, position, mayCost] = await Promise.all([listBatches(organizationId, inventoryId), stockPosition(prisma, inventoryId), canSee("supplierCosts", organizationId)]);
    return {
      ok: true,
      recommendedBatchId,
      position,
      batches: batches.map((b) => ({ id: b.id, source: b.source, state: b.state, expiringSoon: b.expiringSoon, fifoRank: b.fifoRank, originalQuantity: b.originalQuantity, remainingQuantity: b.remainingQuantity, unitCost: mayCost ? b.unitCost : null, receivedDate: isoDay(b.receivedDate), expiryDate: isoDay(b.expiryDate), lotNumber: b.lotNumber, costNote: mayCost ? b.costNote : null, expiryMissing: b.expiryMissing })),
    };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Something went wrong.") };
  }
}

/** Holds a batch back from use (quarantine) or releases it. */
export async function setBatchStatusAction(inventoryId: string, batchId: string, status: "ACTIVE" | "QUARANTINED"): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertInventoryItemAtMyLocation(organizationId, session.user.id, inventoryId);
  try {
    await setBatchStatus(organizationId, batchId, status, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/recipes");
  return { ok: true };
}

/** Confirms the cost of a batch whose cost is unknown (a cost above zero, or 0 with a reason for free goods). */
export async function confirmBatchCostAction(inventoryId: string, batchId: string, unitCost: number, costNote: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await requireSensitive("supplierCosts", organizationId);
  await assertInventoryItemAtMyLocation(organizationId, session.user.id, inventoryId);
  try {
    await confirmBatchCost(organizationId, batchId, { unitCost, costNote }, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/recipes");
  return { ok: true };
}
