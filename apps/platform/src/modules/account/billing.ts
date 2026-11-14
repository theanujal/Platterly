import "server-only";
import type { Session } from "@/lib/session";
import { billingAccess } from "@/modules/store/billing-rights";
import { fetchOpsBilling } from "@/modules/store/ops-catalogue";
import { storeKeyFor } from "@/modules/store/products";
import { describeSubscription, type SubscriptionDisplay } from "@/modules/store/status";

/**
 * The Account's Invoices and Payments pages (item 8): one business's billing as Ops holds it, read-only. The business is the signed-in person's own (never
 * named by the request), and Ops is asked only for that one business. Money figures are Ops's; nothing here is worked out again.
 */
export type InvoiceRow = { id: string; productKey: string; product: string; invoiceNumber: string; paidAt: string | null; planName: string; interval: "MONTHLY" | "ANNUAL"; total: number };
export type PaymentRow = { id: string; productKey: string; product: string; at: string; planName: string; interval: "MONTHLY" | "ANNUAL"; total: number; status: "PAID" | "PENDING" | "FAILED"; reason: string | null; invoiceNumber: string | null };
export type SubscriptionRow = {
  productKey: string;
  product: string;
  planName: string | null;
  display: SubscriptionDisplay;
  /** The running subscription's own details (null when there is none), and every subscription the business has had, newest first. */
  current: { status: string; interval: "MONTHLY" | "ANNUAL" | null; startDate: string; trialEndsAt: string | null; currentPeriodEnd: string | null; pendingPlan: string | null; autoPay: { status: "ACTIVE" | "PENDING" | "PAUSED" | "HALTED" | "CANCELLED"; nextChargeAt: string | null } | null } | null;
  history: { id: string; planName: string; status: string; startDate: string; endDate: string | null }[];
};
export type BillingHistory =
  | { status: "ok"; business: { name: string }; subscriptions: SubscriptionRow[]; invoices: InvoiceRow[]; payments: PaymentRow[] }
  | { status: "unauthenticated" | "no_business" | "not_admin" | "unavailable" };

export async function loadBillingHistory(session: Session | null, now: Date = new Date()): Promise<BillingHistory> {
  // Only the business's active Admin sees billing (the Old Admin does not); the business is the signed-in person's own.
  const access = await billingAccess(session);
  if (access.status !== "ok") return { status: access.status };
  const result = await fetchOpsBilling(access.businessId);
  // Ops not knowing the business at all just means it has no billing yet.
  if (!result.ok) return result.reason === "not_found" ? { status: "ok", business: { name: access.businessName }, subscriptions: [], invoices: [], payments: [] } : { status: "unavailable" };

  const subscriptions: SubscriptionRow[] = [];
  const invoices: InvoiceRow[] = [];
  const payments: PaymentRow[] = [];
  for (const p of result.billing.products) {
    const productKey = storeKeyFor(p.productKey);
    const sub = p.billing.subscription;
    subscriptions.push({ productKey, product: p.name, planName: sub?.plan.name ?? null, display: describeSubscription(sub ? { status: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd, cancelledAt: sub.cancelledAt ?? null } : null, now) , current: sub ? { status: sub.status, interval: sub.billingInterval, startDate: sub.startDate, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd, pendingPlan: sub.pending?.planName ?? null, autoPay: sub.autoPay ?? null } : null, history: [...p.billing.history].sort((a, b) => b.startDate.localeCompare(a.startDate)) });
    for (const pay of p.billing.payments) {
      if (pay.invoiceNumber) invoices.push({ id: pay.id, productKey, product: p.name, invoiceNumber: pay.invoiceNumber, paidAt: pay.paidAt, planName: pay.planName, interval: pay.interval, total: pay.total });
      payments.push({ id: pay.id, productKey, product: p.name, at: pay.paidAt ?? "", planName: pay.planName, interval: pay.interval, total: pay.total, status: "PAID", reason: null, invoiceNumber: pay.invoiceNumber });
    }
    for (const a of p.attempts ?? []) payments.push({ id: a.id, productKey, product: p.name, at: a.createdAt, planName: a.planName, interval: a.interval, total: a.total, status: a.status, reason: a.failureReason, invoiceNumber: null });
  }
  const byNewest = (a: { at?: string; paidAt?: string | null }, b: { at?: string; paidAt?: string | null }) => (b.at ?? b.paidAt ?? "").localeCompare(a.at ?? a.paidAt ?? "");
  invoices.sort(byNewest);
  payments.sort(byNewest);
  return { status: "ok", business: { name: access.businessName }, subscriptions, invoices, payments };
}
