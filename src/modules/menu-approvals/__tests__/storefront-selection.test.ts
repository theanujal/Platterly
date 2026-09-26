import { describe, it, expect } from "vitest";
import { requiredShortfalls, splitPicks } from "@/modules/menu-approvals/storefront-selection";

const sections = [
  { categoryName: "Starters", maxSelection: 2, items: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] },
  { categoryName: "Drinks", maxSelection: 2, items: [{ id: "d1" }] },
  { categoryName: "Other Items", maxSelection: null, items: [{ id: "o1" }, { id: "o2" }] },
];

describe("splitPicks", () => {
  it("treats picks beyond a category's limit as extras, in pick order", () => {
    const split = splitPicks(sections, ["s1", "s2", "s3", "o1"]);
    expect(split.regularIds).toEqual(["s1", "s2", "o1"]);
    expect(split.extraIds).toEqual(["s3"]);
  });
});

describe("requiredShortfalls", () => {
  it("lists every capped category still short of its count", () => {
    expect(requiredShortfalls(sections, ["s1"])).toEqual([
      { name: "Starters", missing: 1 },
      { name: "Drinks", missing: 1 },
    ]);
  });

  it("asks for only as many as a category has when it has fewer than its limit", () => {
    // Drinks has one dish but a limit of 2: picking that one dish is enough.
    expect(requiredShortfalls(sections, ["s1", "s2", "d1"])).toEqual([]);
  });

  it("does not count extras towards the requirement, and never requires an uncapped category", () => {
    expect(requiredShortfalls(sections, ["s1", "s2", "s3", "d1"])).toEqual([]);
    expect(requiredShortfalls([sections[2]], [])).toEqual([]);
  });
});
