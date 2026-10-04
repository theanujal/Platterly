import { describe, it, expect } from "vitest";
import { scaleQuantity, scaleRecipe, costPerServing, type RecipeLine } from "../recipe-math";

const line = (over: Partial<RecipeLine> = {}): RecipeLine => ({ inventoryId: "i", name: "Paneer", unit: "kg", quantity: 2, costPerUnit: 300, ...over });

describe("recipe maths", () => {
  it("scales linearly: 2 kg for 10 servings is 20 kg for 100", () => {
    expect(scaleQuantity(2, 10, 100)).toBe(20);
  });
  it("scales down and rounds to 3 places", () => {
    expect(scaleQuantity(1, 3, 1)).toBe(0.333);
  });
  it("zero servings need nothing", () => {
    expect(scaleQuantity(2, 10, 0)).toBe(0);
  });
  it("rejects a zero yield and negative servings", () => {
    expect(() => scaleQuantity(1, 0, 5)).toThrow();
    expect(() => scaleQuantity(1, 10, -1)).toThrow();
  });
  it("scaleRecipe adds `needed` per line", () => {
    const [a] = scaleRecipe([line()], 10, 50);
    expect(a.needed).toBe(10);
  });
  it("cost per serving: 2kg x 300 over 10 servings is 60", () => {
    expect(costPerServing([line()], 10)).toBe(60);
  });
  it("cost is unknown when any ingredient has no cost, or there are none", () => {
    expect(costPerServing([line(), line({ costPerUnit: null })], 10)).toBeNull();
    expect(costPerServing([], 10)).toBeNull();
  });
});
