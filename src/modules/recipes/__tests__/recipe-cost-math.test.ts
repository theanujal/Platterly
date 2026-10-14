import { describe, it, expect } from "vitest";
import { costRecipe, type RecipeIngredientInput } from "../recipe-cost-math";
import { planFifo } from "@/modules/inventory/fifo-plan";

const ing = (over: Partial<RecipeIngredientInput> = {}): RecipeIngredientInput => ({ inventoryId: "i", name: "Paneer", unit: "kg", quantity: 10, queue: [], itemCost: null, ...over });

describe("FIFO plan", () => {
  it("takes from the front, splits across batches, and reports what no batch covers", () => {
    const queue = [{ id: "a", remaining: 6, unitCost: 40 }, { id: "b", remaining: 4, unitCost: 55 }];
    expect(planFifo(queue, 10)).toEqual({ slices: [{ batchId: "a", quantity: 6, unitCost: 40 }, { batchId: "b", quantity: 4, unitCost: 55 }], shortfall: 0 });
    expect(planFifo(queue, 12).shortfall).toBe(2);
    expect(planFifo([], 3)).toEqual({ slices: [], shortfall: 3 });
  });
});

describe("recipe cost", () => {
  it("is verified when every quantity comes from known-cost batches, spanning batches at different prices", () => {
    const cost = costRecipe([ing({ quantity: 10, queue: [{ id: "a", remaining: 6, unitCost: 40 }, { id: "b", remaining: 20, unitCost: 55 }] })], 10);
    expect(cost.state).toBe("VERIFIED");
    expect(cost.ingredients[0]).toMatchObject({ status: "VERIFIED", knownCost: 6 * 40 + 4 * 55 });
    expect(cost.verifiedCostPerServing).toBe(46); // 460 / 10 servings
    expect(cost.estimatedCostPerServing).toBeNull();
    expect(cost.issues).toEqual([]);
  });

  it("an unknown-cost opening batch makes it incomplete, names the ingredient, and gives no verified cost", () => {
    const cost = costRecipe([ing({ queue: [{ id: "o", remaining: 50, unitCost: null }], itemCost: 70 }), ing({ inventoryId: "j", name: "Oil", unit: "ltr", quantity: 2, queue: [{ id: "k", remaining: 9, unitCost: 100 }], itemCost: 90 })], 10);
    expect(cost.state).toBe("INCOMPLETE");
    expect(cost.verifiedCostPerServing).toBeNull();
    expect(cost.issues).toEqual([{ inventoryId: "i", name: "Paneer", reason: "10 kg would come from stock with no known cost" }]);
    expect(cost.ingredients.map((c) => c.status)).toEqual(["UNKNOWN_COST", "VERIFIED"]);
  });

  it("unknown-cost stock ahead of a known batch is not skipped", () => {
    const cost = costRecipe([ing({ quantity: 5, queue: [{ id: null, remaining: 3, unitCost: null }, { id: "b", remaining: 40, unitCost: 150 }], itemCost: 100 })], 10);
    expect(cost.state).toBe("INCOMPLETE");
    expect(cost.ingredients[0]).toMatchObject({ status: "UNKNOWN_COST", unknownQuantity: 3, knownCost: 300 });
    expect(cost.verifiedCostPerServing).toBeNull();
  });

  it("not enough usable stock is its own state, and is incomplete", () => {
    const cost = costRecipe([ing({ quantity: 10, queue: [{ id: "a", remaining: 4, unitCost: 40 }], itemCost: 45 })], 10);
    expect(cost.ingredients[0]).toMatchObject({ status: "NOT_COVERED", uncoveredQuantity: 6 });
    expect(cost.state).toBe("INCOMPLETE");
    expect(cost.issues[0].reason).toBe("not enough usable stock (6 kg short)");
    const none = costRecipe([ing({ queue: [] })], 10);
    expect(none.state).toBe("INCOMPLETE");
  });

  it("a confirmed zero cost is a known cost, not missing data", () => {
    const cost = costRecipe([ing({ quantity: 4, queue: [{ id: "f", remaining: 4, unitCost: 0 }] })], 4);
    expect(cost).toMatchObject({ state: "VERIFIED", verifiedCostPerServing: 0 });
    const mixed = costRecipe([ing({ quantity: 6, queue: [{ id: "f", remaining: 4, unitCost: 0 }, { id: "p", remaining: 9, unitCost: 50 }] })], 6);
    expect(mixed).toMatchObject({ state: "VERIFIED", verifiedCostPerServing: 16.67 }); // 100 / 6
  });

  it("the estimate is separate: only for an incomplete recipe, from the item's own cost, and absent when that is unknown too", () => {
    const withCost = costRecipe([ing({ quantity: 10, queue: [{ id: "o", remaining: 4, unitCost: null }, { id: "b", remaining: 3, unitCost: 50 }], itemCost: 60 })], 10);
    expect(withCost.state).toBe("INCOMPLETE");
    expect(withCost.verifiedCostPerServing).toBeNull();
    // 4 unknown x 60 + 3 x 50 known + 3 not covered x 60 = 570 / 10
    expect(withCost.estimatedCostPerServing).toBe(57);
    const noItemCost = costRecipe([ing({ queue: [{ id: "o", remaining: 10, unitCost: null }], itemCost: null })], 10);
    expect(noItemCost.estimatedCostPerServing).toBeNull();
  });

  it("no ingredients, or no yield, is incomplete", () => {
    expect(costRecipe([], 10).state).toBe("INCOMPLETE");
    expect(costRecipe([ing({ queue: [{ id: "a", remaining: 20, unitCost: 5 }] })], 0).state).toBe("INCOMPLETE");
  });
});
