import { describe, it, expect } from "vitest";
import { CATALOG_SEED } from "../catalog/catalog-data";

describe("Platterly master catalog data", () => {
  it("lists every dish once (names are unique, ignoring case)", () => {
    const names = CATALOG_SEED.map((i) => i.name.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("gives every dish a name, a description, a category and a food type", () => {
    for (const item of CATALOG_SEED) {
      expect(item.name.trim()).toBe(item.name);
      expect(item.name.length).toBeGreaterThan(1);
      expect(item.description.length).toBeGreaterThan(5);
      expect(item.categoryName).toBeTruthy();
      expect(["VEGETARIAN", "NON_VEGETARIAN"]).toContain(item.foodType);
    }
  });

  it("keeps meat, fish and egg dishes out of the vegetarian list", () => {
    const meat = /\b(chicken|murg|murgh|mutton|ghosht|gosht|fish|machhi|egg|omelette|maas|tangdi|kaleji)\b/i;
    const wrong = CATALOG_SEED.filter((i) => i.foodType === "VEGETARIAN" && meat.test(i.name)).map((i) => i.name);
    expect(wrong).toEqual([]);
  });
});
