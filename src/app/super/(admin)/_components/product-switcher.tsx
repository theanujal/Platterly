import { PRODUCT_SUBDOMAINS } from "@/lib/routing/hosts";

/**
 * The ops admin manages every Platterly product. Catering is the only one
 * today, so this is a static label; it becomes a real switcher (a route
 * segment such as /super/products/<product>/...) when a second product ships.
 */
export function ProductSwitcher() {
  return (
    <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium capitalize text-neutral-600" data-testid="product-switcher">
      Product: {PRODUCT_SUBDOMAINS[0]}
    </span>
  );
}
