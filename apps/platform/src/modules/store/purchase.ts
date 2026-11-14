import "server-only";
import { parseBillingVerifyRequest, parseMethodRequest, parseVerifyRequest, type BillingVerifyRequest, type Buyer, type MethodsAnswer } from "@platterly/contract";
import type { Session } from "@/lib/session";
import { billingAccess } from "./billing-rights";
import { checkBuyer } from "./buyer-check";
import { prisma } from "@/lib/db";
import { findSubjectForUser } from "../users/subject";
import { identityPool } from "../auth/identity-db";
import { getProfile } from "../account/profile";
import { changeStoreAutoPay, sendOwnerContact, changeStoreSubscription, listStoreMethods, quoteStoreCheckout, removeStoreMethod, startStoreAddCard, startStoreCheckout, startStoreMakePrimary, verifyStoreAddCard, verifyStoreCheckout, verifyStoreMakePrimary, type AddCardWindow, type CheckoutFailure, type MakePrimaryWindow, type StoreCheckoutAnswer, type StoreQuote, type SubscriptionChange } from "./ops-checkout";
import { STORE_KEY_FOR_OPS_KEY } from "./products";

/** The Store key back to the key Ops uses (`caterly` is `catering` in Ops). A key not listed is used as it is. */
export const opsKeyFor = (storeKey: string) => Object.entries(STORE_KEY_FOR_OPS_KEY).find(([, store]) => store === storeKey)?.[0] ?? storeKey;

/** Before a step that makes the business's Razorpay customer, hand Ops the Admin's phone and email from the Account. Never blocks the step: if it fails, Ops falls back to what it already holds and says what is missing. */
async function shareOwnerContact(session: Session | null, businessId: string, opsProductKey: string): Promise<void> {
  try {
    // The session holds the Platform user id; the Account's profile is keyed by the identity subject.
    const subject = session ? await findSubjectForUser(prisma, session.userId) : null;
    const profile = subject ? await getProfile(identityPool(), subject) : null;
    if (profile?.phone && profile.email) await sendOwnerContact({ businessId, opsProductKey, phone: profile.phone, email: profile.email });
  } catch (error) {
    console.error("[store] could not share the owner contact with Ops:", error);
  }
}

export type PurchaseFailure = "not_signed_in" | "no_business" | "not_admin" | "bad_request" | CheckoutFailure;
export type PurchaseResult<T> = { ok: true; answer: T } | { ok: false; reason: PurchaseFailure; message?: string; fields?: Record<string, string> };

const KEY = /^[a-z][a-z0-9_-]{0,39}$/;
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Who is buying, and for which business: the signed-in person's own, and only its active Admin may buy (the Old Admin may not). */
async function buyerBusiness(session: Session | null): Promise<{ ok: true; businessId: string } | { ok: false; reason: "not_signed_in" | "no_business" | "not_admin" }> {
  const access = await billingAccess(session);
  if (access.status === "ok") return { ok: true, businessId: access.businessId };
  return { ok: false, reason: access.status === "unauthenticated" ? "not_signed_in" : access.status };
}

/** Reads the billing details from the request into the shape Ops stores on the payment, and checks them with the same rules the form shows. */
export function readBuyer(input: unknown): { ok: true; buyer: Buyer } | { ok: false; fields: Record<string, string> } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const buyer: Buyer = { name: text(o.name, 120) ?? "", addressLine1: text(o.addressLine1, 200), addressLine2: text(o.addressLine2, 200), city: text(o.city, 80), state: text(o.state, 80), postalCode: text(o.postalCode, 12), country: text(o.country, 60) ?? "India", gstin: text(o.gstin, 15)?.toUpperCase() ?? null };
  const fields = checkBuyer(buyer) as Record<string, string>;
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, buyer };
}

export async function startPurchase(session: Session | null, input: { productKey?: unknown; planId?: unknown; interval?: unknown; buyer?: unknown }): Promise<PurchaseResult<StoreCheckoutAnswer>> {
  const who = await buyerBusiness(session);
  if (!who.ok) return who;
  const productKey = typeof input.productKey === "string" && KEY.test(input.productKey) ? input.productKey : null;
  const planId = text(input.planId, 80);
  const interval = input.interval === "MONTHLY" || input.interval === "ANNUAL" ? input.interval : null;
  if (!productKey || !planId || !interval) return { ok: false, reason: "bad_request" };
  const buyer = readBuyer(input.buyer);
  if (!buyer.ok) return { ok: false, reason: "bad_request", fields: buyer.fields };
  if (interval === "MONTHLY") await shareOwnerContact(session, who.businessId, opsKeyFor(productKey));
  const got = await startStoreCheckout({ businessId: who.businessId, opsProductKey: opsKeyFor(productKey), planId, interval, buyer: buyer.buyer });
  if (!got.ok) return got;
  return got;
}

/** Reads a verify request (an order's values, an auto-pay's values, or an auto-pay setup report) into the shape Ops takes; anything else is null. */
export const readVerifyRequest = (input: unknown): BillingVerifyRequest | null => {
  const parsed = parseBillingVerifyRequest(input);
  return parsed.ok ? parsed.value : null;
};

export async function finishPurchase(session: Session | null, input: { productKey?: unknown } & Record<string, unknown>): Promise<PurchaseResult<{ status: string | null; invoiceNumber: string | null }>> {
  const who = await buyerBusiness(session);
  if (!who.ok) return who;
  const productKey = typeof input.productKey === "string" && KEY.test(input.productKey) ? input.productKey : null;
  const values = readVerifyRequest(Object.fromEntries(Object.entries(input).filter(([k]) => k !== "productKey")));
  if (!productKey || !values) return { ok: false, reason: "bad_request" };
  return verifyStoreCheckout({ businessId: who.businessId, opsProductKey: opsKeyFor(productKey), ...values });
}

const planAndInterval = (input: { productKey?: unknown; planId?: unknown; interval?: unknown }) => {
  const productKey = typeof input.productKey === "string" && KEY.test(input.productKey) ? input.productKey : null;
  const planId = text(input.planId, 80);
  const interval: "MONTHLY" | "ANNUAL" | null = input.interval === "MONTHLY" ? "MONTHLY" : input.interval === "ANNUAL" ? "ANNUAL" : null;
  return productKey && planId && interval ? { productKey, planId, interval } : null;
};

/** The price of a plan for the signed-in person's own business, with any upgrade credit, as Ops works it out. */
export async function quotePurchase(session: Session | null, input: { productKey?: unknown; planId?: unknown; interval?: unknown }): Promise<PurchaseResult<StoreQuote>> {
  const who = await buyerBusiness(session);
  if (!who.ok) return who;
  const wanted = planAndInterval(input);
  if (!wanted) return { ok: false, reason: "bad_request" };
  return quoteStoreCheckout({ businessId: who.businessId, opsProductKey: opsKeyFor(wanted.productKey), planId: wanted.planId, interval: wanted.interval });
}

const CHANGES: readonly SubscriptionChange[] = ["downgrade", "undo-downgrade", "cancel", "reactivate"];

/** Downgrade at the end of the paid period, undo it, cancel (stop renewal) or reactivate, for the signed-in person's own business. */
export async function changePlan(session: Session | null, input: { change?: unknown; productKey?: unknown; planId?: unknown; interval?: unknown }): Promise<PurchaseResult<{ ok: true }>> {
  const who = await buyerBusiness(session);
  if (!who.ok) return who;
  const change = CHANGES.find((c) => c === input.change);
  const productKey = typeof input.productKey === "string" && KEY.test(input.productKey) ? input.productKey : null;
  if (!change || !productKey) return { ok: false, reason: "bad_request" };
  if (change === "downgrade") {
    const wanted = planAndInterval(input);
    if (!wanted) return { ok: false, reason: "bad_request" };
    return changeStoreSubscription({ businessId: who.businessId, opsProductKey: opsKeyFor(productKey), change, planId: wanted.planId, interval: wanted.interval });
  }
  return changeStoreSubscription({ businessId: who.businessId, opsProductKey: opsKeyFor(productKey), change });
}

// ---------- Saved payment methods ----------

export type MethodRequest =
  | { action: "list" | "add" | "autopay-pause" | "autopay-resume" | "autopay-cancel"; productKey: string }
  | { action: "primary" | "remove"; productKey: string; methodId: string }
  | { action: "add-verify"; productKey: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string }
  | { action: "primary-verify"; productKey: string; razorpaySubscriptionId: string; razorpayPaymentId: string; signature: string };

/** Reads a payment-method request: the product and one of the six actions with exactly the values it needs. Anything else is null. */
export function readMethodRequest(input: unknown): MethodRequest | null {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const productKey = typeof o.productKey === "string" && KEY.test(o.productKey) ? o.productKey : null;
  if (!productKey) return null;
  if (o.action === "list" || o.action === "add" || o.action === "autopay-pause" || o.action === "autopay-resume" || o.action === "autopay-cancel") return { action: o.action, productKey };
  if (o.action === "primary" || o.action === "remove") {
    const m = parseMethodRequest(o);
    return m.ok ? { action: o.action, productKey, methodId: m.value.methodId } : null;
  }
  if (o.action === "add-verify") {
    const v = parseVerifyRequest(o);
    return v.ok ? { action: "add-verify", productKey, ...v.value } : null;
  }
  if (o.action === "primary-verify") {
    const v = parseBillingVerifyRequest(o);
    return v.ok && "razorpaySubscriptionId" in v.value && "signature" in v.value ? { action: "primary-verify", productKey, razorpaySubscriptionId: v.value.razorpaySubscriptionId, razorpayPaymentId: v.value.razorpayPaymentId, signature: v.value.signature } : null;
  }
  return null;
}

export type MethodAnswer = MethodsAnswer | AddCardWindow | MakePrimaryWindow | { label: string } | { ok: true };

/** The Account's and Store's payment-method actions, for the signed-in person's own business and only its active Admin. Ops does the work. */
export async function managePaymentMethod(session: Session | null, input: unknown): Promise<PurchaseResult<MethodAnswer>> {
  const who = await buyerBusiness(session);
  if (!who.ok) return who;
  const request = readMethodRequest(input);
  if (!request) return { ok: false, reason: "bad_request" };
  const scope = { businessId: who.businessId, opsProductKey: opsKeyFor(request.productKey) };
  switch (request.action) {
    case "list": return listStoreMethods(scope);
    case "add": await shareOwnerContact(session, scope.businessId, scope.opsProductKey); return startStoreAddCard(scope);
    case "add-verify": return verifyStoreAddCard({ ...scope, razorpayOrderId: request.razorpayOrderId, razorpayPaymentId: request.razorpayPaymentId, signature: request.signature });
    case "primary": return startStoreMakePrimary({ ...scope, methodId: request.methodId });
    case "primary-verify": return verifyStoreMakePrimary({ ...scope, razorpaySubscriptionId: request.razorpaySubscriptionId, razorpayPaymentId: request.razorpayPaymentId, signature: request.signature });
    case "remove": return removeStoreMethod({ ...scope, methodId: request.methodId });
    case "autopay-pause": return changeStoreAutoPay({ ...scope, change: "pause" });
    case "autopay-resume": return changeStoreAutoPay({ ...scope, change: "resume" });
    case "autopay-cancel": return changeStoreAutoPay({ ...scope, change: "cancel" });
  }
}
