import { fail, isRecord, ok, type ParseResult } from "./result";
import { BILLING_INTERVALS, type BillingInterval, type SubscriptionStatus } from "./version";

/**
 * The billing API (docs/ops-contract.md section 8.1): what a product asks ops for, so the owner-facing billing screens can
 * stay in the product while the data and the money stay in ops. Every call is signed by the product and scoped to one
 * business the product registered. These are the request shapes (with parsers) and the answer shapes.
 */

/** The business as it should appear on an invoice, frozen into the invoice when the payment is confirmed. */
export interface Buyer {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  gstin: string | null;
}

function text(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && value.length <= max ? value.trim() || null : undefined;
}

export function parseBuyer(input: unknown): ParseResult<Buyer> {
  if (!isRecord(input)) return fail("buyer must be an object");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 200) return fail("buyer.name is required");
  const out: Record<string, string | null> = {};
  for (const key of ["addressLine1", "addressLine2", "city", "state", "postalCode", "country", "gstin"]) {
    const value = text(input[key], 200);
    if (value === undefined) return fail(`buyer.${key} must be short text`);
    out[key] = value;
  }
  return ok({ name, ...out } as unknown as Buyer);
}

/** What Razorpay last said about a monthly auto-pay (Razorpay Subscriptions). Yearly and hand-assigned plans have none. */
export const AUTO_PAY_STATUSES = ["ACTIVE", "PENDING", "PAUSED", "HALTED", "CANCELLED"] as const;
export type AutoPayStatus = (typeof AUTO_PAY_STATUSES)[number];

export interface CheckoutRequest {
  planId: string;
  interval: BillingInterval;
  buyer: Buyer;
  /** The product can open Razorpay's auto-pay window. A monthly checkout with this set is a Razorpay subscription, not an order. */
  autoPay?: true;
}

export function parseCheckoutRequest(input: unknown): ParseResult<CheckoutRequest> {
  if (!isRecord(input)) return fail("body must be an object");
  if (typeof input.planId !== "string" || !input.planId) return fail("planId is required");
  if (!BILLING_INTERVALS.includes(input.interval as BillingInterval)) return fail("interval must be MONTHLY or ANNUAL");
  const buyer = parseBuyer(input.buyer);
  if (!buyer.ok) return buyer;
  return ok({ planId: input.planId, interval: input.interval as BillingInterval, buyer: buyer.value, ...(input.autoPay === true ? { autoPay: true as const } : {}) });
}

export interface VerifyRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}

export function parseVerifyRequest(input: unknown): ParseResult<VerifyRequest> {
  if (!isRecord(input)) return fail("body must be an object");
  const { razorpayOrderId, razorpayPaymentId, signature } = input;
  if (typeof razorpayOrderId !== "string" || !/^[\w-]{3,64}$/.test(razorpayOrderId)) return fail("razorpayOrderId is invalid");
  if (typeof razorpayPaymentId !== "string" || !/^[\w-]{3,64}$/.test(razorpayPaymentId)) return fail("razorpayPaymentId is invalid");
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return fail("signature is invalid");
  return ok({ razorpayOrderId, razorpayPaymentId, signature });
}

/** Why an auto-pay setup didn't finish, as the owner's checkout window saw it: declined, or closed or stopped partway. */
export const AUTO_PAY_FAILURES = ["declined", "not_finished"] as const;
export type AutoPayFailure = (typeof AUTO_PAY_FAILURES)[number];

/**
 * The plan verify call (monthly plans can be auto-pay). An order, as for stands and yearly plans; an auto-pay subscription's
 * first payment; or a setup that failed, which only the product sees (Razorpay's webhook for it names no subscription).
 */
export type BillingVerifyRequest =
  | VerifyRequest
  | { razorpaySubscriptionId: string; razorpayPaymentId: string; signature: string }
  | { razorpaySubscriptionId: string; failed: { reason: AutoPayFailure; detail: string | null } };

export function parseBillingVerifyRequest(input: unknown): ParseResult<BillingVerifyRequest> {
  if (!isRecord(input) || input.razorpaySubscriptionId === undefined) return parseVerifyRequest(input);
  const { razorpayOrderId, razorpaySubscriptionId, razorpayPaymentId, signature, failed } = input;
  if (razorpayOrderId !== undefined) return fail("send razorpayOrderId or razorpaySubscriptionId, not both");
  if (typeof razorpaySubscriptionId !== "string" || !/^[\w-]{3,64}$/.test(razorpaySubscriptionId)) return fail("razorpaySubscriptionId is invalid");
  if (failed !== undefined) {
    if (!isRecord(failed) || !AUTO_PAY_FAILURES.includes(failed.reason as AutoPayFailure)) return fail("failed.reason must be declined or not_finished");
    if (failed.detail !== undefined && failed.detail !== null && (typeof failed.detail !== "string" || failed.detail.length > 500)) return fail("failed.detail is invalid");
    const detail = typeof failed.detail === "string" ? failed.detail.trim() || null : null;
    return ok({ razorpaySubscriptionId, failed: { reason: failed.reason as AutoPayFailure, detail } });
  }
  if (typeof razorpayPaymentId !== "string" || !/^[\w-]{3,64}$/.test(razorpayPaymentId)) return fail("razorpayPaymentId is invalid");
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return fail("signature is invalid");
  return ok({ razorpaySubscriptionId, razorpayPaymentId, signature });
}

export interface DowngradeRequest {
  planId: string;
  interval: BillingInterval;
}

export function parseDowngradeRequest(input: unknown): ParseResult<DowngradeRequest> {
  if (!isRecord(input)) return fail("body must be an object");
  if (typeof input.planId !== "string" || !input.planId) return fail("planId is required");
  if (!BILLING_INTERVALS.includes(input.interval as BillingInterval)) return fail("interval must be MONTHLY or ANNUAL");
  return ok({ planId: input.planId, interval: input.interval as BillingInterval });
}

/* ---------- answers ---------- */

export interface PriceView {
  amount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
}

export interface PlanOffer {
  id: string;
  code: string;
  name: string;
  description: string | null;
  highlights: string[];
  monthly: PriceView;
  annual: PriceView | null;
}

export interface BillingView {
  onlineBillingAvailable: boolean;
  subscription: {
    id: string;
    status: SubscriptionStatus;
    plan: { id: string; code: string; name: string };
    billingInterval: BillingInterval | null;
    startDate: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    pending: { planId: string; planName: string; interval: BillingInterval | null } | null;
    /** Monthly auto-pay; null (or absent, from an older ops) for yearly and hand-assigned plans. `nextChargeAt` only while it is on. */
    autoPay?: { status: AutoPayStatus; nextChargeAt: string | null } | null;
  } | null;
  history: { id: string; planName: string; status: SubscriptionStatus; startDate: string; endDate: string | null }[];
  payments: { id: string; planName: string; interval: BillingInterval; total: number; paidAt: string | null; periodStart: string | null; periodEnd: string | null; invoiceNumber: string | null }[];
}

export interface OrderCheckoutAnswer {
  kind?: "order";
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  businessName: string;
  description: string;
}

export interface AutoPayCheckoutAnswer {
  kind: "subscription";
  keyId: string;
  razorpaySubscriptionId: string;
  amountPaise: number;
  businessName: string;
  description: string;
  /** Set when the first charge waits for days already paid for: Razorpay only takes the mandate (a refundable ₹5) now. */
  startsAt: string | null;
}

/** An order unless the product asked for `autoPay` on a monthly plan. */
export type CheckoutAnswer = OrderCheckoutAnswer | AutoPayCheckoutAnswer;
