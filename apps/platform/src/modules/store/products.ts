import "server-only";
import { STORE_KEY_FOR_OPS_KEY, storeKeyFor, type PlatformBusinessBilling } from "@platterly/contract";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/session";
import { describeSubscription } from "./status";
import { loadAccountOverview } from "@/modules/account/overview";
import { isActiveAdminInDb } from "./billing-rights";
import { fetchOpsBilling, fetchOpsCatalogue, opsCatalogueConfigured } from "./ops-catalogue";
import { inr } from "./format";
import { pendingBuyerFor } from "./pending-buyer";
import { SAMPLE_BUNDLES, SAMPLE_PRODUCTS, type SampleBundle, type SampleProduct } from "./sample-catalogue";

/**
 * Where the Store gets its products. With Ops configured (OPS_BASE_URL and OPS_PLATFORM_READER_SECRET) the plans and prices are the real ones from Ops and
 * a failure is shown as "not available", never replaced by sample prices. Without it the prototype sample data is used (local and test runs).
 * Real mode also finds the signed-in person's business (their Platform membership; the Platform business id is the Ops business id) and reads that business's
 * subscriptions from Ops, so each product shows as subscribed, on trial or not subscribed. There are no bundles in real mode.
 */
/** `forbidden`: their membership no longer gives access. `not_admin`: they belong to the business but are not its active Admin (another role, or the Old Admin), so plans and payments are not theirs to see or change. */
export type StoreBusiness = { state: "none" } | { state: "forbidden" } | { state: "not_admin" } | { state: "ok"; id: string; name: string };
export type StoreProducts =
  | { source: "sample"; products: SampleProduct[]; bundles: SampleBundle[] }
  | {
      source: "ops";
      products: SampleProduct[];
      bundles: SampleBundle[];
      /** The business the signed-in person belongs to (item 2). `none`: they have not created one yet; `forbidden`: their membership no longer gives access. */
      business: StoreBusiness;
      /** `unavailable`: Ops could not be read for this business, so the products below show no subscription rather than a guessed one. */
      billing: "ok" | "unavailable" | "not_applicable";
    }
  | { source: "unavailable" };

/**
 * Ops still keys this product `catering`; everywhere a person sees it, and in Platform (Account, Store links), it is `caterly`. Platform does the renaming
 * here, so Ops's data and the signed Caterly-to-Ops links keep their key. A key not listed is used as Ops gives it.
 */
export { STORE_KEY_FOR_OPS_KEY, storeKeyFor };

/**
 * Puts a business's real subscriptions on the products. Ops keys the product `catering`; the Store calls it `caterly` (see storeKeyFor). Only a live
 * subscription counts: a trial is TRIAL, an ACTIVE or PAST_DUE paid plan is SUBSCRIBED, and a locked or cancelled one is shown as not subscribed.
 */
export function applyBilling(products: SampleProduct[], billing: PlatformBusinessBilling, now: Date = new Date()): SampleProduct[] {
  const byKey = new Map(billing.products.map((b) => [storeKeyFor(b.productKey), b.billing.subscription]));
  return products.map((product) => {
    const sub = byKey.get(product.key);
    if (!sub) return product;
    const display = describeSubscription(sub, now);
    if (sub.status === "TRIALING" && display.state === "trial") return { ...product, status: "TRIAL" as const, trialEndsAt: (sub.trialEndsAt ?? sub.currentPeriodEnd ?? sub.startDate).slice(0, 10), display };
    // A trial that has ended, a lock, and a plan past its grace are shown as not subscribed, with the reason on the card.
    if (display.state === "trial_ended" || display.state === "locked") return { ...product, display };
    if (sub.status === "ACTIVE" || sub.status === "PAST_DUE") {
      return {
        ...product,
        display,
        status: "SUBSCRIBED" as const,
        subscription: {
          planId: sub.plan.id,
          planName: sub.plan.name,
          interval: sub.billingInterval ?? "MONTHLY",
          nextRenewal: sub.currentPeriodEnd?.slice(0, 10) ?? "",
          ...(sub.pending ? { pending: { planId: sub.pending.planId, planName: sub.pending.planName, interval: sub.pending.interval ?? "MONTHLY" } } : {}),
          ...(sub.cancelledAt ? { cancelledAt: sub.cancelledAt.slice(0, 10) } : {}),
        },
      };
    }
    return product;
  });
}

export async function loadStoreProducts(session: Session | null = null): Promise<StoreProducts> {
  if (!opsCatalogueConfigured()) return { source: "sample", products: SAMPLE_PRODUCTS, bundles: SAMPLE_BUNDLES };
  const result = await fetchOpsCatalogue();
  if (!result.ok) return { source: "unavailable" };
  const products: SampleProduct[] = result.catalogue.products
    .filter((p) => p.plans.length > 0)
    .map((p) => {
      const from = Math.min(...p.plans.map((plan) => plan.monthly.total));
      return { key: storeKeyFor(p.productKey), name: p.name, tagline: `Plans from ${inr(from)} a month, GST included.`, status: "NONE", plans: p.plans };
    });

  const overview = await loadAccountOverview(prisma, session);
  const section = overview.status === "ok" ? overview.overview.business : null;
  if (!section || section.state === "none") {
    // A paid-plan sign-up that has not paid yet has no business: the Store treats the id reserved for them as theirs (see pending-buyer.ts).
    const pending = await pendingBuyerFor(session);
    if (!pending) return { source: "ops", products, bundles: [], business: { state: "none" }, billing: "not_applicable" };
    const business: StoreBusiness = { state: "ok", id: pending.businessId, name: pending.businessName };
    const billing = await fetchOpsBilling(business.id);
    if (!billing.ok) return { source: "ops", products, bundles: [], business, billing: billing.reason === "not_found" ? "ok" : "unavailable" };
    return { source: "ops", products: applyBilling(products, billing.billing), bundles: [], business, billing: "ok" };
  }
  if (section.state === "forbidden") return { source: "ops", products, bundles: [], business: { state: "forbidden" }, billing: "not_applicable" };
  // The Old Admin (a former Admin who stays on read-only) sees no prices or subscriptions: only the business's active Admin does.
  if (!(await isActiveAdminInDb(session?.userId ?? "", section.business.id))) return { source: "ops", products, bundles: [], business: { state: "not_admin" }, billing: "not_applicable" };
  const business: StoreBusiness = { state: "ok", id: section.business.id, name: section.business.name };
  const billing = await fetchOpsBilling(business.id);
  // A business Ops has no record of (not_found) simply has no subscriptions; any other failure is "unavailable", never a guess.
  if (!billing.ok) return { source: "ops", products, bundles: [], business, billing: billing.reason === "not_found" ? "ok" : "unavailable" };
  return { source: "ops", products: applyBilling(products, billing.billing), bundles: [], business, billing: "ok" };
}

export { opsKeyFor } from "./keys";
