import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { CATALOG_SEED } from "../catalog/catalog-data";
import { CATALOG_PHOTOS, catalogImage } from "../catalog/catalog-images";

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

  it("has a picture for every dish: a real file, or its category illustration", () => {
    const publicDir = path.join(process.cwd(), "public");
    for (const item of CATALOG_SEED) {
      const { url } = catalogImage(item.name, item.categoryName);
      expect(existsSync(path.join(publicDir, url)), `${item.name} -> ${url}`).toBe(true);
    }
  });

  it("only has photos for dishes that are in the catalog, each with a credit", () => {
    const names = new Set(CATALOG_SEED.map((i) => i.name));
    for (const [name, photo] of Object.entries(CATALOG_PHOTOS)) {
      expect(names.has(name), name).toBe(true);
      expect(photo.credit).toContain("Wikimedia Commons");
      expect(photo.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });
});
