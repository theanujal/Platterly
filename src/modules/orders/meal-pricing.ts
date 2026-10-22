/**
 * The one pricing rule for Orders and Quotations (AJ, 2026-09-30). Pure, with no
 * server-only guard: the server's recalculation, the client's live preview and
 * the Menu Approvals pricing card all call these, so they cannot disagree.
 *
 * A meal costs its Menu's per-plate price x guests (the adults; children are charged by their own rules). Dishes inside the menu are
 * included and add nothing; only an Extra dish (charged per guest), an add-on,
 * or changing the Menu moves the price. With Individual Pricing on, the price
 * typed on the meal replaces the Menu's per-plate price (AJ, 2026-10-10): it is a per-plate price too, so the meal still
 * costs that price x guests.
 */

export interface PricingItem {
  itemType: string;
  unitPrice: number;
  quantity: number;
  isExtra?: boolean;
}

export interface PricingMeal {
  /** The per-plate price typed on the meal. Only used when Individual Pricing is on. */
  price: number | null;
  /** The assigned Menu's per-plate price, or null when no Menu is assigned. */
  menuPricePerPlate: number | null;
  items: PricingItem[];
}

/** Only add-ons and Extra dishes move the price; a dish inside the menu is included. */
export function itemMovesPrice(item: Pick<PricingItem, "itemType" | "isExtra">): boolean {
  return item.itemType === "ADD_ON" || item.isExtra === true;
}

export function extrasAndAddOnsAmount(items: PricingItem[]): number {
  return items.reduce((sum, item) => (itemMovesPrice(item) ? sum + item.unitPrice * item.quantity : sum), 0);
}

/** The meal's own amount, before extras and add-ons. */
export function mealBaseAmount(meal: Pick<PricingMeal, "price" | "menuPricePerPlate">, individualPricingEnabled: boolean, guests: number): number {
  return (individualPricingEnabled ? (meal.price ?? 0) : (meal.menuPricePerPlate ?? 0)) * guests;
}

export interface MealsPricing {
  /** Sum of every meal's base amount. */
  menuAmount: number;
  /** Sum of Extra dishes and add-ons across every meal. */
  extrasAmount: number;
  /** menuAmount + extrasAmount, before children, discount and charges. */
  mealsSubtotal: number;
}

export function priceMeals(meals: PricingMeal[], individualPricingEnabled: boolean, guests: number): MealsPricing {
  const menuAmount = meals.reduce((sum, meal) => sum + mealBaseAmount(meal, individualPricingEnabled, guests), 0);
  const extrasAmount = meals.reduce((sum, meal) => sum + extrasAndAddOnsAmount(meal.items), 0);
  return { menuAmount, extrasAmount, mealsSubtotal: menuAmount + extrasAmount };
}

/**
 * Guests the Menu's per-plate price applies to: the adults. Children have their own charge rules
 * (complimentary under 5 unless the Menu charges for them, a share of the plate price at 5–10), added separately.
 * An order that only recorded a total (the storefront) is priced on that total.
 */
export function menuGuestCount(order: { adultCount: number | null; totalParticipants: number | null }): number {
  return order.adultCount ?? order.totalParticipants ?? 0;
}

/** Per Plate or Percentage, as in the database's ChildPricingType (kept local so this file stays client-safe). */
export type ChildPricingType = "PERCENTAGE" | "FIXED";

export interface ChildPricingRates {
  childUnder5Chargeable: boolean;
  childUnder5Price: unknown;
  child5To10PricingType: ChildPricingType;
  child5To10PriceValue: unknown;
  pricePerPlate: unknown;
}

/**
 * Children Guests & Pricing charge (STANDARD) for one (Menu, below5Count,
 * 5-10Count) combination — under-5 is complimentary unless the Menu opted
 * into charging it; 5-10 always prices, either as a percentage of that
 * Menu's own pricePerPlate or a flat per-plate amount. `menu` is null when
 * no meal has an assigned Menu yet — degrades to 0, never throws.
 */
export function computeChildrenCharge(menu: ChildPricingRates | null, below5Count: number | null, child5To10Count: number | null): number {
  if (!menu) return 0;
  const below5 = below5Count ?? 0;
  const child5to10 = child5To10Count ?? 0;
  const under5Charge = menu.childUnder5Chargeable ? below5 * Number(menu.childUnder5Price ?? 0) : 0;
  const perChild5to10 =
    menu.child5To10PricingType === "PERCENTAGE"
      ? (Number(menu.pricePerPlate) * Number(menu.child5To10PriceValue ?? 0)) / 100
      : Number(menu.child5To10PriceValue ?? 0);
  return under5Charge + child5to10 * perChild5to10;
}

export interface IndividualChildRates {
  individualChildBelow5Rate: unknown;
  individualChildBelow5PricingType: ChildPricingType | null;
  individualChild5To10Rate: unknown;
  individualChild5To10PricingType: ChildPricingType | null;
}

/**
 * Children Guests & Pricing charge (INDIVIDUAL) — Create Order redesign
 * (2026-09-20): each child band gets its own Per Plate/Percentage type, not
 * just a flat rate. Percentage is computed against `referenceMenuPrice`
 * (the same first-assigned-Menu `pricePerPlate` STANDARD derives — see
 * deriveStandardChildPricingMenuId); a FIXED rate ignores it entirely.
 */
export function computeIndividualChildrenCharge(
  rates: IndividualChildRates | null,
  referenceMenuPrice: number,
  below5Count: number | null,
  child5To10Count: number | null,
): number {
  if (!rates) return 0;
  const below5 = below5Count ?? 0;
  const child5to10 = child5To10Count ?? 0;
  const perBelow5 =
    rates.individualChildBelow5PricingType === "PERCENTAGE"
      ? (referenceMenuPrice * Number(rates.individualChildBelow5Rate ?? 0)) / 100
      : Number(rates.individualChildBelow5Rate ?? 0);
  const per5to10 =
    rates.individualChild5To10PricingType === "PERCENTAGE"
      ? (referenceMenuPrice * Number(rates.individualChild5To10Rate ?? 0)) / 100
      : Number(rates.individualChild5To10Rate ?? 0);
  return below5 * perBelow5 + child5to10 * per5to10;
}

/**
 * The Menu Children Guests & Pricing prices against — "the menu remains the
 * same for everyone," so this is always the first Meal Planning entry's own
 * assigned Menu (by date; a stable sort preserves original submission order
 * as the tiebreaker for same-date meals), never a separate selector. Used
 * both as STANDARD's actual rate source and as INDIVIDUAL Percentage's
 * reference price (computeIndividualChildrenCharge) — so this is derived
 * regardless of pricingMethod. Null if no meal has a Menu assigned yet.
 */
export function deriveStandardChildPricingMenuId(entries: { date: Date | string; menuId?: string | null }[] | undefined): string | null {
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return sorted.find((e) => e.menuId)?.menuId ?? null;
}
