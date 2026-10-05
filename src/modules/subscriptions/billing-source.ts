import "server-only";
import type { BillingView, Buyer, CheckoutAnswer, PlanOffer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import type { BillingInterval } from "@/generated/prisma/enums";
import { opsBillingOn } from "@/modules/ops-link/config";
import { opsBilling, opsBillingOk, OpsUnavailableError } from "@/modules/ops-link/billing-client";
import { getEntitlements, limitOf } from "@/modules/ops-link/entitlements";
import { pullSnapshot } from "@/modules/ops-link/pull";
import type { BillingLockReason } from "./billing-math";
import { getBillingState, listSellablePlans, listSubscriptionPayments, onlineBillingAvailable as localOnlineBilling, scheduleDowngrade as localSchedule, cancelScheduledDowngrade as localCancel, startSubscriptionCheckout, verifySubscriptionCheckout, type SellablePlan } from "./billing";
import { getCurrentSubscription, listSubscriptionHistory } from "./subscription";
import type { InvoiceSnapshot } from "./invoice-snapshot";

/**
 * Where the owner-facing billing screens (the lock screen, Settings -> Subscription, the invoice PDFs) get their data.
 * With OPS_BILLING off (the default) it is catering's own plan and payment rows, exactly as before. With it on, Platterly Ops
 * holds the plans, the subscription and the money, and this asks ops over the signed billing API (docs/ops-contract.md 8.1).
 * The screens see one shape either way, so there is one page to test, not two.
 */
export interface SubscriptionView {
  id: string;
  status: string;
  planId: string;
  planName: string;
  priceMonthly: number | null;
  priceAnnual: number | null;
  currency: string;
  limits: { maxUsers: number | null; maxEvents: number | null; maxOrders: number | null };
  startDate: Date;
  endDate: Date | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  billingInterval: BillingInterval | null;
  pendingPlanId: string | null;
  pendingPlanName: string | null;
  pendingInterval: BillingInterval | null;
}

export interface PaymentView {
  id: string;
  planName: string;
  interval: BillingInterval;
  total: number;
  gstAmount: number;
  paidAt: Date | null;
  invoiceNumber: string | null;
}

export interface PaymentInvoice {
  invoiceNumber: string;
  paidAt: Date;
  planName: string;
  interval: BillingInterval;
  periodStart: Date | null;
  periodEnd: Date | null;
  razorpayPaymentId: string | null;
  amount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  snapshot: InvoiceSnapshot;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

export const onlineBillingAvailable = () => localOnlineBilling();

type PlanLimit = "maxUsers" | "maxEvents" | "maxOrders";

/* ---------- catering's own rows (the default) ---------- */

type Row = NonNullable<Awaited<ReturnType<typeof getCurrentSubscription>>>;

async function fromRow(row: Row | null): Promise<SubscriptionView | null> {
  if (!row) return null;
  const pending = row.pendingPlanId ? await prisma.subscriptionPlan.findUnique({ where: { id: row.pendingPlanId }, select: { name: true } }) : null;
  const plan = row.subscriptionPlan;
  return {
    id: row.id,
    status: row.status,
    planId: row.subscriptionPlanId,
    planName: plan.name,
    priceMonthly: num(plan.priceMonthly),
    priceAnnual: num(plan.priceAnnual),
    currency: plan.currency,
    limits: { maxUsers: plan.maxUsers, maxEvents: plan.maxEvents, maxOrders: plan.maxOrders },
    startDate: row.startDate,
    endDate: row.endDate,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    billingInterval: row.billingInterval,
    pendingPlanId: row.pendingPlanId,
    pendingPlanName: pending?.name ?? null,
    pendingInterval: row.pendingInterval,
  };
}

/* ---------- Platterly Ops ---------- */

const toPlan = (offer: PlanOffer): SellablePlan => ({ id: offer.id, name: offer.name, description: offer.description, highlights: offer.highlights, monthly: offer.monthly, annual: offer.annual, priceMonthly: offer.monthly.amount });

async function businessIdOf(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { businessId: true } });
  return org.businessId;
}

const base = (businessId: string) => `/businesses/${businessId}/billing`;

async function buyerOf(organizationId: string): Promise<Buyer> {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return { name: o.name === "Unnamed Business" ? "Business" : o.name, addressLine1: o.addressLine1, addressLine2: o.addressLine2, city: o.city, state: o.state, postalCode: o.postalCode, country: o.country, gstin: o.gstNumber };
}

async function opsSubscriptionView(view: BillingView["subscription"], plans: SellablePlan[], organizationId: string): Promise<SubscriptionView | null> {
  if (!view) return null;
  const entitlements = await getEntitlements(organizationId);
  const offer = plans.find((p) => p.id === view.plan.id);
  const limit = (key: PlanLimit) => limitOf(entitlements, key) ?? null;
  return {
    id: view.id,
    status: view.status,
    planId: view.plan.id,
    planName: view.plan.name,
    priceMonthly: offer?.monthly.amount ?? null,
    priceAnnual: offer?.annual?.amount ?? null,
    currency: "INR",
    limits: { maxUsers: limit("maxUsers"), maxEvents: limit("maxEvents"), maxOrders: limit("maxOrders") },
    startDate: new Date(view.startDate),
    endDate: null,
    trialEndsAt: date(view.trialEndsAt),
    currentPeriodEnd: date(view.currentPeriodEnd),
    billingInterval: view.billingInterval,
    pendingPlanId: view.pending?.planId ?? null,
    pendingPlanName: view.pending?.planName ?? null,
    pendingInterval: view.pending?.interval ?? null,
  };
}

/* ---------- what the screens ask for ---------- */

export interface SubscribeData {
  plans: SellablePlan[];
  subscription: SubscriptionView | null;
  locked: boolean;
  lockReason: BillingLockReason | null;
  onlineBilling: boolean;
  /** Ops could not be reached: the page says so instead of showing plans it could not load. */
  unavailable: boolean;
}

export async function getSubscribeData(organizationId: string): Promise<SubscribeData> {
  if (!opsBillingOn()) {
    const [state, plans] = await Promise.all([getBillingState(organizationId), listSellablePlans()]);
    return { plans, subscription: await fromRow(state.subscription), locked: state.locked, lockReason: state.lockReason, onlineBilling: localOnlineBilling(), unavailable: false };
  }
  const entitlements = await getEntitlements(organizationId);
  try {
    const businessId = await businessIdOf(organizationId);
    const [{ plans: offers }, view] = await Promise.all([opsBillingOk<{ plans: PlanOffer[] }>("GET", "/billing/plans"), opsBillingOk<BillingView>("GET", base(businessId))]);
    const plans = offers.map(toPlan);
    return { plans, subscription: await opsSubscriptionView(view.subscription, plans, organizationId), locked: entitlements.locked, lockReason: entitlements.lockReason, onlineBilling: view.onlineBillingAvailable, unavailable: false };
  } catch (error) {
    if (!(error instanceof OpsUnavailableError) && !(error instanceof ValidationError)) throw error;
    return { plans: [], subscription: null, locked: entitlements.locked, lockReason: entitlements.lockReason, onlineBilling: false, unavailable: true };
  }
}

export interface SubscriptionPageData {
  unavailable: boolean;
  current: SubscriptionView | null;
  history: SubscriptionView[];
  payments: PaymentView[];
  /** The history rows' own invoice (a PDF made from the row) exists only for catering's own rows; ops lists real payments instead. */
  historyInvoices: boolean;
}

export async function getSubscriptionPageData(organizationId: string): Promise<SubscriptionPageData> {
  if (!opsBillingOn()) {
    const [current, rows, payments] = await Promise.all([getCurrentSubscription(organizationId), listSubscriptionHistory(organizationId), listSubscriptionPayments(organizationId)]);
    return {
      unavailable: false,
      current: await fromRow(current),
      history: (await Promise.all(rows.map((r) => fromRow(r as Row)))).filter((r): r is SubscriptionView => r !== null),
      payments: payments.map((p) => ({ id: p.id, planName: p.subscriptionPlan.name, interval: p.interval, total: Number(p.total), gstAmount: Number(p.gstAmount), paidAt: p.paidAt, invoiceNumber: p.invoiceNumber })),
      historyInvoices: true,
    };
  }
  try {
    const businessId = await businessIdOf(organizationId);
    const [{ plans: offers }, view] = await Promise.all([opsBillingOk<{ plans: PlanOffer[] }>("GET", "/billing/plans"), opsBillingOk<BillingView>("GET", base(businessId))]);
    const plans = offers.map(toPlan);
    const current = await opsSubscriptionView(view.subscription, plans, organizationId);
    const gst = (total: number, planName: string) => {
      const plan = offers.find((o) => o.name === planName);
      return plan ? Math.round((total - total / (1 + plan.monthly.gstPercent / 100)) * 100) / 100 : 0;
    };
    return {
      unavailable: false,
      current,
      history: view.history.map((h) => ({
        id: h.id, status: h.status, planId: "", planName: h.planName, priceMonthly: null, priceAnnual: null, currency: "INR", limits: { maxUsers: null, maxEvents: null, maxOrders: null },
        startDate: new Date(h.startDate), endDate: date(h.endDate), trialEndsAt: null, currentPeriodEnd: null, billingInterval: null, pendingPlanId: null, pendingPlanName: null, pendingInterval: null,
      })),
      payments: view.payments.map((p) => ({ id: p.id, planName: p.planName, interval: p.interval, total: p.total, gstAmount: gst(p.total, p.planName), paidAt: date(p.paidAt), invoiceNumber: p.invoiceNumber })),
      historyInvoices: false,
    };
  } catch (error) {
    if (!(error instanceof OpsUnavailableError) && !(error instanceof ValidationError)) throw error;
    return { unavailable: true, current: null, history: [], payments: [], historyInvoices: false };
  }
}

/* ---------- actions ---------- */

export async function startCheckout(organizationId: string, planId: string, interval: BillingInterval, actorUserId: string): Promise<CheckoutAnswer> {
  if (!opsBillingOn()) return startSubscriptionCheckout(organizationId, planId, interval, actorUserId);
  const businessId = await businessIdOf(organizationId);
  return opsBillingOk<CheckoutAnswer>("POST", `${base(businessId)}/checkout`, { planId, interval, buyer: await buyerOf(organizationId) });
}

export async function verifyCheckout(organizationId: string, params: { razorpayOrderId: string; razorpayPaymentId: string; signature: string }) {
  if (!opsBillingOn()) return verifySubscriptionCheckout(organizationId, params);
  const businessId = await businessIdOf(organizationId);
  await opsBillingOk("POST", `${base(businessId)}/verify`, params);
  // Ops pushes the new snapshot too, but asking for it now lifts the lock the moment the owner has paid.
  await pullSnapshot(organizationId, businessId);
}

export async function scheduleDowngrade(organizationId: string, planId: string, interval: BillingInterval, actorUserId: string) {
  if (!opsBillingOn()) return localSchedule(organizationId, planId, interval, actorUserId);
  await opsBillingOk("POST", `${base(await businessIdOf(organizationId))}/downgrade`, { planId, interval });
}

export async function cancelScheduledDowngrade(organizationId: string, actorUserId: string) {
  if (!opsBillingOn()) return localCancel(organizationId, actorUserId);
  await opsBillingOk("DELETE", `${base(await businessIdOf(organizationId))}/downgrade`);
}

/** The frozen invoice for one paid payment, from catering's own rows or from ops. Null when it is not this kitchen's or not paid. */
export async function getPaymentInvoice(organizationId: string, paymentId: string): Promise<PaymentInvoice | null> {
  if (!opsBillingOn()) {
    const payment = await prisma.subscriptionPayment.findFirst({ where: { id: paymentId, organizationId, status: "PAID" }, include: { subscriptionPlan: true } });
    const snapshot = payment?.invoiceSnapshot as InvoiceSnapshot | null | undefined;
    if (!payment || !snapshot || !payment.invoiceNumber || !payment.paidAt) return null;
    return { invoiceNumber: payment.invoiceNumber, paidAt: payment.paidAt, planName: payment.subscriptionPlan.name, interval: payment.interval, periodStart: payment.periodStart, periodEnd: payment.periodEnd, razorpayPaymentId: payment.razorpayPaymentId, amount: Number(payment.amount), gstPercent: Number(payment.gstPercent), gstAmount: Number(payment.gstAmount), total: Number(payment.total), snapshot };
  }
  const businessId = await businessIdOf(organizationId);
  const { status, json } = await opsBilling<{
    invoiceNumber: string; planName: string; interval: BillingInterval; amount: number; gstPercent: number; gstAmount: number; total: number; paidAt: string | null; periodStart: string | null; periodEnd: string | null; razorpayPaymentId?: string | null; snapshot: InvoiceSnapshot;
  }>("GET", `${base(businessId)}/payments/${encodeURIComponent(paymentId)}`);
  if (status === 404) return null;
  if (status !== 200 || !json.paidAt) throw new OpsUnavailableError();
  return { invoiceNumber: json.invoiceNumber, paidAt: new Date(json.paidAt), planName: json.planName, interval: json.interval, periodStart: date(json.periodStart), periodEnd: date(json.periodEnd), razorpayPaymentId: json.razorpayPaymentId ?? null, amount: json.amount, gstPercent: json.gstPercent, gstAmount: json.gstAmount, total: json.total, snapshot: json.snapshot };
}
