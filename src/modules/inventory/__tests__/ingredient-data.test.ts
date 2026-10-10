import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { INGREDIENT_SEED } from "../catalog/ingredient-data";
import { CATEGORY_OPTIONS, UNIT_OPTIONS, ingredientImage } from "../options";

describe("Platterly ingredient catalog data", () => {
  it("lists every ingredient once (names are unique, ignoring case)", () => {
    const names = INGREDIENT_SEED.map((i) => i.name.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("uses only the categories and units the Inventory form offers", () => {
    const units = new Set<string>(UNIT_OPTIONS.map((u) => u.value));
    for (const item of INGREDIENT_SEED) {
      expect(item.name.trim()).toBe(item.name);
      expect(CATEGORY_OPTIONS, item.name).toContain(item.categoryName);
      expect(units.has(item.unit), `${item.name}: ${item.unit}`).toBe(true);
    }
  });

  it("covers the ingredient groups AJ named", () => {
    const names = INGREDIENT_SEED.map((i) => i.name);
    for (const wanted of ["Basmati Rice", "Paneer", "Wheat Flour (Atta)", "Sunflower Oil", "Turmeric Powder", "Onion", "Milk (Full Cream)"]) {
      expect(names).toContain(wanted);
    }
  });

  it("has an illustration file for every category", () => {
    for (const category of CATEGORY_OPTIONS) {
      expect(existsSync(path.join(process.cwd(), "public", ingredientImage(category))), category).toBe(true);
    }
  });
});
