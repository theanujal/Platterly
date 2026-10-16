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
    expect(view.priceRows[0]).toMatchObject({ detail: "₹400.00 × 99 adults", amount: 39600 });
    expect(view.total).toBe(44000);

    // Individual pricing: the typed meal price doesn't equal rate x guests, so no multiplication is shown.
    const individual = buildApprovalView({ ...rich, breakdown: { ...rich.breakdown!, menuAmount: 30000 } });
    expect(individual.priceRows[0].detail).toBeUndefined();
  });

  it("lists the order's own charge lines and children, and the rows add up to the Grand Total", () => {
    const view = buildApprovalView({
      ...rich,
      total: 43600,
      childBelow5Count: 4,
      child5To10Count: 6,
      breakdown: {
        menuAmount: 39600,
        extrasAmount: 2475,
        liveCountersAmount: 2000,
        addOnsAmount: 0,
        childrenCharge: 1500,
        adjustments: -1975,
        transportation: 500,
        otherCharges: 300,
        customCharges: [{ label: "Decoration", amount: 1200 }],
        discount: 3975,
      },
    });
    expect(view.priceRows.map((r) => r.label)).toEqual(["North Indian Menu", "Extra Items", "Live Counters", "Children charges", "Transportation Cost", "Extra / Service Cost", "Decoration", "Discount"]);
    expect(view.priceRows.find((r) => r.label === "Children charges")).toMatchObject({ detail: "4 under 5 · 6 aged 5–10", amount: 1500 });
    expect(view.priceRows.find((r) => r.label === "Discount")).toMatchObject({ amount: 3975, negative: true });
    const sum = view.priceRows.reduce((acc, r) => acc + (r.negative ? -r.amount : r.amount), 0);
    expect(sum).toBe(view.total);
    expect(view.childBelow5).toBe(4);
    expect(view.child5To10).toBe(6);
  });

  it("keeps whatever the charge lines do not explain as Other adjustments", () => {
    const view = buildApprovalView({ ...rich, breakdown: { ...rich.breakdown!, adjustments: 250, transportation: 0, otherCharges: 0, customCharges: [], discount: 0 } });
    expect(view.priceRows.at(-1)).toMatchObject({ label: "Other adjustments", amount: 250 });
  });

  it("lists every menu once with its price when the order has more than one", () => {
    const meal = rich.meals[0];
    const view = buildApprovalView({
      ...rich,
      meals: [meal, { ...meal, mealType: "LUNCH", menuName: "South Indian Menu", pricePerPlate: 350 }, { ...meal, mealType: "HITEA", menuName: "South Indian Menu", pricePerPlate: 350 }],
    });
    expect(view.menus).toEqual([
      { name: "North Indian Menu", pricePerPlate: 400, image: "/menu.png" },
      { name: "South Indian Menu", pricePerPlate: 350, image: "/menu.png" },
    ]);
    expect(buildApprovalView(rich).menus).toEqual([{ name: "North Indian Menu", pricePerPlate: 400, image: "/menu.png" }]);
  });

  it("two meals on one day each show their own dishes, and the multiplier covers the meals", () => {
    const meal = rich.meals[0];
    const view = buildApprovalView({ ...rich, meals: [meal, { ...meal, mealType: "LUNCH" }], breakdown: { ...rich.breakdown!, menuAmount: 400 * 99 * 2 } });
    expect(view.meals.map((m) => m.label)).toEqual(["Dinner", "Lunch"]);
    expect(view.priceRows[0].detail).toBe("₹400.00 × 99 adults × 2 meals");
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

  describe("several menus (a multi order)", () => {
    const meal = (date: string, mealType: "LUNCH" | "DINNER", menuName: string, pricePerPlate: number) => ({ date, mealType, menuName, pricePerPlate, items: [] });
    const multi: ApprovalSnapshot = {
      ...base,
      guests: 100,
      meals: [meal("2026-09-19", "LUNCH", "North Indian Menu", 400), meal("2026-09-19", "DINNER", "South Indian Menu", 300), meal("2026-09-20", "LUNCH", "North Indian Menu", 400)],
      breakdown: { menuAmount: 100 * (400 + 300 + 400), extrasAmount: 0, liveCountersAmount: 0, addOnsAmount: 0, childrenCharge: 0, adjustments: 0 },
      childBelow5Count: 0,
      child5To10Count: 0,
    };

    it("prices each menu on its own line instead of naming only the first", () => {
      const view = buildApprovalView(multi);
      expect(view.priceRows).toEqual([
        { label: "North Indian Menu", detail: "₹400.00 × 100 adults × 2 meals", amount: 80000 },
        { label: "South Indian Menu", detail: "₹300.00 × 100 adults", amount: 30000 },
      ]);
    });

    it("spells out every menu at the rate it was charged, also under Individual Pricing (a rate that differs from the list price)", () => {
      const view = buildApprovalView({
        ...multi,
        guests: 90,
        childBelow5Count: 5,
        child5To10Count: 20,
        meals: [{ ...meal("2026-10-31", "LUNCH", "North Indian Menu", 400), price: 1600 }, { ...meal("2026-10-31", "DINNER", "South Indian", 300), price: 300 }],
        breakdown: { ...multi.breakdown!, menuAmount: 65 * (1600 + 300) },
      });
      expect(view.priceRows).toEqual([
        { label: "North Indian Menu", detail: "₹1,600.00 × 65 adults", amount: 104000 },
        { label: "South Indian", detail: "₹300.00 × 65 adults", amount: 19500 },
      ]);
    });

    it("shows one combined line when the per-menu amounts cannot be reproduced", () => {
      const view = buildApprovalView({ ...multi, breakdown: { ...multi.breakdown!, menuAmount: 12345 } });
      expect(view.priceRows).toEqual([{ label: "Menus", detail: "North Indian Menu · South Indian Menu", amount: 12345 }]);
    });

    it("lists every meal slot as an event, with its day number and menu", () => {
      const view = buildApprovalView(multi);
      expect(view.events.map((e) => [e.key, e.dayNumber, e.mealLabel, e.menus.map((m) => m.name)])).toEqual([
        ["2026-09-19-LUNCH", 1, "Lunch", ["North Indian Menu"]],
        ["2026-09-19-DINNER", 1, "Dinner", ["South Indian Menu"]],
        ["2026-09-20-LUNCH", 2, "Lunch", ["North Indian Menu"]],
      ]);
    });
  });
});
