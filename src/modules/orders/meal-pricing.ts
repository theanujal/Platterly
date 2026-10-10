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
