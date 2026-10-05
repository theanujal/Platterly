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

export interface CheckoutRequest {
  planId: string;
  interval: BillingInterval;
  buyer: Buyer;
}

export function parseCheckoutRequest(input: unknown): ParseResult<CheckoutRequest> {
  if (!isRecord(input)) return fail("body must be an object");
  if (typeof input.planId !== "string" || !input.planId) return fail("planId is required");
  if (!BILLING_INTERVALS.includes(input.interval as BillingInterval)) return fail("interval must be MONTHLY or ANNUAL");
  const buyer = parseBuyer(input.buyer);
  if (!buyer.ok) return buyer;
  return ok({ planId: input.planId, interval: input.interval as BillingInterval, buyer: buyer.value });
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
  } | null;
  history: { id: string; planName: string; status: SubscriptionStatus; startDate: string; endDate: string | null }[];
  payments: { id: string; planName: string; interval: BillingInterval; total: number; paidAt: string | null; periodStart: string | null; periodEnd: string | null; invoiceNumber: string | null }[];
}

export interface CheckoutAnswer {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  businessName: string;
  description: string;
}
