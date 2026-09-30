import { describe, it, expect } from "vitest";
import { compareMealPlans, snapshotHasDishIds, snapshotToMealSelections } from "../snapshot-meals";
import type { ApprovalSnapshot } from "../approval-snapshot";

const snapshot: ApprovalSnapshot = {
  customerName: "Asha",
  eventTypeName: "Wedding",
  eventStartDate: "2026-12-01",
  eventEndDate: "2026-12-02",
  venue: null,
  guests: 50,
  total: 20000,
  selectedItems: [],
  isCustomMenu: false,
  meals: [
    {
      date: "2026-12-01",
      mealType: "LUNCH",
      menuName: "Feast",
      menuId: "menu-1",
      price: null,
      items: [
        { name: "Dal", quantity: 1, itemType: "MENU_ITEM", catalogId: "dal", unitPrice: 90, isExtra: false },
        { name: "Rabdi", quantity: 50, itemType: "MENU_ITEM", catalogId: "rabdi", unitPrice: 60, isExtra: true },
        { name: "Live Chaat", quantity: 50, itemType: "ADD_ON", catalogId: "chaat", unitPrice: 200 },
      ],
    },
  ],
};

describe("snapshot-meals", () => {
  it("rebuilds the planner's shape from a frozen version", () => {
    const [meal] = snapshotToMealSelections(snapshot);
    expect(meal).toMatchObject({ date: "2026-12-01", mealType: "LUNCH", menuId: "menu-1", price: "" });
    expect(meal.items.map((i) => [i.name, i.itemType, i.perGuest])).toEqual([
      ["Dal", "MENU_ITEM", false],
      ["Rabdi", "MENU_ITEM", true],
      ["Live Chaat", "ADD_ON", true],
    ]);
  });

  it("knows an older, names-only snapshot can't be compared dish by dish", () => {
    expect(snapshotHasDishIds(snapshot)).toBe(true);
    const old: ApprovalSnapshot = { ...snapshot, meals: [{ date: "2026-12-01", mealType: "LUNCH", menuName: null, items: [{ name: "Dal", quantity: 1 }] }] };
    expect(snapshotHasDishIds(old)).toBe(false);
  });

  it("marks dishes the older version has that the current menu lacks, and the other way round", () => {
    const shown = snapshotToMealSelections(snapshot);
    const current = shown.map((meal) => ({
      ...meal,
      items: [...meal.items.filter((i) => i.catalogId !== "rabdi"), { key: "k", itemType: "MENU_ITEM" as const, catalogId: "kheer", name: "Kheer", unitPrice: 70, perGuest: false }],
    }));

    const marks = compareMealPlans(shown, current, { highlight: "Removed since", missing: "Added since" });
    expect([...marks.highlight]).toEqual(["2026-12-01|LUNCH|rabdi"]);
    expect(marks.missing["2026-12-01|LUNCH"]).toEqual([{ name: "Kheer", catalogId: "kheer" }]);
  });
});
