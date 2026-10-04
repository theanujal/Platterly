/** Pure recipe maths — no database, so the UI preview and the server share one rule. */

export interface RecipeLine {
  inventoryId: string;
  name: string;
  unit: string;
  /** Quantity needed to make `yieldServings` servings. */
  quantity: number;
  costPerUnit: number | null;
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

/** Ingredient cost of one serving, or null when any ingredient has no cost set (a partial total would mislead). */
export function costPerServing(lines: RecipeLine[], yieldServings: number): number | null {
  if (lines.length === 0 || lines.some((l) => l.costPerUnit === null)) return null;
  const total = lines.reduce((sum, l) => sum + l.quantity * (l.costPerUnit as number), 0);
  return Math.round((total / yieldServings) * 100) / 100;
}
