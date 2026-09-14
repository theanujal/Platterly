"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import {
  createQuotation,
  updateQuotation,
  deleteQuotation,
  sendQuotation,
  markQuotationExpired,
  convertQuotationToOrder,
  type QuotationInput,
} from "@/modules/quotations/quotation";
import type { OrderItemCatalogInput } from "@/modules/orders/order";
import type { OrderItemType } from "@/generated/prisma/enums";

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

function buildItems(formData: FormData): OrderItemCatalogInput[] {
  const itemTypes = formData.getAll("itemType").filter((v): v is string => typeof v === "string");
  const catalogIds = formData.getAll("catalogId").filter((v): v is string => typeof v === "string");
  const quantities = formData.getAll("quantity").filter((v): v is string => typeof v === "string");
  return itemTypes.map((itemType, index) => ({
    itemType: itemType as OrderItemType,
    catalogId: catalogIds[index],
    quantity: Number.parseInt(quantities[index] ?? "1", 10) || 1,
  }));
}

function buildInput(formData: FormData): QuotationInput {
  const customerId = stringField(formData, "customerId");
  if (!customerId) throw new Error("A Customer is required.");

  return {
    customerId,
    eventTypeId: stringField(formData, "eventTypeId") ?? null,
    eventStartDate: dateField(formData, "eventStartDate") ?? null,
    eventEndDate: dateField(formData, "eventEndDate") ?? null,
    venue: stringField(formData, "venue"),
    eventAddress: stringField(formData, "eventAddress"),
    validUntil: dateField(formData, "validUntil") ?? null,
    terms: stringField(formData, "terms"),
    notes: stringField(formData, "notes"),
    discount: numberField(formData, "discount") ?? 0,
    taxes: numberField(formData, "taxes") ?? 0,
    additionalCharges: numberField(formData, "additionalCharges") ?? 0,
    deliveryCharges: numberField(formData, "deliveryCharges") ?? 0,
    items: buildItems(formData),
  };
}

export async function createQuotationAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["create"] }, organizationId);
  try {
    const input = buildInput(formData);
    await createQuotation(organizationId, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/quotations");
  return { ok: true };
}

export async function updateQuotationAction(id: string, formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  try {
    const input = buildInput(formData);
    await updateQuotation(organizationId, id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function deleteQuotationAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["delete"] }, organizationId);
  try {
    await deleteQuotation(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/quotations");
  return { ok: true };
}

export async function sendQuotationAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  try {
    await sendQuotation(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function markQuotationExpiredAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  try {
    await markQuotationExpired(organizationId, id, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function convertQuotationToOrderAction(id: string): Promise<ActionResult & { orderId?: string }> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"], orders: ["create"] }, organizationId);
  try {
    const order = await convertQuotationToOrder(organizationId, id, session.user.id);
    revalidatePath(`/quotations/${id}`);
    revalidatePath("/orders");
    return { ok: true, orderId: order.id };
  } catch (error) {
    return toErrorResult(error);
  }
}
