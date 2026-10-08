import "server-only";
import { notifySafely } from "@/modules/notifications/notifications";
import { randomBytes } from "node:crypto";
import type { BillingView, Buyer, CheckoutAnswer, PlanOffer, PriceView } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nextInvoiceNumber } from "./numbering";
import { tellOwner } from "@/modules/messages/messages";
import { issueSnapshot, newSubscriptionId } from "@/modules/snapshots/issue";
import { formatInvoiceNumber, gstKind, gstLines, periodEndFrom, priceBreakdown, type Interval, type InvoiceSnapshot, type PriceBreakdown } from "./math";
import { createRazorpayOrder, platformRazorpay, verifyCheckoutSignature } from "./razorpay";
import { getProfile } from "./profile";

/**
 * A business pays Platterly for its plan (ported from catering's Chunk 20, now keyed by business and product). Each payment
 * buys one period (30 days or a year) and is one Razorpay order, so a renewal is the owner paying again, not an automatic
 * debit. A paid period that runs out locks the business (the snapshot's own dates and ops's sweep both say so).
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
    },
    history: subs.map((s) => ({ id: s.id, planName: s.plan.name, status: s.status, startDate: s.startDate.toISOString(), endDate: iso(s.endDate) })),
    payments: payments.map((p) => ({ id: p.id, planName: p.plan.name, interval: p.interval, total: Number(p.total), paidAt: iso(p.paidAt), periodStart: iso(p.periodStart), periodEnd: iso(p.periodEnd), invoiceNumber: p.invoiceNumber })),
  };
}

/** Starts a Razorpay Checkout for one period of a plan. A PENDING payment is written first so the webhook can find it. */
export async function startCheckout(input: { businessId: string; productKey: string; planId: string; interval: Interval; buyer: Buyer }, fetchImpl: typeof fetch = fetch): Promise<CheckoutAnswer> {
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
  return { keyId: creds.keyId, razorpayOrderId, amountPaise: Math.round(price.total * 100), businessName: business.name, description: `${plan.name} plan, ${input.interval === "ANNUAL" ? "1 year" : "30 days"}` };
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

/**
 * Razorpay says the payment was captured (checkout verification or webhook, whichever comes first). Safe to call twice: only
 * the call that flips PENDING to PAID does the work, so one payment is one period and one invoice.
 */
export async function confirmPayment(razorpayOrderId: string, razorpayPaymentId: string, now: Date = new Date(), capturedPaise?: number) {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { razorpayOrderId }, include: { plan: true, business: true } });
  if (!payment) return null;
  if (payment.status === "PAID") return payment;
  // The webhook says how much Razorpay captured: if that is not the price (with GST) this payment asked for, it is not this payment.
  if (capturedPaise !== undefined && capturedPaise !== Math.round(Number(payment.total) * 100)) {
    console.error("[billing] captured amount does not match", payment.id);
    return null;
  }
  const claimed = await prisma.subscriptionPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID", razorpayPaymentId, paidAt: now } });
  if (claimed.count === 0) return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });

  const { businessId, productKey, planId, interval } = payment;
  const previous = await prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null } });
  const renewing = !!previous && previous.status === "ACTIVE" && previous.planId === planId && !!previous.currentPeriodEnd && previous.currentPeriodEnd > now;
  // Renewing early adds on top of what is left; anything else (first payment, new plan, a lapsed business) starts today.
  const periodStart = renewing ? previous!.currentPeriodEnd! : now;
  const periodEnd = periodEndFrom(periodStart, interval);

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
  await prisma.$transaction(async (tx) => {
    // The number is taken here, with the payment's own update, so a failure leaves no gap in the product's numbering.
    invoiceNumber = formatInvoiceNumber(prefix, buyer.name, now, await nextInvoiceNumber(tx, productKey));
    if (renewing) {
      await tx.subscription.update({ where: { id: previous!.id }, data: { currentPeriodEnd: periodEnd, billingInterval: interval, pendingPlanId: null, pendingInterval: null } });
    } else {
      await tx.subscription.updateMany({ where: { businessId, productKey, endDate: null }, data: { status: "CANCELLED", endDate: now } });
      await tx.subscription.create({ data: { id: newSubscriptionId(), businessId, productKey, planId, status: "ACTIVE", startDate: now, billingInterval: interval, currentPeriodEnd: periodEnd } });
    }
    await tx.subscriptionPayment.update({ where: { id: payment.id }, data: { invoiceNumber, periodStart, periodEnd, invoiceSnapshot: snapshot as unknown as Prisma.InputJsonObject } });
  });
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

/** A lower plan chosen mid-period starts at the next payment, never now. */
export async function scheduleDowngrade(input: { businessId: string; productKey: string; planId: string; interval: Interval }) {
  await requireBusiness(input.businessId, input.productKey);
  const [current, plans] = await Promise.all([prisma.subscription.findFirst({ where: { businessId: input.businessId, productKey: input.productKey, endDate: null } }), listSellablePlans(input.productKey)]);
  const target = plans.find((plan) => plan.id === input.planId);
  if (!current || current.status !== "ACTIVE") throw new BillingError("There is no paid plan to change.");
  if (!target) throw new BillingError("That plan is not available.");
  priceFor(target, input.interval);
  await prisma.subscription.update({ where: { id: current.id }, data: { pendingPlanId: input.planId, pendingInterval: input.interval } });
  await audit({ actorUserId: null, action: "billing.downgrade_scheduled", subject: input.businessId, detail: { productKey: input.productKey, planId: input.planId, interval: input.interval } });
}

export async function cancelScheduledDowngrade(businessId: string, productKey: string) {
  await requireBusiness(businessId, productKey);
  const current = await prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null } });
  if (!current?.pendingPlanId) return;
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
