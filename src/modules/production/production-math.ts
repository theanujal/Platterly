import { scaleQuantity } from "@/modules/recipes/recipe-math";

/** Pure planning maths: what ingredients a set of dishes needs, and against what is on the shelf. */

export interface PlanDish {
  menuItemId: string;
  name: string;
  /** Servings to cook (guests plus the kitchen's extra percentage). */
  servings: number;
  /** Only an Active recipe is passed in. */
  recipe: { yieldServings: number; lines: { inventoryId: string; name: string; unit: string; quantity: number }[] } | null;
  /** The dish has a recipe, but it is a Draft (not approved for production), so it is not counted. */
  draftRecipe?: boolean;
}

export interface NeedLine {
  inventoryId: string;
  name: string;
  unit: string;
  needed: number;
  forDishes: string[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Adds up every ingredient across the dishes (a dish served at two meals counts twice). Dishes with no recipe, or only a Draft one, are listed, not guessed at. */
export function aggregateNeeds(dishes: PlanDish[]): { lines: NeedLine[]; withoutRecipe: string[]; draftRecipe: string[] } {
  const byItem = new Map<string, NeedLine>();
  const withoutRecipe = new Set<string>();
  const draftRecipe = new Set<string>();
  for (const dish of dishes) {
    if (!dish.recipe) {
      (dish.draftRecipe ? draftRecipe : withoutRecipe).add(dish.name);
      continue;
    }
    for (const line of dish.recipe.lines) {
      const needed = scaleQuantity(line.quantity, dish.recipe.yieldServings, dish.servings);
      const found = byItem.get(line.inventoryId);
      if (found) {
        found.needed = round3(found.needed + needed);
        if (!found.forDishes.includes(dish.name)) found.forDishes.push(dish.name);
      } else {
        byItem.set(line.inventoryId, { inventoryId: line.inventoryId, name: line.name, unit: line.unit, needed, forDishes: [dish.name] });
      }
    }
  }
  return { lines: [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name)), withoutRecipe: [...withoutRecipe].sort(), draftRecipe: [...draftRecipe].sort() };
}

export interface StockedLine extends NeedLine {
  inStock: number;
  /** How much is missing (zero when there is enough). */
  short: number;
}

export function withStock(lines: NeedLine[], stock: Map<string, number>): StockedLine[] {
  return lines.map((l) => {
    const inStock = stock.get(l.inventoryId) ?? 0;
    return { ...l, inStock, short: Math.max(0, round3(l.needed - inStock)) };
  });
}

/** What a confirmed stock take actually removes: all of the need where stock covers it, otherwise whatever is there (down to zero). */
export const quantityToTake = (needed: number, inStock: number) => round3(Math.max(0, Math.min(needed, inStock)));
