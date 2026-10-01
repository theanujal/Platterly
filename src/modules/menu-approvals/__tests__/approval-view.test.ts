import { describe, it, expect } from "vitest";
import { buildApprovalView } from "@/modules/menu-approvals/approval-view";
import type { ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";

const base: ApprovalSnapshot = {
  customerName: "Asha Rao",
  eventTypeName: "Wedding",
  eventStartDate: "2026-09-19",
  eventEndDate: "2026-09-19",
  venue: "Whitefield, Bangalore",
  guests: 99,
  total: 44000,
  meals: [],
  selectedItems: [],
  isCustomMenu: false,
};

const rich: ApprovalSnapshot = {
  ...base,
  meals: [
    {
      date: "2026-09-19",
      mealType: "DINNER",
      menuName: "North Indian Menu",
      menuImage: "/menu.png",
      menuDescription: "A rich spread",
      pricePerPlate: 400,
      items: [
        { name: "Dal Makhani", quantity: 1, itemType: "MENU_ITEM", category: "Main Course" },
        { name: "Paneer Butter Masala", quantity: 1, itemType: "MENU_ITEM", category: "Main Course" },
        { name: "Paneer 65", quantity: 1, itemType: "MENU_ITEM", category: "Starter" },
        { name: "Spring Roll", quantity: 99, itemType: "MENU_ITEM", category: "Starter", isExtra: true, unitPrice: 25 },
        { name: "Chaat Counter", quantity: 1, itemType: "ADD_ON", addOnType: "LIVE_COUNTER", priceType: "FIXED", unitPrice: 2000 },
        { name: "Welcome Drink", quantity: 1, itemType: "ADD_ON", addOnType: "SPECIAL_ADD_ON", priceType: "PER_PLATE", unitPrice: 0, included: true },
      ],
    },
  ],
  breakdown: { menuAmount: 39600, extrasAmount: 2475, liveCountersAmount: 2000, addOnsAmount: 0, childrenCharge: 0, adjustments: -75 },
  childBelow5Count: 0,
  child5To10Count: 0,
};

describe("buildApprovalView", () => {
  it("groups dishes by category and keeps add-ons out of the dish list", () => {
    const view = buildApprovalView(rich);
    expect(view.meals).toHaveLength(1);
    expect(view.meals[0].groups.map((g) => [g.category, g.items.map((i) => i.name)])).toEqual([
      ["Main Course", ["Dal Makhani", "Paneer Butter Masala"]],
      ["Starter", ["Paneer 65", "Spring Roll"]],
    ]);
    expect(view.meals[0].groups[1].items[1].isExtra).toBe(true);
  });

  it("describes the proposed menu and the event", () => {
    const view = buildApprovalView(rich);
    expect(view.menu).toEqual({ name: "North Indian Menu", description: "A rich spread", image: "/menu.png", pricePerPlate: 400, extraMenus: [] });
    expect(view.dateText).toMatch(/^19 Sep(t)? 2026$/); // the month abbreviation depends on the ICU data
    expect(view.guests).toBe(99);
    expect(view.location).toBe("Whitefield, Bangalore");
  });

  it("lists extra dishes, live counters and included add-ons with their price labels", () => {
    const view = buildApprovalView(rich);
    expect(view.addOns.map((a) => [a.name, a.kind, a.priceLabel])).toEqual([
      ["Chaat Counter", "LIVE_COUNTER", "₹2,000.00 flat"],
      ["Welcome Drink", "ADD_ON", "Included in package"],
      ["Spring Roll", "EXTRA_ITEM", "₹25.00 / plate"],
    ]);
  });

  it("builds the price rows, spelling out menu x guests only when it adds up", () => {
    const view = buildApprovalView(rich);
    expect(view.priceRows.map((r) => r.label)).toEqual(["North Indian Menu", "Extra Items", "Live Counters", "Discount & other charges"]);
    expect(view.priceRows[0]).toMatchObject({ detail: "₹400.00 × 99 guests", amount: 39600 });
    expect(view.total).toBe(44000);

    // Individual pricing: the typed meal price doesn't equal rate x guests, so no multiplication is shown.
    const individual = buildApprovalView({ ...rich, breakdown: { ...rich.breakdown!, menuAmount: 30000 } });
    expect(individual.priceRows[0].detail).toBeUndefined();
  });

  it("two meals on one day each show their own dishes, and the multiplier covers the meals", () => {
    const meal = rich.meals[0];
    const view = buildApprovalView({ ...rich, meals: [meal, { ...meal, mealType: "LUNCH" }], breakdown: { ...rich.breakdown!, menuAmount: 400 * 99 * 2 } });
    expect(view.meals.map((m) => m.label)).toEqual(["Dinner", "Lunch"]);
    expect(view.priceRows[0].detail).toBe("₹400.00 × 99 guests × 2 meals");
    expect(view.addOns).toHaveLength(3); // each add-on and extra is listed once
  });

  it("a Custom Menu has no menu price row", () => {
    const view = buildApprovalView({ ...rich, isCustomMenu: true, meals: [{ ...rich.meals[0], menuName: null, pricePerPlate: null }] });
    expect(view.menu).toBeNull();
    expect(view.priceRows.map((r) => r.label)).not.toContain("North Indian Menu");
    expect(view.isCustomMenu).toBe(true);
  });

  it("an older snapshot (no categories, kinds or breakdown) still renders: one group, no price rows, only the total", () => {
    const old: ApprovalSnapshot = {
      ...base,
      meals: [{ date: "2026-09-19", mealType: "LUNCH", menuName: "Classic", items: [{ name: "Dal", quantity: 1, itemType: "MENU_ITEM" }, { name: "Raita", quantity: 1, itemType: "ADD_ON" }] }],
      selectedItems: [{ name: "Loose Dish", isExtra: true }],
    };
    const view = buildApprovalView(old);
    expect(view.meals[0].groups).toEqual([{ category: "Other dishes", items: [{ name: "Dal", isExtra: false }] }]);
    expect(view.priceRows).toEqual([]);
    expect(view.total).toBe(44000);
    expect(view.looseItems).toEqual([{ name: "Loose Dish", isExtra: true }]);
    expect(view.menu).toMatchObject({ name: "Classic", image: null, pricePerPlate: null });
    expect(view.addOns[0]).toMatchObject({ name: "Raita", kind: "ADD_ON" });
  });
});
