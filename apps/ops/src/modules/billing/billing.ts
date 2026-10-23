import "server-only";
import { notifySafely } from "@/modules/notifications/notifications";
import { randomBytes } from "node:crypto";
import type { AutoPayCheckoutAnswer, AutoPayFailure, AutoPayStatus, BillingView, Buyer, OrderCheckoutAnswer, PlanOffer, PriceView } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nextInvoiceNumber } from "./numbering";
import { tellOwner } from "@/modules/messages/messages";
import { issueSnapshot, newSubscriptionId } from "@/modules/snapshots/issue";
import { formatInvoiceNumber, gstKind, gstLines, periodEndFrom, priceBreakdown, type Interval, type InvoiceSnapshot, type PriceBreakdown } from "./math";
import { cancelRazorpaySubscription, createRazorpayOrder, pauseRazorpaySubscription, resumeRazorpaySubscription, createRazorpayPlan, createRazorpaySubscription, fetchRazorpaySubscription, platformRazorpay, verifyCheckoutSignature, verifySubscriptionSignature, type PlatformRazorpay, type RazorpaySubscription } from "./razorpay";
import { getProfile } from "./profile";
import { recordRazorpayEvent } from "./events";

/**
 * A business pays Platterly for its plan (ported from catering's Chunk 20, now keyed by business and product). A yearly
 * payment buys one year and is one Razorpay order; a monthly plan is auto-pay (a Razorpay subscription, `chargeAutoPay`), so
 * Razorpay charges every 30 days and each charge is one payment, one period and one invoice. A paid period that runs out locks the business (the snapshot's own dates and ops's sweep both say so).
 * Platterly's Razorpay keys are read from the environment; until they are set, checkout answers "not switched on yet".
 */
export class BillingError extends Error {}

export const onlineBillingAvailable = () => platformRazorpay() !== null;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const view = (b: PriceBreakdown): PriceView => ({ amount: b.amount, gstPercent: b.gstPercent, gstAmount: b.gstAmount, total: b.total });

/** The business must be registered on the product the caller is signed in as. Anything else looks like "not found". */
async function requireBusiness(businessId: string, productKey: string) {
  const link = await prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } }, include: { business: true } });
  if (!link) throw new BillingError("unknown_business");
  return link.business;
}

/** The paid plans a business can choose from: active, not the trial, with a monthly price set by staff. */
export async function listSellablePlans(productKey: string): Promise<PlanOffer[]> {
  const plans = await prisma.plan.findMany({ where: { productKey, isActive: true, isTrial: false, priceMonthly: { not: null } }, orderBy: { priceMonthly: "asc" } });
  return plans.map((plan) => {
    const gst = Number(plan.gstPercent);
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      highlights: plan.highlights,
      monthly: view(priceBreakdown(Number(plan.priceMonthly), gst)),
      annual: plan.priceAnnual === null ? null : view(priceBreakdown(Number(plan.priceAnnual), gst)),
    };
  });
}

function priceFor(plan: PlanOffer, interval: Interval): PriceView {
  const price = interval === "ANNUAL" ? plan.annual : plan.monthly;
  if (!price) throw new BillingError("This plan is not sold yearly.");
  return price;
}

export async function getBillingView(businessId: string, productKey: string): Promise<BillingView> {
  await requireBusiness(businessId, productKey);
  const [subs, payments] = await Promise.all([
    prisma.subscription.findMany({ where: { businessId, productKey }, include: { plan: { select: { id: true, code: true, name: true } } }, orderBy: { startDate: "desc" } }),
    prisma.subscriptionPayment.findMany({ where: { businessId, productKey, status: "PAID" }, include: { plan: { select: { name: true } } }, orderBy: { paidAt: "desc" } }),
  ]);
  const current = subs.find((s) => s.endDate === null) ?? null;
  const pendingPlan = current?.pendingPlanId ? await prisma.plan.findUnique({ where: { id: current.pendingPlanId }, select: { name: true } }) : null;
  return {
    onlineBillingAvailable: onlineBillingAvailable(),
    subscription: current && {
      id: current.id,
      status: current.status,
      plan: current.plan,
      billingInterval: current.billingInterval,
      startDate: current.startDate.toISOString(),
      trialEndsAt: iso(current.trialEndsAt),
      currentPeriodEnd: iso(current.currentPeriodEnd),
      pending: current.pendingPlanId && pendingPlan ? { planId: current.pendingPlanId, planName: pendingPlan.name, interval: current.pendingInterval } : null,
      autoPay: current.autoPay ? { status: current.autoPay, nextChargeAt: current.autoPay === "ACTIVE" && !current.pendingPlanId ? iso(current.currentPeriodEnd) : null } : null,
    },
    history: subs.map((s) => ({ id: s.id, planName: s.plan.name, status: s.status, startDate: s.startDate.toISOString(), endDate: iso(s.endDate) })),
    payments: payments.map((p) => ({ id: p.id, planName: p.plan.name, interval: p.interval, total: Number(p.total), paidAt: iso(p.paidAt), periodStart: iso(p.periodStart), periodEnd: iso(p.periodEnd), invoiceNumber: p.invoiceNumber })),
  };
}

/** Starts a Razorpay Checkout for one period of a plan. A PENDING payment is written first so the webhook can find it. */
export async function startCheckout(input: { businessId: string; productKey: string; planId: string; interval: Interval; buyer: Buyer }, fetchImpl: typeof fetch = fetch): Promise<OrderCheckoutAnswer> {
  const business = await requireBusiness(input.businessId, input.productKey);
  const creds = platformRazorpay();
  if (!creds) throw new BillingError("Online payment is not switched on yet. Please contact Platterly.");
  const plan = (await listSellablePlans(input.productKey)).find((candidate) => candidate.id === input.planId);
  if (!plan) throw new BillingError("That plan is not available.");
  const price = priceFor(plan, input.interval);

  const { razorpayOrderId } = await createRazorpayOrder(creds, { amountRupees: price.total, receipt: `sub-${input.businessId.slice(4, 24)}`, notes: { businessId: input.businessId, productKey: input.productKey, planId: input.planId, interval: input.interval } }, fetchImpl);
  const payment = await prisma.subscriptionPayment.create({
    data: {
      id: `pay_${randomBytes(16).toString("hex")}`,
      businessId: input.businessId,
      productKey: input.productKey,
      planId: input.planId,
      interval: input.interval,
      amount: price.amount,
      gstPercent: price.gstPercent,
      gstAmount: price.gstAmount,
      total: price.total,
      razorpayOrderId,
      buyer: input.buyer as unknown as Prisma.InputJsonValue,
    },
  });
  await audit({ actorUserId: null, action: "billing.checkout_started", subject: input.businessId, detail: { paymentId: payment.id, productKey: input.productKey, planId: input.planId, interval: input.interval, total: price.total } });
  return { kind: "order", keyId: creds.keyId, razorpayOrderId, amountPaise: Math.round(price.total * 100), businessName: business.name, description: `${plan.name} plan, ${input.interval === "ANNUAL" ? "1 year" : "30 days"}` };
}

/** Checkout's own signature check, then the same confirmation the webhook does. Only the caller's own payment counts. */
export async function verifyCheckout(input: { businessId: string; productKey: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string }) {
  await requireBusiness(input.businessId, input.productKey);
  const creds = platformRazorpay();
  if (!creds || !verifyCheckoutSignature({ razorpayOrderId: input.razorpayOrderId, razorpayPaymentId: input.razorpayPaymentId, signature: input.signature }, creds.keySecret)) throw new BillingError("We could not verify this payment.");
  const payment = await prisma.subscriptionPayment.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
  if (!payment || payment.businessId !== input.businessId || payment.productKey !== input.productKey) throw new BillingError("We could not verify this payment.");
  return confirmPayment(input.razorpayOrderId, input.razorpayPaymentId);
}

type PaymentToSettle = Prisma.SubscriptionPaymentGetPayload<{ include: { plan: true; business: true } }>;
type AutoPayCycle = { razorpaySubscriptionId: string; periodStart: Date; periodEnd: Date };

export async function confirmPayment(razorpayOrderId: string, razorpayPaymentId: string, now: Date = new Date(), capturedPaise?: number) {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { razorpayOrderId }, include: { plan: true, business: true } });
  return payment ? settle(payment, razorpayPaymentId, now, capturedPaise) : null;
}

/**
 * Razorpay says the payment was captured (checkout verification or webhook, whichever comes first). Safe to call twice: only
 * the call that flips PENDING (or FAILED, a retry on the same Razorpay order) to PAID does the work, so one payment is one
 * period and one invoice. The flip, the period and the invoice commit together: if any of it fails, the payment is still
 * unpaid and Razorpay's retry runs it all again. An auto-pay charge takes Razorpay's own dates and renews its own
 * subscription in place.
 */
async function settle(payment: PaymentToSettle, razorpayPaymentId: string, now: Date, capturedPaise?: number, autoPay?: AutoPayCycle) {
  if (payment.status === "PAID") return payment;
  // The webhook says how much Razorpay captured: if that is not the price (with GST) this payment asked for, it is not this payment.
  if (capturedPaise !== undefined && capturedPaise !== Math.round(Number(payment.total) * 100)) {
    console.error("[billing] captured amount does not match", payment.id);
    return null;
  }
  const { businessId, productKey, planId, interval } = payment;
  const seller = await getProfile();
  const stored = (payment.buyer ?? {}) as Partial<Buyer>;
  const buyer = {
    name: stored.name || payment.business.name,
    addressLine1: stored.addressLine1 ?? null,
    addressLine2: stored.addressLine2 ?? null,
    city: stored.city ?? null,
    state: stored.state ?? null,
    postalCode: stored.postalCode ?? null,
    country: stored.country ?? null,
    gstin: stored.gstin ?? null,
  };
  const product = await prisma.product.findUniqueOrThrow({ where: { key: productKey }, select: { invoicePrefix: true } });
  const prefix = product.invoicePrefix ?? seller.invoicePrefix;
  const kind = gstKind(seller, buyer);
  const snapshot: InvoiceSnapshot = {
    seller: {
      legalName: seller.legalName,
      addressLine1: seller.addressLine1,
      addressLine2: seller.addressLine2,
      city: seller.city,
      state: seller.state,
      stateCode: seller.stateCode,
      postalCode: seller.postalCode,
      country: seller.country,
      gstin: seller.gstin,
      pan: seller.pan,
      sacCode: seller.sacCode,
      email: seller.email,
      phone: seller.phone,
      website: seller.website,
      note: seller.invoiceNote,
    },
    buyer,
    gst: { kind, lines: gstLines(kind, Number(payment.gstPercent), Number(payment.gstAmount)) },
    highlights: payment.plan.highlights,
  };

  let invoiceNumber = "";
  let periodEnd = now;
  let replaced: string | null = null;
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.subscriptionPayment.updateMany({ where: { id: payment.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "PAID", razorpayPaymentId, paidAt: now } });
    if (claimed.count === 0) return false;
    // One payment at a time per business: two early renewals confirmed together each add their own period.
    await tx.$queryRaw`SELECT id FROM business WHERE id = ${businessId} FOR UPDATE`;
    const previous = await tx.subscription.findFirst({ where: { businessId, productKey, endDate: null } });
    // An auto-pay charge on the subscription it already belongs to renews it in place, with Razorpay's dates; a one-time payment
    // renewing early adds on top of what is left; anything else (first payment, new plan, a lapsed business) starts today.
    const renewing = autoPay ? previous?.razorpaySubscriptionId === autoPay.razorpaySubscriptionId : !!previous && previous.status === "ACTIVE" && previous.planId === planId && !!previous.currentPeriodEnd && previous.currentPeriodEnd > now;
    const periodStart = autoPay ? autoPay.periodStart : renewing ? previous!.currentPeriodEnd! : now;
    periodEnd = autoPay ? autoPay.periodEnd : periodEndFrom(periodStart, interval);
    // Another auto-pay this payment replaces (an upgrade, setting up again, or a yearly payment) stops once this one has gone through.
    if (previous?.razorpaySubscriptionId && previous.razorpaySubscriptionId !== autoPay?.razorpaySubscriptionId) replaced = previous.razorpaySubscriptionId;
    const autoPayFields = autoPay ? { razorpaySubscriptionId: autoPay.razorpaySubscriptionId, autoPay: "ACTIVE" as const } : { razorpaySubscriptionId: null, autoPay: null };
    // The number is taken here, with the payment's own update, so a failure leaves no gap in the product's numbering.
    invoiceNumber = formatInvoiceNumber(prefix, buyer.name, now, await nextInvoiceNumber(tx, productKey));
    if (renewing) {
      await tx.subscription.update({ where: { id: previous!.id }, data: { status: "ACTIVE", currentPeriodEnd: periodEnd, billingInterval: interval, pendingPlanId: null, pendingInterval: null, ...autoPayFields } });
    } else {
      await tx.subscription.updateMany({ where: { businessId, productKey, endDate: null }, data: { status: "CANCELLED", endDate: now } });
      await tx.subscription.create({ data: { id: newSubscriptionId(), businessId, productKey, planId, status: "ACTIVE", startDate: now, billingInterval: interval, currentPeriodEnd: periodEnd, ...autoPayFields } });
    }
    await tx.subscriptionPayment.update({ where: { id: payment.id }, data: { invoiceNumber, periodStart, periodEnd, invoiceSnapshot: snapshot as unknown as Prisma.InputJsonObject } });
    return true;
  });
  if (!done) return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
  if (replaced) await stopAutoPay({ businessId, productKey, razorpaySubscriptionId: replaced }, false);
  await audit({ actorUserId: null, action: "billing.payment_confirmed", subject: businessId, detail: { paymentId: payment.id, productKey, total: Number(payment.total), interval, invoiceNumber, periodEnd: periodEnd.toISOString() } });
  // The product learns the new state through a fresh snapshot. A problem delivering it never undoes a payment.
  try {
    await issueSnapshot(businessId, productKey, now);
  } catch (error) {
    console.error("[billing] could not issue a snapshot after payment", payment.id, error);
  }
  await notifySafely({ productKey, businessId, kind: "payment.received", title: "Payment received", body: `${payment.plan.name}: ₹${Number(payment.total).toLocaleString("en-IN")} (invoice ${invoiceNumber}).`, link: `/payments/${payment.id}`, dedupeKey: `payment_received:${payment.id}` });
  await tellOwner({
    businessId,
    productKey,
    template: "payment_received",
    variables: { planName: payment.plan.name, amount: Number(payment.total), invoiceNumber, validUntil: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(periodEnd) },
    dedupeKey: `payment_received:${payment.id}`,
  });
  return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
}

export async function failPayment(razorpayOrderId: string) {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { razorpayOrderId }, include: { plan: { select: { name: true } } } });
  if (!payment) return;
  const failed = await prisma.subscriptionPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED" } });
  // Only the call that flips PENDING to FAILED tells the owner, so a repeated webhook sends one email.
  if (failed.count > 0) await notifySafely({ productKey: payment.productKey, businessId: payment.businessId, kind: "payment.failed", severity: "WARNING", title: "A payment failed", body: `A ${payment.plan.name} payment did not go through. The business has been told.`, link: `/payments/${payment.id}`, dedupeKey: `payment_failed:${payment.id}` });
  if (failed.count > 0) await tellOwner({ businessId: payment.businessId, productKey: payment.productKey, template: "payment_failed", variables: { planName: payment.plan.name }, dedupeKey: `payment_failed:${payment.id}` });
}

/**
 * Stops a Razorpay auto-pay (now, or at the end of the cycle for a downgrade). Never throws: a payment or a lock must not be undone
 * because Razorpay was briefly unreachable. Instead staff are told at once, because a subscription left running could charge again.
 */
export async function stopAutoPay(sub: { businessId: string; productKey: string; razorpaySubscriptionId: string }, atCycleEnd: boolean) {
  const creds = platformRazorpay();
  try {
    if (!creds) throw new Error("Razorpay keys are not set");
    await cancelRazorpaySubscription(creds, sub.razorpaySubscriptionId, atCycleEnd);
  } catch (error) {
    console.error("[billing] could not stop auto-pay", sub.razorpaySubscriptionId, error);
    await notifySafely({ productKey: sub.productKey, businessId: sub.businessId, kind: "autopay.stop_failed", severity: "WARNING", title: "Auto-pay could not be stopped", body: `Razorpay subscription ${sub.razorpaySubscriptionId} may still charge. Cancel it in the Razorpay dashboard.`, link: `/businesses/${sub.businessId}`, dedupeKey: `autopay_stop_failed:${sub.razorpaySubscriptionId}` });
  }
}

/** The Razorpay plan for this plan at its current monthly price (with GST), made the first time it is sold. */
async function razorpayPlanFor(creds: PlatformRazorpay, plan: PlanOffer, fetchImpl: typeof fetch) {
  const key = { planId: plan.id, amountPaise: Math.round(plan.monthly.total * 100) };
  const found = await prisma.razorpayPlan.findUnique({ where: { planId_amountPaise: key } });
  if (found) return found.razorpayPlanId;
  const { id } = await createRazorpayPlan(creds, { name: `${plan.name} (every 30 days)`, amountPaise: key.amountPaise }, fetchImpl);
  // Two first checkouts at once may each make one; the first saved wins and the other Razorpay plan is never used.
  return (await prisma.razorpayPlan.upsert({ where: { planId_amountPaise: key }, create: { ...key, razorpayPlanId: id }, update: {} })).razorpayPlanId;
}

/**
 * Every failed or abandoned checkout leaves a `created` subscription on Razorpay. Each new checkout cancels the one before it, so
 * only the latest can still be open. One Razorpay has already taken the mandate for is left alone: its charge is on the way.
 */
async function dropUnpaidSetup(creds: PlatformRazorpay, businessId: string, productKey: string, keep: string | null, fetchImpl: typeof fetch) {
  const last = await prisma.subscriptionPayment.findFirst({ where: { businessId, productKey, razorpaySubscriptionId: { not: null } }, orderBy: { createdAt: "desc" } });
  const id = last?.razorpaySubscriptionId;
  if (!id || last.status === "PAID" || id === keep) return;
  // A `created` subscription never charges by itself, so if Razorpay can't be asked now it is only left behind, not a risk.
  const status = await fetchRazorpaySubscription(creds, id, fetchImpl).then((sub) => sub.status, (error) => (console.error("[billing] could not check an unpaid auto-pay", id, error), null));
  if (status !== "created") return;
  await stopAutoPay({ businessId, productKey, razorpaySubscriptionId: id }, false);
  await prisma.subscriptionPayment.updateMany({ where: { razorpaySubscriptionId: id, status: "PENDING" }, data: { status: "FAILED", failureReason: "not_finished" } });
}

/** Monthly checkout: a Razorpay subscription (auto-pay). A PENDING payment is written first so the first charge can find it. */
export async function startAutoPayCheckout(input: { businessId: string; productKey: string; planId: string; buyer: Buyer }, fetchImpl: typeof fetch = fetch): Promise<AutoPayCheckoutAnswer> {
  const business = await requireBusiness(input.businessId, input.productKey);
  const creds = platformRazorpay();
  if (!creds) throw new BillingError("Online payment is not switched on yet. Please contact Platterly.");
  // Renewals reach ops only by webhook: without its secret every renewal would be lost, so auto-pay is not offered.
  if (!creds.webhookSecret) throw new BillingError("Auto-pay is not switched on yet. Please contact Platterly.");
  const plan = (await listSellablePlans(input.productKey)).find((candidate) => candidate.id === input.planId);
  if (!plan) throw new BillingError("That plan is not available.");
  const current = await prisma.subscription.findFirst({ where: { businessId: input.businessId, productKey: input.productKey, endDate: null } });
  if (current?.planId === plan.id && (current.autoPay === "ACTIVE" || current.autoPay === "PAUSED")) throw new BillingError("Auto-pay is already on for this plan.");
  await dropUnpaidSetup(creds, input.businessId, input.productKey, current?.razorpaySubscriptionId ?? null, fetchImpl);
  const razorpayPlanId = await razorpayPlanFor(creds, plan, fetchImpl);
  const sub = await createRazorpaySubscription(creds, { razorpayPlanId, notes: { businessId: input.businessId, productKey: input.productKey, planId: plan.id } }, fetchImpl);
  const price = plan.monthly;
  const payment = await prisma.subscriptionPayment.create({
    data: { id: `pay_${randomBytes(16).toString("hex")}`, businessId: input.businessId, productKey: input.productKey, planId: plan.id, interval: "MONTHLY", amount: price.amount, gstPercent: price.gstPercent, gstAmount: price.gstAmount, total: price.total, razorpaySubscriptionId: sub.id, buyer: input.buyer as unknown as Prisma.InputJsonValue },
  });
  await audit({ actorUserId: null, action: "billing.autopay_started", subject: input.businessId, detail: { paymentId: payment.id, productKey: input.productKey, planId: plan.id, razorpaySubscriptionId: sub.id } });
  const amount = `₹${price.total.toLocaleString("en-IN")}`;
  return { kind: "subscription", keyId: creds.keyId, razorpaySubscriptionId: sub.id, amountPaise: Math.round(price.total * 100), businessName: business.name, description: `${plan.name} plan, ${amount} every 30 days (auto-pay)` };
}

/** Checkout's own signature check for auto-pay, then the first charge. */
export async function verifyAutoPayCheckout(input: { businessId: string; productKey: string; razorpaySubscriptionId: string; razorpayPaymentId: string; signature: string }, fetchImpl: typeof fetch = fetch) {
  await requireBusiness(input.businessId, input.productKey);
  const creds = platformRazorpay();
  if (!creds || !verifySubscriptionSignature(input, creds.keySecret)) throw new BillingError("We could not verify this payment.");
  const payment = await prisma.subscriptionPayment.findFirst({ where: { razorpaySubscriptionId: input.razorpaySubscriptionId }, orderBy: { createdAt: "asc" } });
  if (!payment || payment.businessId !== input.businessId || payment.productKey !== input.productKey) throw new BillingError("We could not verify this payment.");
  const sub = await fetchRazorpaySubscription(creds, input.razorpaySubscriptionId, fetchImpl);
  // Razorpay charges at once, so a paid setup has its cycle; without one, the webhook's first charge settles the payment.
  if (!sub.current_start || !sub.current_end) return payment;
  return chargeAutoPay({ razorpaySubscriptionId: sub.id, razorpayPaymentId: input.razorpayPaymentId, periodStart: new Date(sub.current_start * 1000), periodEnd: new Date(sub.current_end * 1000) });
}

/**
 * The product's checkout window reports an auto-pay setup that was declined or not finished: Razorpay's webhook names no
 * subscription for the first and sends nothing for the second. Only the record changes: no period, no invoice, same access.
 */
export async function failAutoPayCheckout(input: { businessId: string; productKey: string; razorpaySubscriptionId: string; reason: AutoPayFailure; detail?: string | null }) {
  await requireBusiness(input.businessId, input.productKey);
  const where = { businessId: input.businessId, productKey: input.productKey, razorpaySubscriptionId: input.razorpaySubscriptionId };
  const failed = await prisma.subscriptionPayment.updateMany({ where: { ...where, status: { in: ["PENDING", "FAILED"] } }, data: { status: "FAILED", failureReason: input.reason } });
  // Kept in the payment log either way: a report that matched nothing is kept with that error.
  await recordRazorpayEvent({ source: "product", type: "setup.failed", payload: { reason: input.reason, detail: input.detail ?? null }, businessId: input.businessId, razorpaySubscriptionId: input.razorpaySubscriptionId, ...(failed.count > 0 ? { processedAt: new Date() } : { error: "No unpaid auto-pay setup matched." }) });
  if (failed.count === 0) return null;
  await audit({ actorUserId: null, action: "billing.autopay_setup_failed", subject: input.businessId, detail: { productKey: input.productKey, razorpaySubscriptionId: input.razorpaySubscriptionId, reason: input.reason, detail: input.detail ?? null } });
  return prisma.subscriptionPayment.findFirst({ where, orderBy: { createdAt: "asc" } });
}

/**
 * One auto-pay charge: the first from checkout verification, every one from Razorpay's `subscription.charged` webhook. The
 * unique Razorpay payment id makes it safe to call twice: one charge is one payment, one period and one invoice.
 */
export async function chargeAutoPay(input: AutoPayCycle & { razorpayPaymentId: string; capturedPaise?: number }, now: Date = new Date()) {
  const include = { plan: true, business: true } as const;
  const already = await prisma.subscriptionPayment.findUnique({ where: { razorpayPaymentId: input.razorpayPaymentId } });
  if (already) return already;
  // The first charge settles the payment written at checkout; each later one is a new payment for the same plan, price and buyer.
  let payment = await prisma.subscriptionPayment.findFirst({ where: { razorpaySubscriptionId: input.razorpaySubscriptionId, status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "asc" }, include });
  if (!payment) {
    const last = await prisma.subscriptionPayment.findFirst({ where: { razorpaySubscriptionId: input.razorpaySubscriptionId, status: "PAID" }, orderBy: { paidAt: "desc" } });
    if (!last) return null;
    // ponytail: two deliveries of one charge at the same moment can each write a row here; the second fails on the unique payment id
    // (Razorpay retries and finds the first) and leaves one stray PENDING row. Harmless; tidy it up if it ever shows in Ops.
    payment = await prisma.subscriptionPayment.create({
      data: { id: `pay_${randomBytes(16).toString("hex")}`, businessId: last.businessId, productKey: last.productKey, planId: last.planId, interval: "MONTHLY", amount: last.amount, gstPercent: last.gstPercent, gstAmount: last.gstAmount, total: last.total, razorpaySubscriptionId: input.razorpaySubscriptionId, ...(last.buyer ? { buyer: last.buyer as Prisma.InputJsonValue } : {}) },
      include,
    });
  }
  return settle(payment, input.razorpayPaymentId, now, input.capturedPaise, { razorpaySubscriptionId: input.razorpaySubscriptionId, periodStart: input.periodStart, periodEnd: input.periodEnd });
}

const FROM_RAZORPAY: Record<string, AutoPayStatus> = { active: "ACTIVE", pending: "PENDING", halted: "HALTED", paused: "PAUSED", cancelled: "CANCELLED", completed: "CANCELLED", expired: "CANCELLED" };

type CurrentWithPlan = { id: string; businessId: string; productKey: string; autoPay: AutoPayStatus | null; currentPeriodEnd: Date | null; pendingPlanId: string | null; plan: { name: string } };

/** Records Razorpay's new auto-pay state and tells the owner once per change (the period is in the key, so a new month can tell again). */
export async function setAutoPay(current: CurrentWithPlan, status: AutoPayStatus) {
  if (current.autoPay === status) return;
  await prisma.subscription.update({ where: { id: current.id }, data: { autoPay: status } });
  const pending = status === "CANCELLED" && current.pendingPlanId ? await prisma.plan.findUnique({ where: { id: current.pendingPlanId }, select: { name: true } }) : null;
  const template = { PENDING: "autopay_failed", HALTED: "autopay_stopped", PAUSED: "autopay_paused", ACTIVE: current.autoPay === "PAUSED" ? "autopay_resumed" : null, CANCELLED: pending ? "downgrade_approval" : null }[status];
  if (!template) return;
  await tellOwner({ businessId: current.businessId, productKey: current.productKey, template, variables: { planName: current.plan.name, ...(pending ? { newPlanName: pending.name } : {}) }, dedupeKey: `${template}:${current.id}:${current.currentPeriodEnd?.getTime() ?? 0}` });
}

/** Razorpay's `subscription.*` webhooks. A charge is a payment; anything else only updates the auto-pay state of a current subscription. */
export async function autoPayEvent(event: string, sub: RazorpaySubscription, payment?: { id?: string; amount?: number }, now: Date = new Date()) {
  if (event === "subscription.charged") {
    if (payment?.id && sub.current_start && sub.current_end) await chargeAutoPay({ razorpaySubscriptionId: sub.id, razorpayPaymentId: payment.id, periodStart: new Date(sub.current_start * 1000), periodEnd: new Date(sub.current_end * 1000), capturedPaise: payment.amount }, now);
    return;
  }
  const status = FROM_RAZORPAY[sub.status];
  const current = status ? await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: sub.id }, include: { plan: { select: { name: true } } } }) : null;
  if (status && current && !current.endDate) await setAutoPay(current, status);
}

async function currentAutoPay(businessId: string, productKey: string) {
  await requireBusiness(businessId, productKey);
  const current = await prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null }, include: { plan: { select: { name: true } } } });
  const creds = platformRazorpay();
  if (!current?.razorpaySubscriptionId || !creds) throw new BillingError("There is no auto-pay to change.");
  return { current, creds, id: current.razorpaySubscriptionId };
}

/** "Pause subscription": no more charges; the paid days run out as usual, then the 7-day grace and the lock. */
export async function pauseAutoPay(businessId: string, productKey: string, fetchImpl: typeof fetch = fetch) {
  const { current, creds, id } = await currentAutoPay(businessId, productKey);
  if (current.autoPay !== "ACTIVE") throw new BillingError("Auto-pay is not on.");
  await pauseRazorpaySubscription(creds, id, fetchImpl);
  await setAutoPay(current, "PAUSED");
  await audit({ actorUserId: null, action: "billing.autopay_paused", subject: businessId, detail: { productKey, razorpaySubscriptionId: id } });
}

/** "Resume": the next charge is on the usual date. Razorpay's resume after the paid days ended is untested, so that is refused. */
export async function resumeAutoPay(businessId: string, productKey: string, fetchImpl: typeof fetch = fetch) {
  const { current, creds, id } = await currentAutoPay(businessId, productKey);
  if (current.currentPeriodEnd && current.currentPeriodEnd <= new Date()) throw new BillingError("Your paid days have ended. Set up auto-pay again from the plans page to carry on.");
  if (current.autoPay !== "PAUSED") throw new BillingError("Auto-pay is not paused.");
  await resumeRazorpaySubscription(creds, id, fetchImpl);
  await setAutoPay(current, "ACTIVE");
  await audit({ actorUserId: null, action: "billing.autopay_resumed", subject: businessId, detail: { productKey, razorpaySubscriptionId: id } });
}

/** A lower plan chosen mid-period starts at the next payment, never now. */
export async function scheduleDowngrade(input: { businessId: string; productKey: string; planId: string; interval: Interval }) {
  await requireBusiness(input.businessId, input.productKey);
  const [current, plans] = await Promise.all([prisma.subscription.findFirst({ where: { businessId: input.businessId, productKey: input.productKey, endDate: null } }), listSellablePlans(input.productKey)]);
  const target = plans.find((plan) => plan.id === input.planId);
  if (!current || current.status !== "ACTIVE") throw new BillingError("There is no paid plan to change.");
  if (!target) throw new BillingError("That plan is not available.");
  priceFor(target, input.interval);
  // Auto-pay for the current plan stops when its paid days end; the owner then approves auto-pay for the lower plan (emailed).
  // Already scheduled by an earlier downgrade: Razorpay has the cancel, so only the plan changes.
  if (current.razorpaySubscriptionId && current.autoPay === "ACTIVE" && !current.pendingPlanId) {
    const creds = platformRazorpay();
    if (!creds) throw new BillingError("Online payment is not switched on yet. Please contact Platterly.");
    await cancelRazorpaySubscription(creds, current.razorpaySubscriptionId, true);
  }
  await prisma.subscription.update({ where: { id: current.id }, data: { pendingPlanId: input.planId, pendingInterval: input.interval } });
  await audit({ actorUserId: null, action: "billing.downgrade_scheduled", subject: input.businessId, detail: { productKey: input.productKey, planId: input.planId, interval: input.interval } });
}

export async function cancelScheduledDowngrade(businessId: string, productKey: string) {
  await requireBusiness(businessId, productKey);
  const current = await prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null } });
  if (!current?.pendingPlanId) return;
  if (current.razorpaySubscriptionId && current.autoPay === "ACTIVE") throw new BillingError("Auto-pay for your current plan already stops at the end of this period, so this change can't be undone. When the period ends, choose any plan to set up auto-pay again.");
  await prisma.subscription.update({ where: { id: current.id }, data: { pendingPlanId: null, pendingInterval: null } });
  await audit({ actorUserId: null, action: "billing.downgrade_cancelled", subject: businessId, detail: { productKey } });
}

/** The frozen invoice for one paid payment, so the product can print it with its own design. */
export async function getInvoice(businessId: string, productKey: string, paymentId: string) {
  await requireBusiness(businessId, productKey);
  const payment = await prisma.subscriptionPayment.findFirst({ where: { id: paymentId, businessId, productKey, status: "PAID" }, include: { plan: { select: { name: true } } } });
  if (!payment || !payment.invoiceNumber || !payment.invoiceSnapshot) throw new BillingError("unknown_invoice");
  return {
    paymentId: payment.id,
    invoiceNumber: payment.invoiceNumber,
    planName: payment.plan.name,
    interval: payment.interval,
    amount: Number(payment.amount),
    gstPercent: Number(payment.gstPercent),
    gstAmount: Number(payment.gstAmount),
    total: Number(payment.total),
    paidAt: iso(payment.paidAt),
    periodStart: iso(payment.periodStart),
    periodEnd: iso(payment.periodEnd),
    razorpayPaymentId: payment.razorpayPaymentId,
    snapshot: payment.invoiceSnapshot as unknown as InvoiceSnapshot,
  };
}
