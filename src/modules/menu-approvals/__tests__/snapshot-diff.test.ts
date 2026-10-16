import { describe, expect, it } from "vitest";
import type { ApprovalSnapshot } from "../approval-snapshot";
import { snapshotChanges } from "../snapshot-diff";

const base: ApprovalSnapshot = {
  customerName: "Asha",
  eventTypeName: "Wedding",
  eventStartDate: "2026-12-05",
  eventEndDate: "2026-12-05",
  venue: null,
  guests: 100,
  total: 32500,
  meals: [
    {
      date: "2026-12-05",
      mealType: "DINNER",
      menuName: "North Indian",
      menuId: "m1",
      price: null,
      items: [
        { name: "Dal Makhani", quantity: 100, unitPrice: 450, isExtra: true },
        { name: "Paneer 65", quantity: 1, unitPrice: 0, isExtra: false },
      ],
    },
  ],
  selectedItems: [],
  isCustomMenu: false,
  childBelow5Count: 33,
  child5To10Count: 33,
  adultCount: 30,
};
const changed = (patch: Partial<ApprovalSnapshot>): ApprovalSnapshot => ({ ...base, ...patch });

describe("snapshotChanges", () => {
  it("is empty when nothing differs", () => {
    expect(snapshotChanges(base, structuredClone(base))).toEqual([]);
  });

  it("reports the price, the adults and the children in words", () => {
    const reasons = snapshotChanges(base, changed({ total: 30000, adultCount: 25, childBelow5Count: 20, child5To10Count: 10 }));
    expect(reasons).toEqual([
      "The price changed (₹32,500 to ₹30,000)",
      "Adults changed (30 to 25)",
      "Children under 5 changed (33 to 20)",
      "Children 5 to 10 changed (33 to 10)",
    ]);
  });

  it("falls back to the guest count for a snapshot that never stored the adults", () => {
    const old = { ...base, adultCount: undefined, childBelow5Count: undefined, child5To10Count: undefined };
    expect(snapshotChanges(old, changed({ guests: 90, adultCount: 20 }))).toEqual(["Guests changed (100 to 90)"]);
  });

  it("checks the menu and its dishes, meal by meal", () => {
    const menuChanged = changed({ meals: [{ ...base.meals[0], menuId: "m2", menuName: "South Indian" }] });
    expect(snapshotChanges(base, menuChanged)).toEqual(["Dinner, 5 Dec: the menu changed (North Indian to South Indian)"]);

    const dishAdded = changed({ meals: [{ ...base.meals[0], items: [...base.meals[0].items, { name: "Gulab Jamun", quantity: 1, unitPrice: 0, isExtra: false }] }] });
    expect(snapshotChanges(base, dishAdded)).toEqual(["Dinner, 5 Dec: dishes or add-ons changed (Gulab Jamun)"]);

    const quantity = changed({ meals: [{ ...base.meals[0], items: [{ ...base.meals[0].items[0], quantity: 90 }, base.meals[0].items[1]] }] });
    expect(snapshotChanges(base, quantity)).toEqual(["Dinner, 5 Dec: dishes or add-ons changed (Dal Makhani)"]);
  });

  it("reports a meal added or removed, and moved event dates", () => {
    const lunch = { ...base.meals[0], mealType: "LUNCH" as const };
    expect(snapshotChanges(base, changed({ meals: [...base.meals, lunch] }))).toEqual(["Lunch, 5 Dec was added"]);
    expect(snapshotChanges(base, changed({ meals: [] }))).toEqual(["Dinner, 5 Dec was removed"]);
    expect(snapshotChanges(base, changed({ eventStartDate: "2026-12-06", eventEndDate: "2026-12-06" }))).toEqual(["The event dates changed"]);
  });

  it("keeps the list short", () => {
    const meals = ["BREAKFAST", "LUNCH", "HITEA", "OTHER"].map((mealType) => ({ ...base.meals[0], mealType: mealType as "LUNCH" }));
    const reasons = snapshotChanges(base, changed({ total: 1, adultCount: 1, childBelow5Count: 1, child5To10Count: 1, meals: [...base.meals, ...meals] }));
    expect(reasons).toHaveLength(7);
    expect(reasons[6]).toBe("and 2 more");
  });
});
