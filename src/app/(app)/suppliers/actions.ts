"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createSupplier, updateSupplier, deleteSupplier, setSupplierActive, type SupplierInput, type SupplierProductInput } from "@/modules/suppliers/supplier";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: userMessage(error, "Something went wrong.") };
}

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function buildInput(formData: FormData): SupplierInput {
  const name = field(formData, "name");
  if (!name) throw new Error("Supplier name is required.");
  return {
    name,
    contactPerson: field(formData, "contactPerson"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    address: field(formData, "address"),
    gstin: field(formData, "gstin"),
    notes: field(formData, "notes"),
    isActive: formData.get("isActive") !== "false",
  };
}

/** The Products Supplied list arrives as JSON; absent means "leave the mappings alone". Checked here for shape, and again against the kitchen's inventory in the module. */
function buildProducts(formData: FormData): SupplierProductInput[] | undefined {
  const raw = formData.get("products");
  if (typeof raw !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The products list could not be read.");
  }
  if (!Array.isArray(parsed)) throw new Error("The products list could not be read.");
  return parsed.map((p) => {
    if (typeof p !== "object" || !p || typeof (p as { inventoryId?: unknown }).inventoryId !== "string" || !(p as { inventoryId: string }).inventoryId) throw new Error("The products list could not be read.");
    return { inventoryId: (p as { inventoryId: string }).inventoryId, isPreferred: (p as { isPreferred?: unknown }).isPreferred === true };
  });
}

function refresh(id?: string) {
  revalidatePath("/suppliers");
  if (id) revalidatePath(`/suppliers/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/expenses");
}

export async function createSupplierAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  try {
    await createSupplier(organizationId, buildInput(formData), session.user.id, buildProducts(formData) ?? []);
  } catch (error) {
    return toErrorResult(error);
  }
  refresh();
  return { ok: true };
}

export async function updateSupplierAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  try {
    await updateSupplier(organizationId, id, buildInput(formData), session.user.id, buildProducts(formData));
  } catch (error) {
    return toErrorResult(error);
  }
  refresh(id);
  return { ok: true };
}

export async function setSupplierActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  try {
    await setSupplierActive(organizationId, id, active, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  refresh(id);
  return { ok: true };
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["delete"] }, organizationId);
  try {
    await deleteSupplier(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  refresh();
  return { ok: true };
}
