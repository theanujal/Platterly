import { planFifo, type PlanBatch, type PlanSlice } from "@/modules/inventory/fifo-plan";

/**
 * What a recipe costs, from the stock that would actually be used (pure; the server and the recipe dialog both use it).
 *
 * Each ingredient's required quantity is allocated across its usable batches oldest first (`planFifo`). The cost is
 * VERIFIED only when every unit of every ingredient comes from a batch with a known cost (a confirmed 0 is known). Otherwise
 * the recipe is INCOMPLETE, and the ingredients that cause it are listed:
 *   UNKNOWN_COST  some of the quantity would come from a batch (or loose stock) whose cost is not known;
 *   NOT_COVERED   there is not enough usable stock to cover the quantity.
 * An incomplete recipe has no verified cost. `estimatedCostPerServing` is a separate guide that values the parts with no
 * known cost at the item's own cost; it is never part of the verified figure.
 */

export interface RecipeIngredientInput {
  inventoryId: string;
  name: string;
  unit: string;
  /** For the recipe's yield, in the item's stock unit. */
  quantity: number;
  /** The usable stock queue, unbatched first then batches oldest first. */
  queue: PlanBatch[];
  /** The item's own cost per unit, used only for the estimate. */
  itemCost: number | null;
}

export type IngredientCostStatus = "VERIFIED" | "UNKNOWN_COST" | "NOT_COVERED";

export interface IngredientCost {
  inventoryId: string;
  name: string;
  unit: string;
  quantity: number;
  status: IngredientCostStatus;
  /** Cost of the part that comes from known-cost batches. */
  knownCost: number;
  /** Quantity that would come from stock with no known cost. */
  unknownQuantity: number;
  /** Quantity that no usable batch covers. */
  uncoveredQuantity: number;
  /** The FIFO slices this was costed from. */
  slices: PlanSlice[];
}

export interface RecipeCost {
  state: "VERIFIED" | "INCOMPLETE";
  /** Per serving, only when VERIFIED. */
  verifiedCostPerServing: number | null;
  /** A guide only, never a verified cost; null when some missing part has no item cost either. */
  estimatedCostPerServing: number | null;
  ingredients: IngredientCost[];
  /** The ingredients that stop the cost being verified, with the reason in words. */
  issues: { inventoryId: string; name: string; reason: string }[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function costRecipe(ingredients: RecipeIngredientInput[], yieldServings: number): RecipeCost {
  const costed: IngredientCost[] = [];
  const issues: RecipeCost["issues"] = [];
  let estimate: number | null = 0;
  for (const ing of ingredients) {
    const { slices, shortfall } = planFifo(ing.queue, ing.quantity);
    let knownCost = 0;
    let unknownQuantity = 0;
    for (const s of slices) {
      if (s.unitCost === null) unknownQuantity += s.quantity;
      else knownCost += s.quantity * s.unitCost;
    }
    unknownQuantity = round3(unknownQuantity);
    const uncoveredQuantity = round3(shortfall);
    const status: IngredientCostStatus = uncoveredQuantity > 0 ? "NOT_COVERED" : unknownQuantity > 0 ? "UNKNOWN_COST" : "VERIFIED";
    costed.push({ inventoryId: ing.inventoryId, name: ing.name, unit: ing.unit, quantity: ing.quantity, status, knownCost: round2(knownCost), unknownQuantity, uncoveredQuantity, slices });
    if (status === "UNKNOWN_COST") issues.push({ inventoryId: ing.inventoryId, name: ing.name, reason: `${unknownQuantity} ${ing.unit} would come from stock with no known cost` });
    if (status === "NOT_COVERED") issues.push({ inventoryId: ing.inventoryId, name: ing.name, reason: `not enough usable stock (${uncoveredQuantity} ${ing.unit} short)` });
    const missing = unknownQuantity + uncoveredQuantity;
    if (estimate !== null) estimate = missing > 0 && ing.itemCost === null ? null : estimate + knownCost + missing * (ing.itemCost ?? 0);
  }
  const verified = costed.length > 0 && issues.length === 0 && yieldServings > 0;
  const total = costed.reduce((sum, c) => sum + c.knownCost, 0);
  return {
    state: verified ? "VERIFIED" : "INCOMPLETE",
    verifiedCostPerServing: verified ? round2(total / yieldServings) : null,
    estimatedCostPerServing: !verified && estimate !== null && yieldServings > 0 && costed.length > 0 ? round2(estimate / yieldServings) : null,
    ingredients: costed,
    issues,
  };
}
