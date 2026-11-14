import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notifySafely } from "@/modules/notifications/notifications";
import { tellOwner } from "@/modules/messages/messages";
import { issueSnapshot } from "@/modules/snapshots/issue";
import { BillingError } from "./billing-error";
import { cancelSubscription, stopAutoPay } from "./billing";
import { formatInvoiceNumber } from "./math";
import { nextCreditNoteNumber } from "./numbering";
import { refundRazorpayPayment, platformRazorpay, type PlatformRazorpay } from "./razorpay";
import { creditNotePrefix, refundable, splitRefund, withinRefundWindow, REFUND_WINDOW_DAYS } from "./refund-math";

/**
 * Refunds (AJ, 2026-11-14): the Business Admin REQUESTS one for a paid payment, Platterly staff APPROVE it in Ops and set the amount (up to what is left of what was
 * paid) and what happens to the plan. Approving refunds the customer through Razorpay, then records the refund with its credit note number. Applying `endMode` to the
 * subscription happens here too, after the money has moved.
 */
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const newId = (prefix: string) => `${prefix}_${randomBytes(16).toString("hex")}`;

const alreadyRefunded = async (paymentId: string) => Number((await prisma.refund.aggregate({ where: { paymentId }, _sum: { total: true } }))._sum.total ?? 0);

export async function requestRefund(input: { paymentId: string; businessId: string; productKey?: string; requestedBy?: string | null; reason: string; now?: Date }) {
  const reason = input.reason.trim();
  if (!reason) throw new BillingError("Tell us why you are asking for a refund.");
  if (reason.length > 1000) throw new BillingError("The reason can be at most 1000 characters.");
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: input.paymentId } });
  if (!payment || payment.businessId !== input.businessId || (input.productKey && payment.productKey !== input.productKey)) throw new BillingError("That payment was not found.");
  if (payment.status !== "PAID" || !payment.razorpayPaymentId) throw new BillingError("Only a paid payment can be refunded.");
  if (!withinRefundWindow(payment.paidAt, input.now ?? new Date())) throw new BillingError(`Refunds can only be requested within ${REFUND_WINDOW_DAYS} days of the payment.`);
  if (payment.importedFrom) throw new BillingError("This payment was made before the move to Platterly and cannot be refunded here. Please contact us.");
  if (refundable(Number(payment.total), await alreadyRefunded(payment.id)) <= 0) throw new BillingError("This payment has already been refunded in full.");
  try {
    const request = await prisma.refundRequest.create({ data: { id: newId("rfr"), paymentId: payment.id, businessId: payment.businessId, requestedBy: input.requestedBy ?? null, reason } });
    await audit({ actorUserId: null, action: "refund.requested", subject: request.id, detail: { paymentId: payment.id, businessId: payment.businessId } });
    await notifySafely({ productKey: payment.productKey, businessId: payment.businessId, kind: "refund.requested", severity: "WARNING", title: "A refund was requested", body: `Rs ${Number(payment.total).toFixed(2)} paid ${payment.paidAt?.toISOString().slice(0, 10) ?? ""}: ${reason.slice(0, 200)}`, link: "/refunds", dedupeKey: `refund_requested:${request.id}` });
    return request;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BillingError("A refund request for this payment is already waiting for a decision.");
    throw error;
  }
}

export async function rejectRefund(input: { requestId: string; note?: string | null; actorUserId: string | null }) {
  const note = input.note?.trim() || null;
  const done = await prisma.refundRequest.updateMany({ where: { id: input.requestId, status: "PENDING" }, data: { status: "REJECTED", decidedBy: input.actorUserId, decidedAt: new Date(), rejectionNote: note } });
  if (done.count === 0) throw new BillingError("This request is not waiting for a decision.");
  await audit({ actorUserId: input.actorUserId, action: "refund.rejected", subject: input.requestId, detail: { note } });
  const request = await prisma.refundRequest.findUnique({ where: { id: input.requestId }, include: { payment: { select: { productKey: true } } } });
  if (request) await tellOwner({ businessId: request.businessId, productKey: request.payment.productKey, template: "refund_declined", variables: note ? { note } : {}, dedupeKey: `refund:${request.id}:declined` });
}

/**
 * Approves a request: checks the amount against what is left, refunds through Razorpay FIRST (so a failed refund leaves nothing recorded and the request still
 * PENDING), then in one transaction takes the credit note number, records the refund and closes the request. Money moves before the record, never the other way round.
 */
export async function approveRefund(
  input: { requestId: string; totalRupees: number; endMode: "END_NOW" | "KEEP_TO_PERIOD_END"; actorUserId: string | null; now?: Date },
  fetchImpl: typeof fetch = fetch,
  credsOverride?: PlatformRazorpay,
) {
  const request = await prisma.refundRequest.findUnique({ where: { id: input.requestId }, include: { payment: { include: { business: true } } } });
  if (!request || request.status !== "PENDING") throw new BillingError("This request is not waiting for a decision.");
  const { payment } = request;
  const left = refundable(Number(payment.total), await alreadyRefunded(payment.id));
  const total = round2(input.totalRupees);
  if (!(total > 0)) throw new BillingError("Enter an amount to refund.");
  if (total > left) throw new BillingError(`The most that can be refunded on this payment is Rs ${left.toFixed(2)}.`);
  if (!payment.razorpayPaymentId) throw new BillingError("This payment has no Razorpay payment to refund.");
  const creds = credsOverride ?? platformRazorpay();
  if (!creds) throw new BillingError("Razorpay is not switched on yet.");

  const split = splitRefund({ total: Number(payment.total), gstAmount: Number(payment.gstAmount) }, total);
  const razorpay = await refundRazorpayPayment(creds, payment.razorpayPaymentId, Math.round(total * 100), fetchImpl);

  const now = input.now ?? new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.refundRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "APPROVED", decidedBy: input.actorUserId, decidedAt: now } });
      if (claimed.count === 0) throw new BillingError("This request was already decided.");
      const product = await tx.product.findUnique({ where: { key: payment.productKey }, select: { invoicePrefix: true } });
      const n = await nextCreditNoteNumber(tx, payment.productKey);
      const creditNoteNumber = formatInvoiceNumber(creditNotePrefix(product?.invoicePrefix ?? "P"), payment.business.name, now, n);
      return tx.refund.create({
        data: { id: newId("rf"), requestId: request.id, paymentId: payment.id, amount: split.amount, gstAmount: split.gstAmount, total: split.total, endMode: input.endMode, razorpayRefundId: razorpay.id, creditNoteNumber, decidedBy: input.actorUserId, issuedAt: now },
      });
    }).then(async (refund) => {
      await audit({ actorUserId: input.actorUserId, action: "refund.approved", subject: request.id, detail: { paymentId: payment.id, total: split.total, endMode: input.endMode, creditNoteNumber: refund.creditNoteNumber, razorpayRefundId: razorpay.id } });
      await applyEndMode({ businessId: payment.businessId, productKey: payment.productKey }, input.endMode, now);
      await tellOwner({ businessId: payment.businessId, productKey: payment.productKey, template: "refund_approved", variables: { amount: split.total, creditNoteNumber: refund.creditNoteNumber, endMode: input.endMode }, dedupeKey: `refund:${request.id}:approved` });
      return refund;
    });
  } catch (error) {
    // The customer has been refunded but the record failed: say so loudly so staff reconcile it by hand with the Razorpay refund id.
    console.error("[ops refund] Razorpay refunded but recording failed", { requestId: request.id, razorpayRefundId: razorpay.id }, error);
    throw error;
  }
}

/**
 * What approval does to the plan (staff chose): END_NOW locks the kitchen at once and stops auto-pay (the same lock the 7-day grace ends in); KEEP_TO_PERIOD_END stops the
 * renewal and leaves the paid days running. The refund is already paid and recorded, so a problem here is logged for staff and never undoes it.
 */
async function applyEndMode(scope: { businessId: string; productKey: string }, endMode: "END_NOW" | "KEEP_TO_PERIOD_END", now: Date) {
  try {
    const sub = await prisma.subscription.findFirst({ where: { ...scope, endDate: null } });
    if (!sub || sub.status !== "ACTIVE") return;
    if (endMode === "KEEP_TO_PERIOD_END") return await cancelSubscription(scope.businessId, scope.productKey, now);
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "LOCKED", ...(sub.razorpaySubscriptionId ? { autoPay: "CANCELLED" as const } : {}) } });
    if (sub.razorpaySubscriptionId && sub.autoPay !== "CANCELLED") await stopAutoPay({ ...scope, razorpaySubscriptionId: sub.razorpaySubscriptionId }, false);
    await audit({ actorUserId: null, action: "subscription.locked", subject: scope.businessId, detail: { productKey: scope.productKey, subscriptionId: sub.id, reason: "refund" } });
    await issueSnapshot(scope.businessId, scope.productKey, now);
  } catch (error) {
    console.error("[ops refund] refund recorded but the plan change failed", scope, error);
    await notifySafely({ productKey: scope.productKey, businessId: scope.businessId, kind: "refund.plan_change_failed", severity: "WARNING", title: "A refund was issued but the plan was not changed", body: `Staff chose "${endMode}". Change the plan by hand.`, link: `/businesses/${scope.businessId}` });
  }
}

/** The open requests (oldest first) with what each payment was and how much of it can still be refunded, for the Refunds page. */
export async function listRefundQueue() {
  const rows = await prisma.refundRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { payment: { include: { plan: { select: { name: true } }, product: { select: { name: true } }, business: { select: { id: true, name: true, ownerEmail: true } }, refunds: { select: { total: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    createdAt: r.createdAt,
    business: r.payment.business,
    productName: r.payment.product.name,
    planName: r.payment.plan.name,
    interval: r.payment.interval,
    paymentId: r.payment.id,
    invoiceNumber: r.payment.invoiceNumber,
    paidAt: r.payment.paidAt,
    total: Number(r.payment.total),
    refundable: refundable(Number(r.payment.total), r.payment.refunds.reduce((sum, x) => sum + Number(x.total), 0)),
  }));
}

/** The decided requests, newest first, with the refund (and its credit note) when one was issued. */
export async function listRefundHistory(take = 50) {
  const rows = await prisma.refundRequest.findMany({
    where: { status: { not: "PENDING" } },
    orderBy: { decidedAt: "desc" },
    take,
    include: { refund: true, payment: { select: { business: { select: { id: true, name: true } }, product: { select: { name: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    decidedAt: r.decidedAt,
    rejectionNote: r.rejectionNote,
    business: r.payment.business,
    productName: r.payment.product.name,
    refund: r.refund && { id: r.refund.id, total: Number(r.refund.total), creditNoteNumber: r.refund.creditNoteNumber, endMode: r.refund.endMode },
  }));
}
