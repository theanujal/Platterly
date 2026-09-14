// No "server-only" guard here (unlike the rest of this module) — pure math,
// no DB/fs access, and the Package form's live price preview imports this
// directly so the client-side estimate can never drift from the server's
// authoritative calculation.
export class GuestCountOutOfRangeError extends Error {}

export interface PackagePricingInput {
  pricingModel: "FIXED" | "PER_PERSON";
  fixedPrice: number | null;
  perPersonPrice: number | null;
  minGuests: number | null;
  maxGuests: number | null;
}

export interface PackageItemSelection {
  isOptional: boolean;
  isAddOn: boolean;
  extraPrice: number | null;
  /** Included items (neither optional nor add-on) are always priced in — this only gates optional/add-on items. */
  selected?: boolean;
}

/**
 * Chunk 6 Group 6.1 verify step. Base price is fixedPrice, or
 * perPersonPrice * guestCount for PER_PERSON packages. Selected
 * optional/add-on items add their extraPrice on top — per-guest for
 * PER_PERSON packages (an extra dessert costs more the more guests order
 * it), flat for FIXED packages (the roadmap gives no per-guest unit to
 * scale a flat package's add-ons by).
 */
export function calculatePackagePrice(
  pkg: PackagePricingInput,
  guestCount: number,
  items: PackageItemSelection[] = [],
): number {
  if (pkg.minGuests != null && guestCount < pkg.minGuests) {
    throw new GuestCountOutOfRangeError(`Guest count must be at least ${pkg.minGuests}.`);
  }
  if (pkg.maxGuests != null && guestCount > pkg.maxGuests) {
    throw new GuestCountOutOfRangeError(`Guest count must be at most ${pkg.maxGuests}.`);
  }

  const isPerPerson = pkg.pricingModel === "PER_PERSON";
  let total = isPerPerson ? (pkg.perPersonPrice ?? 0) * guestCount : (pkg.fixedPrice ?? 0);

  for (const item of items) {
    const included = !item.isOptional && !item.isAddOn;
    if (!included && !item.selected) continue;
    const extra = item.extraPrice ?? 0;
    total += isPerPerson ? extra * guestCount : extra;
  }

  return total;
}
