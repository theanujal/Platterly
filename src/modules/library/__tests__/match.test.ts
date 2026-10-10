import { describe, it, expect } from "vitest";
import { LIBRARY_INGREDIENT_CATEGORIES, LIBRARY_UNITS } from "@platterly/contract";
import { CATEGORY_OPTIONS, UNIT_OPTIONS } from "@/modules/inventory/options";
import { buildLibraryIndex, findLibraryMatch, isJunkName, normalizeName } from "../match";

const library = buildLibraryIndex([
  { id: "1", name: "Paneer Butter Masala", aliases: ["Paneer Makhani"] },
  { id: "2", name: "Hyderabadi Biryani", aliases: [] },
  { id: "3", name: "Gulab Jamun", aliases: [] },
  { id: "4", name: "Chicken Tikka", aliases: [] },
  { id: "5", name: "Achari Paneer Tikka", aliases: [] },
]);

describe("normalizeName", () => {
  it("drops brackets, punctuation, case and filler words", () => {
    expect(normalizeName("  Paneer   Butter Masala (Gravy) ")).toBe("paneer butter masala");
    expect(normalizeName("Dal & Rice, with  Raita")).toBe("dal rice raita");
  });
  it("unifies common spellings and plurals", () => {
    expect(normalizeName("Panner Tikka")).toBe("paneer tikka");
    expect(normalizeName("Chilly Chicken")).toBe("chilli chicken");
    expect(normalizeName("Hydrabadi Biriyani")).toBe("hyderabadi biryani");
    expect(normalizeName("Ice-cream")).toBe("icecream");
    expect(normalizeName("Mushrooms")).toBe("mushroom");
  });
});

describe("findLibraryMatch", () => {
  it("finds the same name however it is written, in any word order", () => {
    expect(findLibraryMatch("paneer  butter masala (gravy)", library)).toMatchObject({ kind: "exact", entry: { id: "1" } });
    expect(findLibraryMatch("Masala Paneer Butter", library)).toMatchObject({ kind: "exact", entry: { id: "1" } });
    expect(findLibraryMatch("Hydrabadi Biriyani", library)).toMatchObject({ kind: "exact", entry: { id: "2" } });
  });
  it("finds a name through an alias", () => {
    expect(findLibraryMatch("Paneer Makhani", library)).toMatchObject({ kind: "exact", entry: { id: "1" } });
  });
  it("offers close names as a hint, never as an exact match", () => {
    const m = findLibraryMatch("Gulab Jamuns Special", library);
    expect(["exact", "close"]).toContain(m.kind);
    expect(findLibraryMatch("Paneer Tikka", library)).toMatchObject({ kind: "close", entry: { id: "5" } });
    expect(findLibraryMatch("Gulabjamoon", library).kind).not.toBe("exact");
  });
  it("says none for a different dish", () => {
    expect(findLibraryMatch("Veg Hakka Noodles", library)).toEqual({ kind: "none" });
    expect(findLibraryMatch("", library)).toEqual({ kind: "none" });
  });
});

describe("isJunkName", () => {
  it("rejects names not worth a reviewer's time", () => {
    for (const bad of ["a", "12", "Test item", "asdf", "xxxxxx", "  "]) expect(isJunkName(bad), bad).toBe(true);
    for (const ok of ["Dal Tadka", "Idli", "Raita"]) expect(isJunkName(ok), ok).toBe(false);
  });
});

describe("the contract's choices match catering's", () => {
  it("units and ingredient categories are the same lists", () => {
    expect([...LIBRARY_UNITS]).toEqual(UNIT_OPTIONS.map((u) => u.value));
    expect([...LIBRARY_INGREDIENT_CATEGORIES]).toEqual([...CATEGORY_OPTIONS]);
  });
});
