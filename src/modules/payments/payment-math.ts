// Client-safe: the rules for what an order owes and what each payment kind means.
import { todayStartInZone } from "@/lib/time/timezone";
export type OrderPaymentState = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export function derivePaymentState(total: number, confirmedPaid: number): OrderPaymentState {
  if (total > 0 && confirmedPaid + 0.005 >= total) return "PAID";
  return confirmedPaid > 0 ? "PARTIALLY_PAID" : "UNPAID";
}

/** Midnight (UTC) of today's calendar day in the business's time zone (India unless it chose another): event dates are stored as UTC midnight of their day, so this compares like with like. */
export const tenantTodayStart = todayStartInZone;

/**
 * Overdue (AJ, 2026-10-12): calculated, never stored. An order is overdue when money is still owed (Unpaid or
 * Partially Paid), its event has ended (the last day, `eventEndDate`, is before today in India) and it is not cancelled.
 */
export function isPaymentOverdue(order: { status: string; paymentStatus: OrderPaymentState; eventEndDate: Date }, now: Date, timeZone?: string): boolean {
  if (order.status === "CANCELLED" || order.paymentStatus === "PAID") return false;
  return order.eventEndDate.getTime() < tenantTodayStart(now, timeZone).getTime();
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The Advance option: a percentage of the order total, never more than what is still owed. */
export function advanceAmount(total: number, confirmedPaid: number, percent: number): number {
  const balance = Math.max(round2(total - confirmedPaid), 0);
  return Math.min(round2((total * percent) / 100), balance);
}

export function paymentTypeFor(amount: number, total: number, confirmedPaid: number): "ADVANCE" | "PARTIAL" | "FINAL" {
  if (amount + 0.005 >= round2(total - confirmedPaid)) return confirmedPaid > 0 ? "FINAL" : "ADVANCE";
  return confirmedPaid > 0 ? "PARTIAL" : "ADVANCE";
}

/** Razorpay's payment.method values mapped to ours; anything unknown stays UPI-like generic. */
export function paymentMethodForRazorpay(method: string): "UPI" | "CARD" | "NET_BANKING" | "BANK_TRANSFER" {
  switch (method) {
    case "card":
      return "CARD";
    case "netbanking":
      return "NET_BANKING";
    case "bank_transfer":
    case "emandate":
      return "BANK_TRANSFER";
    default:
      return "UPI";
  }
}
