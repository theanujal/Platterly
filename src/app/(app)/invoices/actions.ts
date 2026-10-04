"use server";

import { assertInvoiceAtMyLocation, assertOrderAtMyLocation, assertPaymentAtMyLocation } from "@/modules/locations/active-location";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { InvoiceError, cancelInvoice, generateInvoiceFromOrder } from "@/modules/invoices/invoice";
import { sendInvoiceDocument, sendReceiptForPayment } from "@/modules/invoices/invoice-send";
import { PaymentError, confirmPayment, recordPayment, rejectPayment } from "@/modules/payments/payment";
import { createPaymentLink, sendPaymentLink, type PaymentLinkKind } from "@/modules/payments/payment-links";
import type { GstType, PaymentMethod, PaymentType } from "@/generated/prisma/enums";

export type ActionResult<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

const METHODS: PaymentMethod[] = ["UPI", "CARD", "NET_BANKING", "CASH", "BANK_TRANSFER"];
const TYPES: PaymentType[] = ["ADVANCE", "PARTIAL", "FINAL"];

function refresh(orderId?: string, invoiceId?: string) {
  revalidatePath("/invoices");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

async function guarded<T extends object = object>(task: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof InvoiceError || error instanceof PaymentError) return { ok: false, error: error.message };
    throw error;
  }
}

const emailNote = (emailActive: boolean, hasEmail: boolean) =>
  !hasEmail ? "The customer has no email address on file, so nothing was emailed." : emailActive ? "Sent by email." : "Queued, but email is not connected yet, so nothing is delivered until it is.";

export async function createInvoiceAction(orderId: string, input: { gstType: GstType; gstRate: number; dueDate: string }): Promise<ActionResult<{ invoiceId: string }>> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ invoices: ["create"] }, organizationId);
  await assertOrderAtMyLocation(organizationId, session.user.id, orderId);
  return guarded(async () => {
    const invoice = await generateInvoiceFromOrder(organizationId, orderId, {
      gstType: input.gstType === "IGST" ? "IGST" : "CGST_SGST",
      gstRate: Number.isFinite(input.gstRate) ? input.gstRate : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      actorUserId: session.user.id,
    });
    refresh(orderId, invoice.id);
    return { ok: true, invoiceId: invoice.id };
  });
}

export async function sendInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ invoices: ["edit"] }, organizationId);
  await assertInvoiceAtMyLocation(organizationId, session.user.id, invoiceId);
  return guarded(async () => {
    const sent = await sendInvoiceDocument(organizationId, invoiceId, session.user.id);
    refresh(undefined, invoiceId);
    return { ok: true, message: emailNote(sent.emailActive, sent.hasEmail) };
  });
}

export async function cancelInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ invoices: ["delete"] }, organizationId);
  await assertInvoiceAtMyLocation(organizationId, session.user.id, invoiceId);
  return guarded(async () => {
    await cancelInvoice(organizationId, invoiceId, session.user.id);
    refresh(undefined, invoiceId);
    return { ok: true };
  });
}

export interface RecordPaymentFormValues {
  orderId: string;
  invoiceId?: string | null;
  amount: number;
  type: string;
  method: string;
  receivedAt: string;
  reference: string;
  sendReceipt: boolean;
}

export async function recordPaymentAction(input: RecordPaymentFormValues): Promise<ActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ payments: ["create"] }, organizationId);
  await assertOrderAtMyLocation(organizationId, session.user.id, input.orderId);
  if (!TYPES.includes(input.type as PaymentType) || !METHODS.includes(input.method as PaymentMethod)) return { ok: false, error: "Choose a payment type and method." };
  return guarded(async () => {
    const payment = await recordPayment({
      organizationId,
      orderId: input.orderId,
      invoiceId: input.invoiceId ?? null,
      amount: input.amount,
      type: input.type as PaymentType,
      method: input.method as PaymentMethod,
      receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
      reference: input.reference,
      actorUserId: session.user.id,
    });
    let message = "Payment recorded.";
    if (input.sendReceipt) {
      const sent = await sendReceiptForPayment(organizationId, payment.id, session.user.id);
      if (sent) message = `Payment recorded. ${emailNote(sent.emailActive, sent.hasEmail)}`;
    }
    refresh(input.orderId, input.invoiceId ?? undefined);
    return { ok: true, message };
  });
}

export async function confirmPaymentAction(paymentId: string, sendReceipt: boolean): Promise<ActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ payments: ["manage"] }, organizationId);
  await assertPaymentAtMyLocation(organizationId, session.user.id, paymentId);
  return guarded(async () => {
    const payment = await confirmPayment(organizationId, paymentId, session.user.id);
    let message = "Payment confirmed.";
    if (sendReceipt) {
      const sent = await sendReceiptForPayment(organizationId, paymentId, session.user.id);
      if (sent) message = `Payment confirmed. ${emailNote(sent.emailActive, sent.hasEmail)}`;
    }
    refresh(payment.orderId, payment.invoiceId ?? undefined);
    return { ok: true, message };
  });
}

export async function rejectPaymentAction(paymentId: string): Promise<ActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ payments: ["manage"] }, organizationId);
  await assertPaymentAtMyLocation(organizationId, session.user.id, paymentId);
  return guarded(async () => {
    await rejectPayment(organizationId, paymentId, session.user.id);
    refresh();
    return { ok: true };
  });
}

export async function sendReceiptAction(paymentId: string): Promise<ActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ payments: ["manage"] }, organizationId);
  await assertPaymentAtMyLocation(organizationId, session.user.id, paymentId);
  return guarded<object>(async () => {
    const sent = await sendReceiptForPayment(organizationId, paymentId, session.user.id);
    if (!sent) return { ok: false as const, error: "This payment has no receipt yet." };
    return { ok: true as const, message: emailNote(sent.emailActive, sent.hasEmail) };
  });
}

export async function createPaymentLinkAction(input: { orderId: string; invoiceId?: string | null; kind: PaymentLinkKind; amount?: number; send: boolean }): Promise<ActionResult<{ url: string; amount: number }>> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ payments: ["create"] }, organizationId);
  await assertOrderAtMyLocation(organizationId, session.user.id, input.orderId);
  return guarded(async () => {
    const { link, url } = await createPaymentLink({ organizationId, orderId: input.orderId, invoiceId: input.invoiceId ?? null, kind: input.kind, amount: input.amount, actorUserId: session.user.id });
    let message = "Payment link ready.";
    if (input.send) {
      const sent = await sendPaymentLink({ organizationId, orderId: input.orderId, url, amount: Number(link.amount) });
      message = sent.emailActive ? "Payment link sent." : "Payment link queued. Email is not connected yet, so copy the link to share it now.";
    }
    return { ok: true, message, url, amount: Number(link.amount) };
  });
}
