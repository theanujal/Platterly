import { describe, it, expect } from "vitest";
import { scaleQuantity, scaleRecipe, type RecipeLine } from "../recipe-math";

const line = (over: Partial<RecipeLine> = {}): RecipeLine => ({ inventoryId: "i", name: "Paneer", unit: "kg", quantity: 2, ...over });

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
});

import { enterableUnits, friendlyQuantity, toStockUnit } from "../recipe-math";

describe("unit conversion for recipe quantities", () => {
  it("offers the small and big unit of a weight or volume, and only its own unit otherwise", () => {
    expect(enterableUnits("kg")).toEqual(["kg", "g"]);
    expect(enterableUnits("ltr")).toEqual(["ltr", "ml"]);
    expect(enterableUnits("pcs")).toEqual(["pcs"]);
  });
  it("converts 700 g of a kg item and 250 ml of a litre item", () => {
    expect(toStockUnit(700, "g", "kg")).toBe(0.7);
    expect(toStockUnit(250, "ml", "ltr")).toBe(0.25);
    expect(toStockUnit(2, "kg", "kg")).toBe(2);
    expect(toStockUnit(1500, "g", "g")).toBe(1500);
    expect(toStockUnit(3, "pcs", "pcs")).toBe(3);
  });
  it("shows a stored 0.7 kg as 700 g and leaves whole amounts alone", () => {
    expect(friendlyQuantity(0.7, "kg")).toEqual({ quantity: 700, unit: "g" });
    expect(friendlyQuantity(0.05, "ltr")).toEqual({ quantity: 50, unit: "ml" });
    expect(friendlyQuantity(2, "kg")).toEqual({ quantity: 2, unit: "kg" });
    expect(friendlyQuantity(0.5, "pcs")).toEqual({ quantity: 0.5, unit: "pcs" });
  });
});
