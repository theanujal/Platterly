/**
 * The arithmetic of a refund, free of the database. Staff enter the rupees to give back INCLUDING GST (never more than is left of what the customer paid);
 * the GST share is the same share of the refund as of the payment, so the credit note shows what the invoice showed.
 */
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface RefundSplit {
  amount: number;
  gstAmount: number;
  total: number;
}

/** Splits a refund of `refundTotal` (with GST) out of a payment whose `total` and `gstAmount` are known. A full refund gives back exactly the payment's own figures. */
export function splitRefund(payment: { total: number; gstAmount: number }, refundTotal: number): RefundSplit {
  const total = round2(refundTotal);
  const gstAmount = payment.total > 0 ? round2((total * payment.gstAmount) / payment.total) : 0;
  return { amount: round2(total - gstAmount), gstAmount, total };
}

/** What can still be refunded on a payment: what was paid less every refund already issued, never negative. */
export function refundable(paidTotal: number, alreadyRefunded: number): number {
  return Math.max(round2(paidTotal - alreadyRefunded), 0);
}

/** The credit note number: the invoice's pattern with "CN" after the product prefix, so it runs as its own series, for example FPCNAC-26-11-1. */
export const creditNotePrefix = (invoicePrefix: string) => `${invoicePrefix}CN`;

export type RefundState = { status: "PENDING" | "REJECTED" | "PARTIAL" | "REFUNDED"; refunded: number } | null;

/** What the owner sees on a payment: waiting (an open request), fully or partly refunded, or the last request turned down. Nothing when none was asked for. */
export function refundState(input: { total: number; refunded: number; pending: boolean; lastRequest: "PENDING" | "APPROVED" | "REJECTED" | null }): RefundState {
  const refunded = round2(input.refunded);
  if (refunded > 0 && refunded >= input.total) return { status: "REFUNDED", refunded };
  if (input.pending) return { status: "PENDING", refunded };
  if (refunded > 0) return { status: "PARTIAL", refunded };
  if (input.lastRequest === "REJECTED") return { status: "REJECTED", refunded };
  return null;
}

/** A refund can be asked for only within this many days of the payment (AJ, 2026-11-15). Staff may still decide a request later: the window applies to when it was asked. */
export const REFUND_WINDOW_DAYS = 7;

export function withinRefundWindow(paidAt: Date | null, now: Date): boolean {
  return !!paidAt && now.getTime() - paidAt.getTime() <= REFUND_WINDOW_DAYS * 86_400_000;
}
