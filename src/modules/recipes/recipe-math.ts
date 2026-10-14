/** Pure recipe maths — no database, so the UI preview and the server share one rule. */

export interface RecipeLine {
  inventoryId: string;
  name: string;
  unit: string;
  /** Quantity needed to make `yieldServings` servings. */
  quantity: number;
}

/** Quantity of one ingredient needed for `servings`, rounded to 3 places (the column's precision). */
export function scaleQuantity(quantity: number, yieldServings: number, servings: number): number {
  if (yieldServings <= 0) throw new Error("Recipe yield must be greater than zero.");
  if (servings < 0) throw new Error("Servings cannot be negative.");
  return Math.round(((quantity * servings) / yieldServings) * 1000) / 1000;
}

export function scaleRecipe(lines: RecipeLine[], yieldServings: number, servings: number) {
  return lines.map((line) => ({ ...line, needed: scaleQuantity(line.quantity, yieldServings, servings) }));
}

// Recipe cost is not computed here: it comes from the batches the ingredients would be taken from (recipe-cost-math.ts).

// Weights and volumes can be entered in the small unit while stock is kept in the big one (700 g of a kg item).
const UNIT_FAMILIES: Record<string, { base: string; factor: number }> = {
  kg: { base: "kg", factor: 1 },
  g: { base: "kg", factor: 0.001 },
  ltr: { base: "ltr", factor: 1 },
  ml: { base: "ltr", factor: 0.001 },
};

/** The units a quantity can be entered in for an item stocked in `stockUnit`: kg or g, ltr or ml, otherwise only its own unit. */
export function enterableUnits(stockUnit: string): string[] {
  const family = UNIT_FAMILIES[stockUnit];
  if (!family) return [stockUnit];
  return Object.keys(UNIT_FAMILIES).filter((u) => UNIT_FAMILIES[u].base === family.base);
}

/** A quantity entered in `unit` expressed in the item's stock unit, rounded to the column's 3 places. */
export function toStockUnit(quantity: number, unit: string, stockUnit: string): number {
  const from = UNIT_FAMILIES[unit];
  const to = UNIT_FAMILIES[stockUnit];
  if (!from || !to || from.base !== to.base) return quantity;
  return Math.round(((quantity * from.factor) / to.factor) * 1000) / 1000;
}

/** A stored stock-unit quantity shown the way a cook says it: 0.7 kg becomes 700 g, 2 kg stays 2 kg. */
export function friendlyQuantity(quantity: number, stockUnit: string): { quantity: number; unit: string } {
  const family = UNIT_FAMILIES[stockUnit];
  const small = family && Object.keys(UNIT_FAMILIES).find((u) => u !== family.base && UNIT_FAMILIES[u].base === family.base);
  if (family && stockUnit === family.base && small && quantity > 0 && quantity < 1) {
    return { quantity: Math.round(quantity * 1000 * 1000) / 1000, unit: small };
  }
  return { quantity, unit: stockUnit };
}
