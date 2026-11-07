import "server-only";
import { fetchOpsCatalogue, opsCatalogueConfigured } from "./ops-catalogue";
import { inr } from "./format";
import { SAMPLE_BUNDLES, SAMPLE_PRODUCTS, type SampleBundle, type SampleProduct } from "./sample-catalogue";

/**
 * Where the Store gets its products. With Ops configured (OPS_BASE_URL and OPS_PLATFORM_READER_SECRET) the plans and prices are the real ones from Ops and
 * a failure is shown as "not available", never replaced by sample prices. Without it the prototype sample data is used (local and test runs).
 * Real mode knows plans only: the business's own subscriptions are not read yet (F12.1.1), so every product shows as not subscribed, and there are no bundles.
 */
export type StoreProducts =
  | { source: "sample"; products: SampleProduct[]; bundles: SampleBundle[] }
  | { source: "ops"; products: SampleProduct[]; bundles: SampleBundle[] }
  | { source: "unavailable" };

/**
 * Ops still keys this product `catering`; everywhere a person sees it, and in Platform (Account, Store links), it is `caterly`. Platform does the renaming
 * here, so Ops's data and the signed Caterly-to-Ops links keep their key. A key not listed is used as Ops gives it.
 */
export const STORE_KEY_FOR_OPS_KEY: Record<string, string> = { catering: "caterly" };
export const storeKeyFor = (opsKey: string) => STORE_KEY_FOR_OPS_KEY[opsKey] ?? opsKey;

export async function loadStoreProducts(): Promise<StoreProducts> {
  if (!opsCatalogueConfigured()) return { source: "sample", products: SAMPLE_PRODUCTS, bundles: SAMPLE_BUNDLES };
  const result = await fetchOpsCatalogue();
  if (!result.ok) return { source: "unavailable" };
  const products: SampleProduct[] = result.catalogue.products
    .filter((p) => p.plans.length > 0)
    .map((p) => {
      const from = Math.min(...p.plans.map((plan) => plan.monthly.total));
      return { key: storeKeyFor(p.productKey), name: p.name, tagline: `Plans from ${inr(from)} a month, GST included.`, status: "NONE", plans: p.plans };
    });
  return { source: "ops", products, bundles: [] };
}
