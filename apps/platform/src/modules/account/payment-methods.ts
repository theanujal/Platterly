import "server-only";
import type { AutoPayStatus, MethodsAnswer, PaymentMethodView } from "@platterly/contract";
import type { Session } from "@/lib/session";
import { billingAccess, type BillingAccess } from "@/modules/store/billing-rights";
import { fetchOpsBilling, type BillingResult } from "@/modules/store/ops-catalogue";
import { listStoreMethods, type CheckoutResult } from "@/modules/store/ops-checkout";
import { storeKeyFor } from "@/modules/store/products";

/**
 * The Account's Payment method page: for each product the business has a subscription for, its plan, whether auto-pay is on and the saved payment methods
 * (labels only). Only the business's active Admin sees it (`billingAccess`); the business is the signed-in person's own, never one a request names. Product keys
 * are the Store's (`caterly`), as everywhere in the Platform.
 */
export type PaymentMethodsProduct = {
  productKey: string;
  product: string;
  planName: string;
  interval: "MONTHLY" | "ANNUAL" | null;
  autoPay: { status: AutoPayStatus; nextChargeAt: string | null } | null;
  methods: PaymentMethodView[];
  /** Ops could not list this product's methods just now; the rest of the page is still shown. */
  methodsUnavailable?: true;
};
export type PaymentMethodsResult =
  | { ok: true; businessName: string; products: PaymentMethodsProduct[] }
  | { ok: false; reason: "not_signed_in" | "no_business" | "not_admin" | "unavailable" };

type Deps = {
  access?: (session: Session | null) => Promise<BillingAccess>;
  billing?: (businessId: string) => Promise<BillingResult>;
  list?: (scope: { businessId: string; opsProductKey: string }) => Promise<CheckoutResult<MethodsAnswer>>;
};

export async function loadMyPaymentMethods(session: Session | null, deps: Deps = {}): Promise<PaymentMethodsResult> {
  const access = await (deps.access ?? billingAccess)(session);
  if (access.status !== "ok") return { ok: false, reason: access.status === "unauthenticated" ? "not_signed_in" : access.status };
  const got = await (deps.billing ?? fetchOpsBilling)(access.businessId);
  // Ops not knowing the business at all just means it has no billing yet.
  if (!got.ok) return got.reason === "not_found" ? { ok: true, businessName: access.businessName, products: [] } : { ok: false, reason: "unavailable" };
  const list = deps.list ?? listStoreMethods;
  const products: PaymentMethodsProduct[] = [];
  for (const p of got.billing.products) {
    const sub = p.billing.subscription;
    if (!sub) continue;
    const listed = await list({ businessId: access.businessId, opsProductKey: p.productKey });
    products.push({
      productKey: storeKeyFor(p.productKey),
      product: p.name,
      planName: sub.plan.name,
      interval: sub.billingInterval,
      autoPay: sub.autoPay ?? null,
      methods: listed.ok ? listed.answer.methods : [],
      ...(listed.ok ? {} : { methodsUnavailable: true as const }),
    });
  }
  return { ok: true, businessName: access.businessName, products };
}

