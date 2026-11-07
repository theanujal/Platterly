import { fail, isIsoDate, isRecord, ok, type ParseResult } from "./result";
import { isId, isProductKey } from "./ids";
import type { BillingView, PlanOffer, PriceView } from "./billing";

/**
 * The product list Platterly Ops gives the platform (docs/platform-foundation-plan.md section 5a). Read-only: no secrets,
 * no plans, no prices. The platform signs the request with its own "platform-reader" secret and Ops signs the answer.
 */
export const PLATFORM_PRODUCTS_PATH = "/api/platform/products";

export interface PlatformProduct {
  productKey: string;
  name: string;
  baseUrl: string;
  active: boolean;
}

export interface PlatformProductList {
  /** Goes up by one every time the list changes, never down. The platform ignores a list older than the one it holds. */
  listVersion: number;
  generatedAt: string;
  products: PlatformProduct[];
}

export function parsePlatformProductList(input: unknown): ParseResult<PlatformProductList> {
  if (!isRecord(input)) return fail("the list must be an object");
  const { listVersion, generatedAt, products } = input;
  if (typeof listVersion !== "number" || !Number.isInteger(listVersion) || listVersion < 0) return fail("listVersion must be a whole number");
  if (!isIsoDate(generatedAt)) return fail("generatedAt must be a date");
  if (!Array.isArray(products) || products.length > 200) return fail("products must be a list");
  const seen = new Set<string>();
  const out: PlatformProduct[] = [];
  for (const item of products) {
    if (!isRecord(item)) return fail("each product must be an object");
    const { productKey, name, baseUrl, active } = item;
    if (typeof productKey !== "string" || !isProductKey(productKey)) return fail("productKey is not valid");
    if (seen.has(productKey)) return fail(`productKey ${productKey} is repeated`);
    seen.add(productKey);
    if (typeof name !== "string" || !name.trim() || name.length > 200) return fail("name is required");
    if (typeof baseUrl !== "string" || !/^https?:\/\/[^/\s]+$/.test(baseUrl) || baseUrl.length > 300) return fail("baseUrl must be an origin");
    if (typeof active !== "boolean") return fail("active must be true or false");
    out.push({ productKey, name, baseUrl, active });
  }
  return ok({ listVersion, generatedAt, products: out });
}

/**
 * The plans on sale, per active product, for the Platform's Store (Store first slice, F14.1.1). Public price information only: the same plans a
 * product's own plan chooser shows, GST worked out. No business, subscription, payment, secret or staff data. Same signing as the product list.
 */
export const PLATFORM_PLANS_PATH = "/api/platform/plans";

export interface PlatformCatalogueProduct {
  productKey: string;
  name: string;
  plans: PlanOffer[];
}

export interface PlatformPlanCatalogue {
  generatedAt: string;
  products: PlatformCatalogueProduct[];
}

const money = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9;

function parsePrice(input: unknown): ParseResult<PriceView> {
  if (!isRecord(input)) return fail("a price must be an object");
  const { amount, gstPercent, gstAmount, total } = input;
  if (!money(amount) || !money(gstPercent) || !money(gstAmount) || !money(total)) return fail("a price needs amount, gstPercent, gstAmount and total as numbers");
  return ok({ amount, gstPercent, gstAmount, total });
}

function parsePlan(input: unknown): ParseResult<PlanOffer> {
  if (!isRecord(input)) return fail("each plan must be an object");
  const { id, code, name, description, highlights, monthly, annual } = input;
  if (typeof id !== "string" || !id || id.length > 100) return fail("a plan needs an id");
  if (typeof code !== "string" || !code || code.length > 100) return fail("a plan needs a code");
  if (typeof name !== "string" || !name.trim() || name.length > 200) return fail("a plan needs a name");
  if (description !== null && (typeof description !== "string" || description.length > 2000)) return fail("description must be text or null");
  if (!Array.isArray(highlights) || highlights.length > 50 || highlights.some((h) => typeof h !== "string" || h.length > 300)) return fail("highlights must be a list of text");
  const m = parsePrice(monthly);
  if (!m.ok) return m;
  let a: PriceView | null = null;
  if (annual !== null) {
    const parsed = parsePrice(annual);
    if (!parsed.ok) return parsed;
    a = parsed.value;
  }
  return ok({ id, code, name, description, highlights: highlights as string[], monthly: m.value, annual: a });
}

export function parsePlatformPlanCatalogue(input: unknown): ParseResult<PlatformPlanCatalogue> {
  if (!isRecord(input)) return fail("the catalogue must be an object");
  const { generatedAt, products } = input;
  if (!isIsoDate(generatedAt)) return fail("generatedAt must be a date");
  if (!Array.isArray(products) || products.length > 200) return fail("products must be a list");
  const seen = new Set<string>();
  const out: PlatformCatalogueProduct[] = [];
  for (const item of products) {
    if (!isRecord(item)) return fail("each product must be an object");
    const { productKey, name, plans } = item;
    if (typeof productKey !== "string" || !isProductKey(productKey)) return fail("productKey is not valid");
    if (seen.has(productKey)) return fail(`productKey ${productKey} is repeated`);
    seen.add(productKey);
    if (typeof name !== "string" || !name.trim() || name.length > 200) return fail("name is required");
    if (!Array.isArray(plans) || plans.length > 100) return fail("plans must be a list");
    const parsed: PlanOffer[] = [];
    for (const plan of plans) {
      const p = parsePlan(plan);
      if (!p.ok) return p;
      parsed.push(p.value);
    }
    out.push({ productKey, name, plans: parsed });
  }
  return ok({ generatedAt, products: out });
}

/**
 * One business's subscriptions and payments, per product it is linked to, for the Platform's Store and Account (F12.1.1). The platform signs the
 * request with the platform-reader secret and Ops signs the answer. Ops does not decide who may see this: the platform checks that the signed-in
 * person is a member with the right to view billing before it asks. The path carries the business id, so it is part of the signature.
 */
export const platformBillingPath = (businessId: string) => `/api/platform/businesses/${businessId}/billing`;
export const PLATFORM_BILLING_PATH_PATTERN = /^\/api\/platform\/businesses\/biz_[0-9a-f]{32}\/billing$/;

export interface PlatformBusinessBilling {
  businessId: string;
  generatedAt: string;
  products: { productKey: string; name: string; billing: BillingView }[];
}

const nullableIso = (v: unknown) => v === null || isIsoDate(v);

export function parsePlatformBusinessBilling(input: unknown): ParseResult<PlatformBusinessBilling> {
  if (!isRecord(input)) return fail("the answer must be an object");
  const { businessId, generatedAt, products } = input;
  if (!isId("business", businessId)) return fail("businessId is not valid");
  if (!isIsoDate(generatedAt)) return fail("generatedAt must be a date");
  if (!Array.isArray(products) || products.length > 200) return fail("products must be a list");
  const out: PlatformBusinessBilling["products"] = [];
  for (const item of products) {
    if (!isRecord(item)) return fail("each product must be an object");
    const { productKey, name, billing } = item;
    if (typeof productKey !== "string" || !isProductKey(productKey)) return fail("productKey is not valid");
    if (typeof name !== "string" || !name.trim()) return fail("name is required");
    if (!isRecord(billing) || typeof billing.onlineBillingAvailable !== "boolean") return fail("billing is malformed");
    if (!Array.isArray(billing.history) || !Array.isArray(billing.payments)) return fail("billing history and payments must be lists");
    const sub = billing.subscription;
    if (sub !== null) {
      if (!isRecord(sub) || typeof sub.id !== "string" || typeof sub.status !== "string" || !isRecord(sub.plan) || typeof sub.plan.name !== "string") return fail("the subscription is malformed");
      if (!isIsoDate(sub.startDate) || !nullableIso(sub.trialEndsAt) || !nullableIso(sub.currentPeriodEnd)) return fail("subscription dates must be dates");
    }
    for (const h of billing.history) if (!isRecord(h) || typeof h.id !== "string" || typeof h.planName !== "string" || !isIsoDate(h.startDate) || !nullableIso(h.endDate)) return fail("a history row is malformed");
    for (const pay of billing.payments) if (!isRecord(pay) || typeof pay.id !== "string" || typeof pay.planName !== "string" || !money(pay.total) || !nullableIso(pay.paidAt)) return fail("a payment row is malformed");
    out.push({ productKey, name, billing: billing as unknown as BillingView });
  }
  return ok({ businessId, generatedAt, products: out });
}
