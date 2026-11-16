import "server-only";
import { randomBytes } from "node:crypto";
import type { MethodsAnswer } from "@platterly/contract";
import type { PaymentMethod } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifySafely } from "@/modules/notifications/notifications";
import { BillingError } from "./billing-error";
import { razorpayPlanFor, listSellablePlans, requireBusiness, stopAutoPay } from "./billing";
import { ensureRazorpayCustomer } from "./razorpay-customer";
import { createRazorpaySubscription, createTokenRegistrationOrder, deleteRazorpayToken, fetchRazorpayPayment, fetchRazorpaySubscription, refundRazorpayPayment, verifyCheckoutSignature, verifySubscriptionSignature, type PlatformRazorpay, type RazorpayPayment } from "./razorpay";

/**
 * Saved payment methods for renewals (docs/payment-methods-design.md). A method is a label, never card data. One is the primary: the one whose
 * Razorpay subscription is the business's current auto-pay. Only the primary is ever charged. The caller (the signed Platform route, step 3b.2)
 * has already checked that the person is the business's active Admin.
 */
const cannotVerify = () => new BillingError("We could not verify this payment.");
const methodId = () => `pm_${randomBytes(16).toString("hex")}`;

function needCreds(creds?: PlatformRazorpay | null): PlatformRazorpay {
  if (!creds) throw new BillingError("Online payment is not switched on yet. Please contact Platterly.");
  return creds;
}

/** How a payment was made, as a short label and a kind. */
function describePayment(payment: RazorpayPayment): { kind: "CARD" | "UPI" | "EMANDATE"; label: string } {
  if (payment.method === "card" && payment.card?.last4) {
    const network = payment.card.network ?? "Card";
    return { kind: "CARD", label: `${network} ending ${payment.card.last4}` };
  }
  if (payment.method === "upi" && payment.vpa) return { kind: "UPI", label: `UPI ${payment.vpa}` };
  if (payment.method === "emandate" || payment.method === "netbanking") return { kind: "EMANDATE", label: payment.bank ? `Bank account (${payment.bank})` : "Bank account" };
  throw new BillingError("We could not read how this payment was made.");
}

/**
 * Saves the method a payment was made with (once: the same card token, or the same subscription for a UPI id, is never saved twice) and, when
 * `subscriptionId` is given, marks it as the method that authorised that auto-pay subscription.
 */
export async function recordMethodFromPayment(businessId: string, razorpayPaymentId: string, subscriptionId: string | null, creds: PlatformRazorpay, fetchImpl: typeof fetch = fetch): Promise<PaymentMethod> {
  const payment = await fetchRazorpayPayment(creds, razorpayPaymentId, fetchImpl);
  const { kind, label } = describePayment(payment);
  const tokenId = payment.token_id ?? null;
  const existing = tokenId
    ? await prisma.paymentMethod.findUnique({ where: { razorpayTokenId: tokenId } })
    : subscriptionId
      ? await prisma.paymentMethod.findFirst({ where: { businessId, kind, razorpaySubscriptionId: subscriptionId } })
      : null;
  if (existing) {
    if (existing.businessId !== businessId) throw cannotVerify();
    return subscriptionId && existing.razorpaySubscriptionId !== subscriptionId ? prisma.paymentMethod.update({ where: { id: existing.id }, data: { razorpaySubscriptionId: subscriptionId } }) : existing;
  }
  return prisma.paymentMethod.create({ data: { id: methodId(), businessId, kind, label, razorpayTokenId: tokenId, razorpaySubscriptionId: subscriptionId } });
}

export interface MethodView {
  id: string;
  kind: string;
  label: string;
  isPrimary: boolean;
  createdAt: Date;
}

async function currentSubscription(businessId: string, productKey: string) {
  return prisma.subscription.findFirst({ where: { businessId, productKey, endDate: null } });
}

/** The business's saved methods: the primary first, then the oldest first. The primary is derived from the current subscription, never stored. */
export async function listMethods(businessId: string, productKey: string): Promise<MethodView[]> {
  await requireBusiness(businessId, productKey);
  const [rows, current] = await Promise.all([prisma.paymentMethod.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }), currentSubscription(businessId, productKey)]);
  const primarySub = current?.razorpaySubscriptionId ?? null;
  const views = rows.map((m) => ({ id: m.id, kind: m.kind, label: m.label, isPrimary: !!primarySub && m.razorpaySubscriptionId === primarySub, createdAt: m.createdAt }));
  return [...views.filter((m) => m.isPrimary), ...views.filter((m) => !m.isPrimary)];
}

export interface AddCardAnswer {
  keyId: string;
  customerId: string;
  razorpayOrderId: string;
  amountPaise: number;
  description: string;
}

/** Step one of adding a card: a Rs 5 registration order for the business's customer, opened in Razorpay Checkout. */
export async function startAddCard(businessId: string, creds?: PlatformRazorpay | null, fetchImpl: typeof fetch = fetch): Promise<AddCardAnswer> {
  const keys = needCreds(creds);
  const customerId = await ensureRazorpayCustomer(businessId, keys, fetchImpl);
  const { id } = await createTokenRegistrationOrder(keys, { customerId, receipt: `pm_${randomBytes(8).toString("hex")}`, notes: { businessId, purpose: "add_payment_method" } }, fetchImpl);
  return { keyId: keys.keyId, customerId, razorpayOrderId: id, amountPaise: 500, description: "Save a card for renewals (₹5 to verify it, refunded straight away)" };
}

/**
 * Step two: Checkout's signature, the payment's own record at Razorpay (this business's customer, captured, a token issued), and only then is the card saved.
 * The Rs 5 is then refunded. A refund that fails keeps the card, is audited, raises a staff alert and is reported back as `refunded: false` so the owner is
 * never told it was refunded when it was not.
 */
export async function verifyAddCard(input: { businessId: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string }, creds?: PlatformRazorpay | null, fetchImpl: typeof fetch = fetch): Promise<{ method: PaymentMethod; refunded: boolean }> {
  const keys = needCreds(creds);
  if (!verifyCheckoutSignature(input, keys.keySecret)) throw cannotVerify();
  const customer = await prisma.razorpayCustomer.findUnique({ where: { businessId: input.businessId } });
  const payment = await fetchRazorpayPayment(keys, input.razorpayPaymentId, fetchImpl);
  if (!customer || payment.customer_id !== customer.customerId || !payment.token_id || payment.status !== "captured") throw cannotVerify();
  const method = await recordMethodFromPayment(input.businessId, input.razorpayPaymentId, null, keys, fetchImpl);
  let refunded = !!payment.amount_refunded;
  if (!refunded) {
    try {
      const refund = await refundRazorpayPayment(keys, payment.id, payment.amount, fetchImpl);
      if (refund.status === "failed") throw new Error("Razorpay reported the refund as failed");
      refunded = true;
    } catch (error) {
      console.error("[methods] could not refund the card registration", payment.id, error);
      await audit({ actorUserId: null, action: "billing.method_refund_failed", subject: input.businessId, detail: { methodId: method.id, razorpayPaymentId: payment.id, amountPaise: payment.amount } });
      await notifySafely({ productKey: await anyProductKey(input.businessId), businessId: input.businessId, kind: "method.refund_failed", severity: "WARNING", title: "A card's ₹5 could not be refunded", body: `Razorpay payment ${payment.id} (₹${payment.amount / 100}) was taken to save a card and must be refunded in the Razorpay dashboard.`, link: `/businesses/${input.businessId}`, dedupeKey: `method_refund_failed:${payment.id}` });
    }
  }
  await audit({ actorUserId: null, action: "billing.method_added", subject: input.businessId, detail: { methodId: method.id, label: method.label, refunded } });
  return { method, refunded };
}

async function anyProductKey(businessId: string): Promise<string> {
  const link = await prisma.businessProduct.findFirst({ where: { businessId }, select: { productKey: true } });
  return link?.productKey ?? "platterly";
}

export interface MakePrimaryAnswer {
  keyId: string;
  customerId: string;
  razorpaySubscriptionId: string;
  description: string;
  /** Set when the window must offer one method only ("Add UPI"). */
  onlyMethod?: "upi";
}

/**
 * Step one of making a saved method the primary: Razorpay cannot swap the method of a subscription, so a new subscription for the same plan is
 * made, starting when the paid period ends. The owner authorises it in Checkout (₹5, refunded by Razorpay); nothing changes until `verifyMakePrimary`.
 */
export async function startMakePrimary(input: { businessId: string; productKey: string; methodId?: string; newMethod?: "upi" }, creds?: PlatformRazorpay | null, fetchImpl: typeof fetch = fetch): Promise<MakePrimaryAnswer> {
  const keys = needCreds(creds);
  await requireBusiness(input.businessId, input.productKey);
  // Either a saved method is made primary, or a new UPI id is added as the primary ("Add UPI", decided 2026-11-16: the old primary card stays as a secondary).
  const method = input.methodId ? await prisma.paymentMethod.findUnique({ where: { id: input.methodId } }) : null;
  if (input.methodId && (!method || method.businessId !== input.businessId)) throw new BillingError("That payment method was not found.");
  if (!input.methodId && input.newMethod !== "upi") throw new BillingError("Choose a payment method.");
  const current = await currentSubscription(input.businessId, input.productKey);
  if (!current?.razorpaySubscriptionId || current.billingInterval !== "MONTHLY") throw new BillingError("Auto-pay is not on, so there is no primary method to change.");
  if (method && method.razorpaySubscriptionId === current.razorpaySubscriptionId) throw new BillingError("That method is already the primary.");
  if (!method && (await prisma.paymentMethod.findFirst({ where: { businessId: input.businessId, kind: "UPI", razorpaySubscriptionId: current.razorpaySubscriptionId } }))) throw new BillingError("A UPI id is already your primary method. Make another method primary first, then add a new UPI id.");
  if (!current.currentPeriodEnd || current.currentPeriodEnd.getTime() <= Date.now() + 60_000) throw new BillingError("The paid period is over. Renew first, then change the payment method.");
  const plan = (await listSellablePlans(input.productKey)).find((candidate) => candidate.id === current.planId);
  if (!plan) throw new BillingError("This plan is no longer sold, so the payment method cannot be changed.");
  const customerId = await ensureRazorpayCustomer(input.businessId, keys, fetchImpl);
  const razorpayPlanId = await razorpayPlanFor(keys, plan, fetchImpl);
  const sub = await createRazorpaySubscription(keys, { razorpayPlanId, customerId, startAt: Math.floor(current.currentPeriodEnd.getTime() / 1000), notes: { businessId: input.businessId, productKey: input.productKey, planId: plan.id, purpose: "change_primary_method", ...(method ? { methodId: method.id } : { newMethod: "upi" }) } }, fetchImpl);
  return { keyId: keys.keyId, customerId, razorpaySubscriptionId: sub.id, description: method ? "Authorise your new payment method (₹5, refunded straight away)" : "Authorise your UPI id (₹5, refunded straight away)", ...(method ? {} : { onlyMethod: "upi" as const }) };
}

/** Step two: the subscription must be this business's own and authorised. Then the business's subscription row points at it and the old one is cancelled. */
export async function verifyMakePrimary(input: { businessId: string; productKey: string; razorpaySubscriptionId: string; razorpayPaymentId: string; signature: string }, creds?: PlatformRazorpay | null, fetchImpl: typeof fetch = fetch) {
  const keys = needCreds(creds);
  await requireBusiness(input.businessId, input.productKey);
  if (!verifySubscriptionSignature(input, keys.keySecret)) throw cannotVerify();
  const sub = await fetchRazorpaySubscription(keys, input.razorpaySubscriptionId, fetchImpl);
  const notes = (Array.isArray(sub.notes) ? {} : sub.notes ?? {}) as Record<string, string>;
  if (notes.businessId !== input.businessId || notes.productKey !== input.productKey || notes.purpose !== "change_primary_method") throw cannotVerify();
  if (sub.status !== "authenticated" && sub.status !== "active") {
    await stopAutoPay({ businessId: input.businessId, productKey: input.productKey, razorpaySubscriptionId: sub.id }, false);
    throw new BillingError("The new payment method was not authorised, so nothing was changed.");
  }
  const current = await currentSubscription(input.businessId, input.productKey);
  if (!current?.razorpaySubscriptionId) throw new BillingError("Auto-pay is not on, so there is no primary method to change.");
  const old = current.razorpaySubscriptionId;
  if (notes.newMethod === "upi") {
    // "Add UPI": the person must really have authorised with a UPI id; anything else changes nothing.
    const paidWith = describePayment(await fetchRazorpayPayment(keys, input.razorpayPaymentId, fetchImpl));
    if (paidWith.kind !== "UPI") {
      await stopAutoPay({ businessId: input.businessId, productKey: input.productKey, razorpaySubscriptionId: sub.id }, false);
      throw new BillingError("That was not a UPI id, so nothing was changed.");
    }
  }
  const method = await methodAuthorised(input.businessId, notes.methodId, input.razorpayPaymentId, sub.id, keys, fetchImpl);
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: current.id }, data: { razorpaySubscriptionId: sub.id, autoPay: "ACTIVE" } });
    // The old primary stays as a saved secondary if it is a card; a UPI id cannot be kept as one (design decision 5).
    await tx.paymentMethod.deleteMany({ where: { businessId: input.businessId, kind: "UPI", razorpaySubscriptionId: old, id: { not: method.id } } });
    await tx.paymentMethod.updateMany({ where: { businessId: input.businessId, razorpaySubscriptionId: old, id: { not: method.id } }, data: { razorpaySubscriptionId: null } });
  });
  // Pointed first, so the old subscription's cancelled webhook finds no current subscription and changes nothing.
  await stopAutoPay({ businessId: input.businessId, productKey: input.productKey, razorpaySubscriptionId: old }, false);
  await audit({ actorUserId: null, action: "billing.method_made_primary", subject: input.businessId, detail: { productKey: input.productKey, methodId: method.id, label: method.label, from: old, to: sub.id } });
  return method;
}

/** Deletes a saved method: never the primary, never the last. The Razorpay token goes first, so a failure there keeps the row. */
export async function removeMethod(input: { businessId: string; productKey: string; methodId: string }, creds?: PlatformRazorpay | null, fetchImpl: typeof fetch = fetch) {
  const keys = needCreds(creds);
  await requireBusiness(input.businessId, input.productKey);
  const method = await prisma.paymentMethod.findUnique({ where: { id: input.methodId } });
  if (!method || method.businessId !== input.businessId) throw new BillingError("That payment method was not found.");
  const current = await currentSubscription(input.businessId, input.productKey);
  const isPrimary = !!current?.razorpaySubscriptionId && method.razorpaySubscriptionId === current.razorpaySubscriptionId;
  if (isPrimary) throw new BillingError("The primary payment method cannot be removed. Make another one primary first, or replace it.");
  if ((await prisma.paymentMethod.count({ where: { businessId: input.businessId } })) <= 1) throw new BillingError("The last payment method cannot be removed. Add another first.");
  if (method.razorpayTokenId) {
    const customer = await prisma.razorpayCustomer.findUnique({ where: { businessId: input.businessId } });
    if (customer) await deleteRazorpayToken(keys, customer.customerId, method.razorpayTokenId, fetchImpl);
  }
  await prisma.paymentMethod.delete({ where: { id: method.id } });
  await audit({ actorUserId: null, action: "billing.method_removed", subject: input.businessId, detail: { methodId: method.id, label: method.label } });
}

/** What the Store's payment-method page shows: the saved methods and when the next renewal is charged. */
export async function methodsView(businessId: string, productKey: string): Promise<MethodsAnswer> {
  const [methods, current] = await Promise.all([listMethods(businessId, productKey), currentSubscription(businessId, productKey)]);
  const autoPayOn = !!current?.razorpaySubscriptionId && (current.autoPay === "ACTIVE" || current.autoPay === "PENDING");
  return { methods: methods.map((m) => ({ id: m.id, kind: m.kind as MethodsAnswer["methods"][number]["kind"], label: m.label, isPrimary: m.isPrimary })), nextChargeAt: autoPayOn && current?.currentPeriodEnd ? current.currentPeriodEnd.toISOString() : null };
}

/**
 * After a verified auto-pay purchase: save the method the window's payment was made with, as the primary. Never throws: the payment is already
 * confirmed, and a method that cannot be read now can be added again from the Account.
 */
export async function recordFirstMethod(businessId: string, razorpayPaymentId: string, razorpaySubscriptionId: string, creds?: PlatformRazorpay | null, fetchImpl: typeof fetch = fetch) {
  try {
    await recordMethodFromPayment(businessId, razorpayPaymentId, razorpaySubscriptionId, needCreds(creds), fetchImpl);
  } catch (error) {
    console.error("[methods] could not save the first payment method", razorpaySubscriptionId, error);
  }
}

/**
 * The method a make-primary authorisation was made with. Authorising a saved card in Razorpay's window makes Razorpay issue a NEW token for the same card,
 * so the chosen card keeps its one row and takes the new token (the old token is deleted at Razorpay, best effort). A different card typed into the window
 * is saved as a method of its own, as for any payment.
 */
async function methodAuthorised(businessId: string, chosenId: string | undefined, razorpayPaymentId: string, subscriptionId: string, creds: PlatformRazorpay, fetchImpl: typeof fetch): Promise<PaymentMethod> {
  const chosen = chosenId ? await prisma.paymentMethod.findUnique({ where: { id: chosenId } }) : null;
  const payment = await fetchRazorpayPayment(creds, razorpayPaymentId, fetchImpl);
  const paidWith = describePayment(payment);
  if (!chosen || chosen.businessId !== businessId || chosen.kind !== paidWith.kind || chosen.label !== paidWith.label) return recordMethodFromPayment(businessId, razorpayPaymentId, subscriptionId, creds, fetchImpl);
  const newToken = payment.token_id ?? null;
  const oldToken = chosen.razorpayTokenId;
  const replaced = !!newToken && newToken !== oldToken;
  // A row that already holds the new token (the same card saved twice) is folded into the chosen one.
  if (replaced) await prisma.paymentMethod.deleteMany({ where: { businessId, razorpayTokenId: newToken, id: { not: chosen.id } } });
  const updated = await prisma.paymentMethod.update({ where: { id: chosen.id }, data: { razorpaySubscriptionId: subscriptionId, ...(replaced ? { razorpayTokenId: newToken } : {}) } });
  if (replaced && oldToken) {
    const customer = await prisma.razorpayCustomer.findUnique({ where: { businessId } });
    if (customer) await deleteRazorpayToken(creds, customer.customerId, oldToken, fetchImpl).catch((error) => console.error("[methods] could not delete the replaced token", oldToken, error));
  }
  return updated;
}
