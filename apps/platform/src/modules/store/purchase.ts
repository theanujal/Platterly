import "server-only";
import type { Buyer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/session";
import { loadAccountOverview } from "@/modules/account/overview";
import { checkBuyer } from "./buyer-check";
import { startStoreCheckout, verifyStoreCheckout, type CheckoutFailure } from "./ops-checkout";
import { STORE_KEY_FOR_OPS_KEY } from "./products";

/** The Store key back to the key Ops uses (`caterly` is `catering` in Ops). A key not listed is used as it is. */
export const opsKeyFor = (storeKey: string) => Object.entries(STORE_KEY_FOR_OPS_KEY).find(([, store]) => store === storeKey)?.[0] ?? storeKey;

export type PurchaseFailure = "not_signed_in" | "no_business" | "bad_request" | CheckoutFailure;
export type PurchaseResult<T> = { ok: true; answer: T } | { ok: false; reason: PurchaseFailure; message?: string; fields?: Record<string, string> };

const KEY = /^[a-z][a-z0-9_-]{0,39}$/;
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Who is buying, and for which business: the business is the signed-in person's own (never named by the request). */
async function buyerBusiness(session: Session | null): Promise<{ ok: true; businessId: string } | { ok: false; reason: "not_signed_in" | "no_business" }> {
  if (!session) return { ok: false, reason: "not_signed_in" };
  const overview = await loadAccountOverview(prisma, session);
  if (overview.status !== "ok") return { ok: false, reason: "not_signed_in" };
  const business = overview.overview.business;
  return business.state === "ok" ? { ok: true, businessId: business.business.id } : { ok: false, reason: "no_business" };
}

/** Reads the billing details from the request into the shape Ops stores on the payment, and checks them with the same rules the form shows. */
export function readBuyer(input: unknown): { ok: true; buyer: Buyer } | { ok: false; fields: Record<string, string> } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const buyer: Buyer = { name: text(o.name, 120) ?? "", addressLine1: text(o.addressLine1, 200), addressLine2: text(o.addressLine2, 200), city: text(o.city, 80), state: text(o.state, 80), postalCode: text(o.postalCode, 12), country: text(o.country, 60) ?? "India", gstin: text(o.gstin, 15)?.toUpperCase() ?? null };
  const fields = checkBuyer(buyer) as Record<string, string>;
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, buyer };
}

export async function startPurchase(session: Session | null, input: { productKey?: unknown; planId?: unknown; interval?: unknown; buyer?: unknown }): Promise<PurchaseResult<{ keyId: string; razorpayOrderId: string; amountPaise: number; businessName: string; description: string }>> {
  const who = await buyerBusiness(session);
  if (!who.ok) return who;
  const productKey = typeof input.productKey === "string" && KEY.test(input.productKey) ? input.productKey : null;
  const planId = text(input.planId, 80);
  const interval = input.interval === "MONTHLY" || input.interval === "ANNUAL" ? input.interval : null;
  if (!productKey || !planId || !interval) return { ok: false, reason: "bad_request" };
  const buyer = readBuyer(input.buyer);
  if (!buyer.ok) return { ok: false, reason: "bad_request", fields: buyer.fields };
  const got = await startStoreCheckout({ businessId: who.businessId, opsProductKey: opsKeyFor(productKey), planId, interval, buyer: buyer.buyer });
  if (!got.ok) return got;
  const { keyId, razorpayOrderId, amountPaise, businessName, description } = got.answer;
  return { ok: true, answer: { keyId, razorpayOrderId, amountPaise, businessName, description } };
}

export async function finishPurchase(session: Session | null, input: { productKey?: unknown; razorpayOrderId?: unknown; razorpayPaymentId?: unknown; signature?: unknown }): Promise<PurchaseResult<{ status: string | null; invoiceNumber: string | null }>> {
  const who = await buyerBusiness(session);
  if (!who.ok) return who;
  const productKey = typeof input.productKey === "string" && KEY.test(input.productKey) ? input.productKey : null;
  const razorpayOrderId = text(input.razorpayOrderId, 80);
  const razorpayPaymentId = text(input.razorpayPaymentId, 80);
  const signature = text(input.signature, 200);
  if (!productKey || !razorpayOrderId || !razorpayPaymentId || !signature) return { ok: false, reason: "bad_request" };
  return verifyStoreCheckout({ businessId: who.businessId, opsProductKey: opsKeyFor(productKey), razorpayOrderId, razorpayPaymentId, signature });
}
