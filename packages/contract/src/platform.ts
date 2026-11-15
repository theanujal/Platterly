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
/**
 * The Store's buy calls (Platform to Ops, signed with the platform-billing secret, which is separate from the read-only platform-reader secret):
 * POST .../checkout starts a payment for a plan and interval, POST .../verify confirms what Razorpay Checkout returned. Same bodies as the
 * product billing API (`parseCheckoutRequest`, `parseBillingVerifyRequest`). The business and product are in the path, so a signature for one
 * business's route is no good for another's.
 */
export const PLATFORM_BILLING_ACTIONS = ["checkout", "verify", "quote", "downgrade", "undo-downgrade", "cancel", "reactivate", "methods", "method-add", "method-add-verify", "method-primary", "method-primary-verify", "method-remove", "autopay-pause", "autopay-resume", "autopay-cancel", "owner-contact", "register-pending", "abandon-pending", "refund-request"] as const;
export type PlatformBillingAction = (typeof PLATFORM_BILLING_ACTIONS)[number];
export const platformCheckoutPath = (businessId: string, productKey: string, action: PlatformBillingAction) => `/api/platform/businesses/${businessId}/products/${productKey}/billing/${action}`;
/**
 * A paid invoice as a PDF, for the Platform's Invoices page (a signed GET with the read-only platform-reader secret; the answer is signed JSON
 * `{ fileName, pdfBase64 }`). Scoped to one business and product, so a payment id from another business is a 404.
 */
export const platformInvoicePath = (businessId: string, productKey: string, paymentId: string) => `/api/platform/businesses/${businessId}/products/${productKey}/billing/payments/${paymentId}/invoice`;
export const PLATFORM_INVOICE_PATH_PATTERN = /^\/api\/platform\/businesses\/biz_[0-9a-f]{32}\/products\/[a-z][a-z0-9-]{1,31}\/billing\/payments\/[A-Za-z0-9_-]{1,64}\/invoice$/;
/** A refund's credit note as a PDF, for the Account (a signed GET with the read-only secret; the answer is signed JSON `{ fileName, pdfBase64 }`). Scoped to one business and product. */
export const platformCreditNotePath = (businessId: string, productKey: string, refundId: string) => `/api/platform/businesses/${businessId}/products/${productKey}/billing/refunds/${refundId}/credit-note`;
export const PLATFORM_CREDIT_NOTE_PATH_PATTERN = /^\/api\/platform\/businesses\/biz_[0-9a-f]{32}\/products\/[a-z][a-z0-9-]{1,31}\/billing\/refunds\/[A-Za-z0-9_-]{1,64}\/credit-note$/;
export const PLATFORM_CHECKOUT_PATH_PATTERN = /^\/api\/platform\/businesses\/biz_[0-9a-f]{32}\/products\/[a-z][a-z0-9-]{1,31}\/billing\/(?:checkout|verify|quote|downgrade|undo-downgrade|cancel|reactivate|methods|method-add|method-add-verify|method-primary|method-primary-verify|method-remove|autopay-pause|autopay-resume|autopay-cancel|owner-contact|register-pending|abandon-pending|refund-request)$/;
export const PLATFORM_BILLING_PATH_PATTERN = /^\/api\/platform\/businesses\/biz_[0-9a-f]{32}\/billing$/;

export interface PlatformBusinessBilling {
  businessId: string;
  generatedAt: string;
  products: {
    productKey: string;
    name: string;
    billing: BillingView;
    /** Payments that did not complete (newest first, at most 20): started and abandoned, or failed. Paid ones are in `billing.payments`. Absent from an older Ops. */
    attempts?: { id: string; planName: string; interval: "MONTHLY" | "ANNUAL"; total: number; status: "PENDING" | "FAILED"; createdAt: string; failureReason: string | null }[];
  }[];
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

/**
 * Ops still keys the catering product `catering`; everywhere a person sees it, and in Platform (Account, Store links), it is `caterly`. Ops and Platform share this
 * one map: Platform renames Ops's key for the Store, and Ops builds the Store's `/manage/<key>` links in its emails with it. A key not listed is used as it is.
 */
export const STORE_KEY_FOR_OPS_KEY: Record<string, string> = { catering: "caterly" };
export const storeKeyFor = (opsKey: string): string => STORE_KEY_FOR_OPS_KEY[opsKey] ?? opsKey;

/**
 * The product cards the Account's My Products page shows (AJ, 2026-11-15): every live product and every upcoming one staff have made visible, with the line,
 * the picture and, for an upcoming one, the launch date. Ops owns all of it; the platform signs the request with the platform-reader secret and Ops signs the answer.
 * Additive: a platform that does not know this path simply never asks.
 */
export const PLATFORM_PRODUCT_CARDS_PATH = "/api/platform/product-cards";
export const platformProductCardImagePath = (name: string) => `/api/platform/product-cards/image/${encodeURIComponent(name)}`;
export const PLATFORM_PRODUCT_CARD_IMAGE_PATH_PATTERN = /^\/api\/platform\/product-cards\/image\/[a-z0-9][a-z0-9._-]{0,120}$/;

/** The pictures every product card can use without an upload. Staff pick one by name; the platform and Ops each ship the same files. */
export const BUILTIN_CARD_IMAGES = ["cloche", "growth", "clipboard", "donut", "boxes"] as const;
export type BuiltinCardImage = (typeof BUILTIN_CARD_IMAGES)[number];

const UPLOAD_NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;
/** `builtin:<name>` for one of the built-in pictures, or `upload:<file name>` for a picture staff uploaded to Ops's picture library. */
export function isCardImageRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.startsWith("builtin:")) return (BUILTIN_CARD_IMAGES as readonly string[]).includes(value.slice(8));
  return value.startsWith("upload:") && UPLOAD_NAME.test(value.slice(7)) && !value.includes("..");
}

/** The icons a product's "What you can do" items can use; each name is drawn by the Account. */
export const FEATURE_ICONS = ["users", "menus", "orders", "payments", "calendar", "delivery", "reports", "security"] as const;
export type FeatureIcon = (typeof FEATURE_ICONS)[number];
export interface ProductFeature {
  icon: FeatureIcon;
  title: string;
  text: string;
}
export const MAX_FEATURES = 4;
export const ABOUT_MAX = 600;

/** The features as stored: a list of at most MAX_FEATURES items, each with a known icon and short texts. Null when it is not that. */
export function parseFeatures(value: unknown): ProductFeature[] | null {
  if (!Array.isArray(value) || value.length > MAX_FEATURES) return null;
  const out: ProductFeature[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { icon, title, text } = item;
    if (typeof icon !== "string" || !(FEATURE_ICONS as readonly string[]).includes(icon)) return null;
    if (typeof title !== "string" || !title.trim() || title.length > 80 || typeof text !== "string" || text.length > 200) return null;
    out.push({ icon: icon as FeatureIcon, title, text });
  }
  return out;
}

export interface PlatformProductCard {
  /** Ops's key: `catering` for Caterly, `rivo` for an upcoming product. */
  key: string;
  name: string;
  /** The one-line description under the name. */
  tagline: string | null;
  image: string | null;
  /** The logo for the card's tile (`upload:<file>`), or null: the tile then shows the first letter. Added after the first release, so an older answer without it reads as null. */
  logo: string | null;
  /** The details page: a paragraph about the product and its "What you can do" items. Added later, so an older answer without them reads as null and none. */
  about: string | null;
  features: ProductFeature[];
  /** LIVE: on sale (or, for an upcoming product staff switched to live). UPCOMING: the card says "Coming soon" and counts down to `launchAt`. */
  status: "LIVE" | "UPCOMING";
  launchAt: string | null;
}

export interface PlatformProductCards {
  generatedAt: string;
  products: PlatformProductCard[];
}

export function parsePlatformProductCards(input: unknown): ParseResult<PlatformProductCards> {
  if (!isRecord(input)) return fail("the cards must be an object");
  const { generatedAt, products } = input;
  if (!isIsoDate(generatedAt)) return fail("generatedAt must be a date");
  if (!Array.isArray(products) || products.length > 100) return fail("products must be a list");
  const seen = new Set<string>();
  const out: PlatformProductCard[] = [];
  for (const item of products) {
    if (!isRecord(item)) return fail("each card must be an object");
    const { key, name, tagline, image, status, launchAt } = item;
    const about = item.about ?? null;
    if (about !== null && (typeof about !== "string" || about.length > ABOUT_MAX)) return fail("about must be text or null");
    const features = item.features === undefined ? [] : parseFeatures(item.features);
    if (features === null) return fail("features are not valid");
    const logo = item.logo ?? null;
    if (logo !== null && !(typeof logo === "string" && logo.startsWith("upload:") && isCardImageRef(logo))) return fail("logo is not an uploaded picture");
    if (typeof key !== "string" || !isProductKey(key)) return fail("a card key is not valid");
    if (seen.has(key)) return fail(`card ${key} is repeated`);
    seen.add(key);
    if (typeof name !== "string" || !name.trim() || name.length > 200) return fail("a card needs a name");
    if (tagline !== null && (typeof tagline !== "string" || tagline.length > 300)) return fail("tagline must be text or null");
    if (image !== null && !isCardImageRef(image)) return fail("image is not a known picture");
    if (status !== "LIVE" && status !== "UPCOMING") return fail("status must be LIVE or UPCOMING");
    if (launchAt !== null && !isIsoDate(launchAt)) return fail("launchAt must be a date or null");
    out.push({ key, name, tagline, image, logo, about, features, status, launchAt });
  }
  return ok({ generatedAt, products: out });
}
