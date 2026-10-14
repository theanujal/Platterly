"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { assertPurchaseOrderAtMyLocationById, getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createPurchaseOrder, updatePurchaseOrder, markOrdered, cancelPurchaseOrder, deletePurchaseOrder, receiveStock } from "@/modules/purchasing/purchase-order";
import { recordSupplierPayment, deleteSupplierPayment } from "@/modules/purchasing/supplier-payment";
import type { PaymentMethod } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: userMessage(error, "Something went wrong.") };
}

export interface PurchaseOrderPayload {
  supplierId: string;
  notes: string;
  items: { inventoryId: string; quantity: number }[];
}

function toInput(payload: PurchaseOrderPayload) {
  return { supplierId: payload.supplierId, notes: payload.notes, items: payload.items };
}

function refresh(id?: string) {
  revalidatePath("/purchasing");
  if (id) revalidatePath(`/purchasing/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/suppliers");
  revalidatePath("/dashboard");
}

export async function createPurchaseOrderAction(payload: PurchaseOrderPayload): Promise<CreateResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  try {
    // A new order is for the location the person is working in (the owner's switcher, or their own); none = all locations.
    const { locationId } = await getActiveLocation(organizationId, session.user.id);
    const po = await createPurchaseOrder(organizationId, { ...toInput(payload), locationId }, session.user.id);
    refresh();
    return { ok: true, id: po.id };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePurchaseOrderAction(id: string, payload: PurchaseOrderPayload): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertPurchaseOrderAtMyLocationById(organizationId, session.user.id, id);
  try {
    await updatePurchaseOrder(organizationId, id, toInput(payload), session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { ok: true };
}

export async function markOrderedAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertPurchaseOrderAtMyLocationById(organizationId, session.user.id, id);
  try {
    await markOrdered(organizationId, id, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { ok: true };
}

export async function cancelPurchaseOrderAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertPurchaseOrderAtMyLocationById(organizationId, session.user.id, id);
  try {
    await cancelPurchaseOrder(organizationId, id, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { ok: true };
}

export async function deletePurchaseOrderAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["delete"] }, organizationId);
  await assertPurchaseOrderAtMyLocationById(organizationId, session.user.id, id);
  try {
    await deletePurchaseOrder(organizationId, id, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh();
  return { ok: true };
}

export interface ReceiptPayload {
  /** Made when the drawer opens, so a retry of the same submission adds nothing. */
  idempotencyKey: string;
  /** YYYY-MM-DD. */
  receivedDate: string;
  invoiceNumber: string;
  notes: string;
  lines: { itemId: string; quantity: number; unitCost: number; costNote: string; extraReason: string; /** YYYY-MM-DD or empty. */ expiryDate: string; lotNumber: string }[];
}

const asDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(Number.NaN));

export async function receiveStockAction(id: string, payload: ReceiptPayload): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  await assertPurchaseOrderAtMyLocationById(organizationId, session.user.id, id);
  try {
    await receiveStock(
      organizationId,
      id,
      {
        idempotencyKey: payload.idempotencyKey,
        receivedDate: asDate(payload.receivedDate),
        invoiceNumber: payload.invoiceNumber,
        notes: payload.notes,
        lines: payload.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost, costNote: l.costNote, extraReason: l.extraReason, expiryDate: l.expiryDate ? asDate(l.expiryDate) : null, lotNumber: l.lotNumber })),
      },
      session.user.id,
    );
  } catch (error) {
    return fail(error);
  }
  refresh(id);
  return { ok: true };
}

const METHODS: PaymentMethod[] = ["UPI", "CARD", "NET_BANKING", "CASH", "BANK_TRANSFER"];

export async function recordSupplierPaymentAction(supplierId: string, form: { amount: number; paidAt: string; method: string; note: string }): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  try {
    await recordSupplierPayment(
      organizationId,
      supplierId,
      { amount: form.amount, paidAt: new Date(form.paidAt), method: METHODS.includes(form.method as PaymentMethod) ? (form.method as PaymentMethod) : null, note: form.note },
      session.user.id,
    );
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

export async function deleteSupplierPaymentAction(supplierId: string, paymentId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["delete"] }, organizationId);
  try {
    await deleteSupplierPayment(organizationId, paymentId, session.user.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}
