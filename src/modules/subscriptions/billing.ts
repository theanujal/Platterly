import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ValidationError } from "@/lib/errors";
import type { BillingInterval } from "@/generated/prisma/enums";
import { createRazorpayOrder, verifyCheckoutSignature } from "@/modules/payments/razorpay";
import { onPlanChanged } from "@/modules/notifications/triggers";
import { billingLockReason, periodEndFrom, priceBreakdown, type PriceBreakdown } from "./billing-math";
import { getCurrentSubscription } from "./subscription";
import type { Prisma } from "@/generated/prisma/client";
import type { InvoiceSnapshot } from "./invoice-snapshot";
import { formatInvoiceNumber } from "./invoice-number";
import { gstKind, gstLines } from "./gst-split";
import { getPlatformBillingProfile } from "./platform-billing";

/**
 * Chunk 20: a kitchen pays Platterly for its plan. Unlike Chunk 14 (where a customer pays the kitchen with the
 * kitchen's own keys), this uses PLATTERLY's own Razorpay account, read from the environment:
 * RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET. Until those are set, checkout answers with a plain
 * "not switched on yet" message and nothing else changes.
 *
 * Each payment buys one period (30 days or a year) and is one Razorpay order, so a renewal is the kitchen paying
 * again, not an automatic debit. A paid period that runs out locks the kitchen (see `getBillingState`).
 */

export class BillingError extends ValidationError {}

export interface PlatformRazorpay {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export function platformRazorpay(): PlatformRazorpay | null {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_WEBHOOK_SECRET: webhookSecret } = process.env;
  return keyId && keySecret ? { keyId, keySecret, webhookSecret: webhookSecret ?? "" } : null;
}

export const onlineBillingAvailable = () => platformRazorpay() !== null;

export async function getBillingState(organizationId: string, now: Date = new Date()) {
  const subscription = await getCurrentSubscription(organizationId);
  const lockReason = billingLockReason(subscription, now);
  return { subscription, lockReason, locked: lockReason !== null };
}

/** The paid plans a kitchen can choose from: active, not the trial, with a monthly price set by the Super Admin. */
export async function listSellablePlans() {
  const plans = await prisma.subscriptionPlan.findMany({ where: { isActive: true, isTrial: false, priceMonthly: { not: null } }, orderBy: { priceMonthly: "asc" } });
  return plans.map((plan) => {
    const gst = Number(plan.gstPercent);
    const monthly = priceBreakdown(Number(plan.priceMonthly), gst);
    const annual = plan.priceAnnual === null ? null : priceBreakdown(Number(plan.priceAnnual), gst);
    return { id: plan.id, name: plan.name, description: plan.description, highlights: plan.highlights, monthly, annual, priceMonthly: Number(plan.priceMonthly) };
  });
}
export type SellablePlan = Awaited<ReturnType<typeof listSellablePlans>>[number];

export function priceFor(plan: SellablePlan, interval: BillingInterval): PriceBreakdown {
  const breakdown = interval === "ANNUAL" ? plan.annual : plan.monthly;
  if (!breakdown) throw new BillingError("This plan is not sold yearly.");
  return breakdown;
}

/** Starts a Razorpay Checkout for one period of a plan. A PENDING payment is written first so the webhook can find it. */
export async function startSubscriptionCheckout(organizationId: string, planId: string, interval: BillingInterval, actorUserId: string) {
  const creds = platformRazorpay();
  if (!creds) throw new BillingError("Online payment is not switched on yet. Please contact Platterly.");
  const plan = (await listSellablePlans()).find((candidate) => candidate.id === planId);
  if (!plan) throw new BillingError("That plan is not available.");
  const price = priceFor(plan, interval);

  const { razorpayOrderId } = await createRazorpayOrder(
    { ...creds, webhookSecret: creds.webhookSecret },
    { amountRupees: price.total, receipt: `sub-${organizationId.slice(0, 20)}`, notes: { organizationId, planId, interval } },
  );
  const payment = await prisma.subscriptionPayment.create({
    data: { organizationId, subscriptionPlanId: planId, interval, amount: price.amount, gstPercent: price.gstPercent, gstAmount: price.gstAmount, total: price.total, razorpayOrderId },
  });
  await audit({ organizationId, actorUserId, action: "subscription.checkout_started", recordType: "SubscriptionPayment", recordId: payment.id, after: { planId, interval, total: price.total } });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  return { keyId: creds.keyId, razorpayOrderId, amountPaise: Math.round(price.total * 100), businessName: org.name, description: `${plan.name} plan, ${interval === "ANNUAL" ? "1 year" : "30 days"}` };
}

/** Checkout's own signature check, then the same confirmation the webhook does. Only the caller's own payment counts. */
export async function verifySubscriptionCheckout(organizationId: string, params: { razorpayOrderId: string; razorpayPaymentId: string; signature: string }) {
  const creds = platformRazorpay();
  if (!creds || !verifyCheckoutSignature(params, creds.keySecret)) throw new BillingError("We could not verify this payment.");
  const payment = await prisma.subscriptionPayment.findUnique({ where: { razorpayOrderId: params.razorpayOrderId } });
  if (!payment || payment.organizationId !== organizationId) throw new BillingError("We could not verify this payment.");
  await confirmSubscriptionPayment(params.razorpayOrderId, params.razorpayPaymentId);
}

/**
 * Razorpay says the payment was captured (checkout verification or webhook, whichever comes first). Safe to call
 * twice: only the call that flips PENDING to PAID does the work, so one payment is one period and one invoice.
 */
export async function confirmSubscriptionPayment(razorpayOrderId: string, razorpayPaymentId: string, now: Date = new Date(), capturedPaise?: number) {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { razorpayOrderId }, include: { subscriptionPlan: true } });
  if (!payment) return null;
  if (payment.status === "PAID") return payment;
  // The webhook says how much Razorpay captured: if that is not the price (with GST) this payment asked for, it is not this payment.
  if (capturedPaise !== undefined && capturedPaise !== Math.round(Number(payment.total) * 100)) {
    console.error("[billing] captured amount does not match", payment.id);
    return null;
  }
  const claimed = await prisma.subscriptionPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID", razorpayPaymentId, paidAt: now } });
  if (claimed.count === 0) return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });

  const { organizationId, subscriptionPlanId, interval } = payment;
  const previous = await getCurrentSubscription(organizationId);
  const renewing = !!previous && previous.status === "ACTIVE" && previous.subscriptionPlanId === subscriptionPlanId && !!previous.currentPeriodEnd && previous.currentPeriodEnd > now;
  // Renewing early adds on top of what is left; anything else (first payment, new plan, a lapsed kitchen) starts today.
  const periodStart = renewing ? previous!.currentPeriodEnd! : now;
  const periodEnd = periodEndFrom(periodStart, interval);
  const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`select nextval('subscription_invoice_seq')`;
  const [seller, buyer] = await Promise.all([getPlatformBillingProfile(), prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })]);
  const invoiceNumber = formatInvoiceNumber(seller.invoicePrefix, buyer.name, now, Number(nextval));
  const kind = gstKind(seller, { gstin: buyer.gstNumber, state: buyer.state });
  const invoiceSnapshot: InvoiceSnapshot = {
    seller: { legalName: seller.legalName, addressLine1: seller.addressLine1, addressLine2: seller.addressLine2, city: seller.city, state: seller.state, stateCode: seller.stateCode, postalCode: seller.postalCode, country: seller.country, gstin: seller.gstin, pan: seller.pan, sacCode: seller.sacCode, email: seller.email, phone: seller.phone, website: seller.website, note: seller.invoiceNote },
    buyer: { name: buyer.name, addressLine1: buyer.addressLine1, addressLine2: buyer.addressLine2, city: buyer.city, state: buyer.state, postalCode: buyer.postalCode, country: buyer.country, gstin: buyer.gstNumber },
    gst: { kind, lines: gstLines(kind, Number(payment.gstPercent), Number(payment.gstAmount)) },
    highlights: payment.subscriptionPlan.highlights,
  };

  await prisma.$transaction(async (tx) => {
    if (renewing) {
      await tx.subscription.update({ where: { id: previous!.id }, data: { currentPeriodEnd: periodEnd, billingInterval: interval, pendingPlanId: null, pendingInterval: null } });
    } else {
      await tx.subscription.updateMany({ where: { organizationId, endDate: null }, data: { status: "CANCELLED", endDate: now } });
      await tx.subscription.create({ data: { organizationId, subscriptionPlanId, status: "ACTIVE", startDate: now, billingInterval: interval, currentPeriodEnd: periodEnd } });
    }
    await tx.subscriptionPayment.update({ where: { id: payment.id }, data: { invoiceNumber, periodStart, periodEnd, invoiceSnapshot: invoiceSnapshot as unknown as Prisma.InputJsonObject } });
  });

  await audit({ organizationId, action: "subscription.payment_confirmed", recordType: "SubscriptionPayment", recordId: payment.id, after: { total: Number(payment.total), interval, invoiceNumber, periodEnd: periodEnd.toISOString() } });
  if (!renewing) await onPlanChanged(organizationId, payment.subscriptionPlan.name, previous?.subscriptionPlan.name ?? null);
  return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
}

export async function failSubscriptionPayment(razorpayOrderId: string) {
  await prisma.subscriptionPayment.updateMany({ where: { razorpayOrderId, status: "PENDING" }, data: { status: "FAILED" } });
}

/** A lower plan chosen mid-period starts at the next payment, never now. */
export async function scheduleDowngrade(organizationId: string, planId: string, interval: BillingInterval, actorUserId: string) {
  const [current, plans] = await Promise.all([getCurrentSubscription(organizationId), listSellablePlans()]);
  const target = plans.find((plan) => plan.id === planId);
  if (!current || current.status !== "ACTIVE") throw new BillingError("There is no paid plan to change.");
  if (!target) throw new BillingError("That plan is not available.");
  priceFor(target, interval);
  await prisma.subscription.update({ where: { id: current.id }, data: { pendingPlanId: planId, pendingInterval: interval } });
  await audit({ organizationId, actorUserId, action: "subscription.downgrade_scheduled", recordType: "Subscription", recordId: current.id, after: { planId, interval } });
}

export async function cancelScheduledDowngrade(organizationId: string, actorUserId: string) {
  const current = await getCurrentSubscription(organizationId);
  if (!current?.pendingPlanId) return;
  await prisma.subscription.update({ where: { id: current.id }, data: { pendingPlanId: null, pendingInterval: null } });
  await audit({ organizationId, actorUserId, action: "subscription.downgrade_cancelled", recordType: "Subscription", recordId: current.id });
}

export async function listSubscriptionPayments(organizationId: string) {
  return prisma.subscriptionPayment.findMany({ where: { organizationId, status: "PAID" }, include: { subscriptionPlan: { select: { name: true } } }, orderBy: { paidAt: "desc" } });
}
