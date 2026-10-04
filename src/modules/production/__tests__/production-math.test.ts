import { describe, it, expect } from "vitest";
import { aggregateNeeds, withStock, quantityToTake, type PlanDish } from "../production-math";

const dish = (name: string, servings: number, lines: { id: string; qty: number }[] | null, yieldServings = 10): PlanDish => ({
  menuItemId: name,
  name,
  servings,
  recipe: lines ? { yieldServings, lines: lines.map((l) => ({ inventoryId: l.id, name: l.id, unit: "kg", quantity: l.qty })) } : null,
});

describe("production maths", () => {
  it("scales each recipe to the servings and adds shared ingredients up", () => {
    const { lines } = aggregateNeeds([dish("Paneer", 100, [{ id: "paneer", qty: 2 }, { id: "oil", qty: 0.5 }]), dish("Dal", 50, [{ id: "oil", qty: 1 }])]);
    expect(lines.find((l) => l.inventoryId === "paneer")?.needed).toBe(20);
    const oil = lines.find((l) => l.inventoryId === "oil");
    expect(oil?.needed).toBe(10); // 5 for the paneer + 5 for the dal
    expect(oil?.forDishes).toEqual(["Paneer", "Dal"]);
  });
  it("a dish served at two meals counts twice; a dish with no recipe is listed, not guessed", () => {
    const { lines, withoutRecipe } = aggregateNeeds([dish("Rice", 10, [{ id: "rice", qty: 1 }]), dish("Rice", 10, [{ id: "rice", qty: 1 }]), dish("Salad", 10, null)]);
    expect(lines[0].needed).toBe(2);
    expect(withoutRecipe).toEqual(["Salad"]);
  });
  it("shortfall is what is missing, zero when covered", () => {
    const stocked = withStock([{ inventoryId: "a", name: "a", unit: "kg", needed: 10, forDishes: [] }, { inventoryId: "b", name: "b", unit: "kg", needed: 3, forDishes: [] }], new Map([["a", 4], ["b", 9]]));
    expect(stocked.map((s) => s.short)).toEqual([6, 0]);
  });
  it("a stock take removes the need when covered and only what is there when short, never below zero", () => {
    expect(quantityToTake(5, 20)).toBe(5);
    expect(quantityToTake(5, 3)).toBe(3);
    expect(quantityToTake(5, 0)).toBe(0);
  });
});
