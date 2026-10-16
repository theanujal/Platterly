import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { confirmedPaidForOrder, nextInvoiceNumber, syncInvoiceStatuses } from "@/modules/invoices/invoice";
import { PAYMENT_BLOCKED_TEXT, customerHasApproved, derivePaymentState, round2 } from "./payment-math";
import type { PaymentMethod, PaymentSource, PaymentType } from "@/generated/prisma/enums";

export class PaymentError extends Error {}

/**
 * Re-derives an order's money fields from its CONFIRMED payments. Until an order has one, the
 * values typed on the order form (advance, payment status) stay as they are.
 */
export async function syncOrderPayments(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { total: true } });
  const confirmed = await prisma.payment.count({ where: { orderId, status: "CONFIRMED" } });
  if (confirmed > 0) {
    const paid = await confirmedPaidForOrder(orderId);
    const total = Number(order.total);
    await prisma.order.update({
      where: { id: orderId },
      data: { advance: paid, balance: round2(total - paid), paymentStatus: derivePaymentState(total, paid) },
    });
  }
  await syncInvoiceStatuses(orderId);
}

export async function orderBalance(organizationId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { total: true, orderNumber: true } });
  const paid = await confirmedPaidForOrder(orderId);
  const total = Number(order.total);
  return { total, paid, balance: Math.max(round2(total - paid), 0), orderNumber: order.orderNumber };
}

export interface CustomerPaymentView {
  total: number;
  /** Confirmed by the kitchen. */
  paid: number;
  /** Claimed by the customer (a UPI transaction number) and waiting for the kitchen to match it. */
  awaiting: number;
  balance: number;
  payments: { id: string; amount: number; method: PaymentMethod; type: PaymentType; status: "PENDING" | "CONFIRMED" | "FAILED"; at: string; reference: string }[];
}

/** A reference every payment can be quoted by: what was typed or paid with (UPI transaction number, Razorpay id), else the payment's own short id. */
export function paymentReference(row: { id: string; reference: string | null; razorpayPaymentId: string | null }): string {
  return row.reference?.trim() || row.razorpayPaymentId || `PAY-${row.id.slice(-8).toUpperCase()}`;
}

/** What the customer's link shows about the money on their order: every payment with its state, so a UPI claim is never invisible. */
export async function getCustomerPaymentView(organizationId: string, orderId: string): Promise<CustomerPaymentView> {
  const [order, rows] = await Promise.all([
    prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { total: true } }),
    prisma.payment.findMany({ where: { organizationId, orderId }, orderBy: { receivedAt: "desc" }, take: 20 }),
  ]);
  const sum = (status: string) => round2(rows.filter((row) => row.status === status).reduce((acc, row) => acc + Number(row.amount), 0));
  const total = Number(order.total);
  const paid = await confirmedPaidForOrder(orderId);
  const awaiting = sum("PENDING");
  return {
    total,
    paid,
    awaiting,
    balance: Math.max(round2(total - paid), 0),
    payments: rows.map((row) => ({ id: row.id, amount: Number(row.amount), method: row.method, type: row.type, status: row.status, at: (row.confirmedAt ?? row.receivedAt).toISOString(), reference: paymentReference(row) })),
  };
}

/**
 * The team may take money, or send a payment link, only once the customer has approved the menu and price. Called by the team's
 * Record Payment and Create Payment Link actions; recordPayment itself is not blocked, because Razorpay and UPI payments arrive
 * from the customer's own approval page, and refunds and corrections are not affected.
 */
export async function assertCustomerApproved(organizationId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { status: true } });
  if (!customerHasApproved(order.status)) throw new PaymentError(PAYMENT_BLOCKED_TEXT);
}

export interface RecordPaymentInput {
  organizationId: string;
  orderId: string;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  source?: PaymentSource;
  /** MANUAL and RAZORPAY payments are confirmed on the spot, a UPI QR claim waits for the team. */
  status?: "PENDING" | "CONFIRMED";
  receivedAt?: Date;
  reference?: string;
  note?: string;
  invoiceId?: string | null;
  paymentLinkId?: string | null;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  actorUserId?: string;
}

/** A payment may only be filed under an invoice of the same kitchen and the same order (the id can come from a browser or the API). */
export async function assertInvoiceOfOrder(organizationId: string, orderId: string, invoiceId: string | null | undefined) {
  if (!invoiceId) return;
  if ((await prisma.invoice.count({ where: { id: invoiceId, organizationId, orderId } })) === 0) throw new PaymentError("That invoice doesn't belong to this order.");
}

export async function recordPayment(input: RecordPaymentInput) {
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new PaymentError("Enter an amount greater than zero.");
  const { balance } = await orderBalance(input.organizationId, input.orderId);
  await assertInvoiceOfOrder(input.organizationId, input.orderId, input.invoiceId);
  if (amount > balance + 0.005) throw new PaymentError(`That is more than the balance of ₹${balance.toLocaleString("en-IN")}.`);

  const source = input.source ?? "MANUAL";
  const status = input.status ?? (source === "UPI_QR" ? "PENDING" : "CONFIRMED");
  const payment = await prisma.payment.create({
    data: {
      organizationId: input.organizationId,
      orderId: input.orderId,
      invoiceId: input.invoiceId ?? null,
      paymentLinkId: input.paymentLinkId ?? null,
      amount,
      type: input.type,
      method: input.method,
      source,
      status,
      receivedAt: input.receivedAt ?? new Date(),
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      recordedByUserId: input.actorUserId,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
    },
  });
  if (status === "CONFIRMED") {
    await syncOrderPayments(input.orderId);
    await issueReceipt(input.organizationId, payment.id);
  }
  await audit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "payment.record",
    recordType: "Payment",
    recordId: payment.id,
    after: { amount, status, source, method: input.method },
  });
  return payment;
}

const ADVANCE_METHODS: PaymentMethod[] = ["CASH", "UPI", "CARD", "NET_BANKING", "BANK_TRANSFER"];

/**
 * The advance collected up front, recorded as a real payment (AJ, 2026-10-10) so it shows as paid on the order, the invoice and the
 * receipts, instead of staying a bare number that the first recorded payment would overwrite. "Paid in full" records the whole
 * balance as the final payment. Returns a message when it could not be recorded (the order is already saved), otherwise null.
 */
export async function recordInitialAdvance(
  organizationId: string,
  orderId: string,
  input: { amount: number; paidInFull: boolean; method?: string | null; reference?: string | null },
  actorUserId?: string,
): Promise<string | null> {
  if (input.amount <= 0 && !input.paidInFull) return null;
  try {
    const { balance } = await orderBalance(organizationId, orderId);
    const amount = input.paidInFull ? balance : round2(input.amount);
    if (amount <= 0) return null;
    const method = ADVANCE_METHODS.find((m) => m === input.method) ?? "CASH";
    await recordPayment({
      organizationId,
      orderId,
      amount,
      type: input.paidInFull || amount >= balance - 0.005 ? "FINAL" : "ADVANCE",
      method,
      reference: input.reference ?? undefined,
      actorUserId,
    });
    return null;
  } catch (error) {
    return error instanceof PaymentError ? error.message : "Something went wrong.";
  }
}

const STAGED_TYPES: PaymentType[] = ["ADVANCE", "PARTIAL", "FINAL"];

/** A payment collected on the New Order page, before the order exists; it is recorded when the order is saved (AJ, 2026-10-14). */
export interface StagedPayment {
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  receivedAt?: string;
  reference?: string;
  sendReceipt?: boolean;
}

/** The staged payments as the form sends them (a JSON list). Anything malformed is refused with a message a person can read. */
export function parseStagedPayments(raw: string | null | undefined): StagedPayment[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new PaymentError("The payments on this order could not be read. Please add them again.");
  }
  if (!Array.isArray(list) || list.length > 20) throw new PaymentError("The payments on this order could not be read. Please add them again.");
  return list.map((item) => {
    const row = item as Partial<StagedPayment>;
    const amount = round2(Number(row.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new PaymentError("Enter an amount greater than zero for each payment.");
    if (!STAGED_TYPES.includes(row.type as PaymentType) || !ADVANCE_METHODS.includes(row.method as PaymentMethod)) throw new PaymentError("Choose a payment type and method for each payment.");
    const receivedAt = typeof row.receivedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.receivedAt) ? row.receivedAt : undefined;
    return { amount, type: row.type as PaymentType, method: row.method as PaymentMethod, receivedAt, reference: typeof row.reference === "string" ? row.reference.slice(0, 80) : undefined, sendReceipt: row.sendReceipt === true };
  });
}

/**
 * Records the staged payments on the order just created, in the order they were added, each as a confirmed payment with
 * its receipt. Stops at the first one the order cannot take (more than the balance) and says so; the ones before it stay.
 */
export async function recordStagedPayments(organizationId: string, orderId: string, staged: StagedPayment[], actorUserId?: string) {
  const recorded: { paymentId: string; sendReceipt: boolean }[] = [];
  for (const item of staged) {
    const payment = await recordPayment({
      organizationId,
      orderId,
      amount: item.amount,
      type: item.type,
      method: item.method,
      receivedAt: item.receivedAt ? new Date(item.receivedAt) : undefined,
      reference: item.reference,
      actorUserId,
    });
    recorded.push({ paymentId: payment.id, sendReceipt: item.sendReceipt === true });
  }
  return recorded;
}

/** The kitchen team confirms a UPI payment once it has reached their account. */
export async function confirmPayment(organizationId: string, paymentId: string, actorUserId?: string) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: paymentId, organizationId } });
  if (payment.status === "CONFIRMED") return payment;
  if (payment.status !== "PENDING") throw new PaymentError("Only a payment that is awaiting confirmation can be confirmed.");
  const { balance } = await orderBalance(organizationId, payment.orderId);
  if (Number(payment.amount) > balance + 0.005) throw new PaymentError("Confirming this would take the order past what it owes.");
  const confirmed = await prisma.payment.update({ where: { id: paymentId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  await syncOrderPayments(payment.orderId);
  await issueReceipt(organizationId, paymentId);
  await audit({ organizationId, actorUserId, action: "payment.confirm", recordType: "Payment", recordId: paymentId, after: { amount: Number(payment.amount) } });
  return confirmed;
}

export async function rejectPayment(organizationId: string, paymentId: string, actorUserId?: string) {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id: paymentId, organizationId } });
  if (payment.status !== "PENDING") throw new PaymentError("Only a payment that is awaiting confirmation can be rejected.");
  await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
  await audit({ organizationId, actorUserId, action: "payment.reject", recordType: "Payment", recordId: paymentId });
}

const TYPE_LABEL: Record<PaymentType, string> = { ADVANCE: "Advance", PARTIAL: "Partial payment", FINAL: "Final payment" };
const METHOD_LABEL: Record<PaymentMethod, string> = { UPI: "UPI", CARD: "Card", NET_BANKING: "Net Banking", CASH: "Cash", BANK_TRANSFER: "Bank Transfer" };
export { TYPE_LABEL as PAYMENT_TYPE_LABEL, METHOD_LABEL as PAYMENT_METHOD_LABEL };

/** The receipt for one confirmed payment. Made once; calling again returns the same receipt. */
export async function issueReceipt(organizationId: string, paymentId: string) {
  const existing = await prisma.invoice.findUnique({ where: { receiptForPaymentId: paymentId } });
  if (existing) return existing;
  const payment = await prisma.payment.findFirstOrThrow({
    where: { id: paymentId, organizationId, status: "CONFIRMED" },
    include: { order: { include: { customer: true } } },
  });
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const number = await nextInvoiceNumber(organizationId, "RECEIPT");
  const amount = Number(payment.amount);
  const addressParts = [organization.addressLine1, organization.addressLine2, organization.city, organization.state, organization.postalCode].filter(Boolean);
  return prisma.invoice.create({
    data: {
      organizationId,
      orderId: payment.orderId,
      type: "RECEIPT",
      number,
      status: "PAID",
      issueDate: payment.receivedAt,
      customerName: payment.order.customer.name,
      customerPhone: payment.order.customer.phone,
      customerEmail: payment.order.customer.email,
      businessName: organization.name,
      businessAddress: addressParts.join(", ") || null,
      businessGstNumber: organization.gstNumber,
      taxableValue: amount,
      total: amount,
      receiptForPaymentId: paymentId,
      notes: payment.reference ? `Reference: ${payment.reference}` : null,
      items: {
        create: [
          {
            description: `${TYPE_LABEL[payment.type]} for order ${payment.order.orderNumber ?? "your order"}`,
            detail: `${METHOD_LABEL[payment.method]}, ${payment.receivedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`,
            quantity: 1,
            rate: amount,
            amount,
            sortOrder: 0,
          },
        ],
      },
    },
  });
}

export async function listOrderPayments(organizationId: string, orderId: string) {
  return prisma.payment.findMany({
    where: { organizationId, orderId },
    orderBy: { createdAt: "desc" },
    include: { receipt: { select: { id: true, number: true } } },
  });
}
