import { describe, it, expect } from "vitest";
import { computeChildrenCharge, computeIndividualChildrenCharge, deriveStandardChildPricingMenuId, extrasAndAddOnsAmount, itemMovesPrice, mealBaseAmount, menuGuestCount, priceMeals } from "../meal-pricing";

describe("meal-pricing (the one rule for orders, quotations and previews)", () => {
  it("only Extra dishes and add-ons move the price", () => {
    expect(itemMovesPrice({ itemType: "MENU_ITEM", isExtra: false })).toBe(false);
    expect(itemMovesPrice({ itemType: "MENU_ITEM", isExtra: true })).toBe(true);
    expect(itemMovesPrice({ itemType: "ADD_ON" })).toBe(true);
    expect(itemMovesPrice({ itemType: "MENU" })).toBe(false);
    expect(
      extrasAndAddOnsAmount([
        { itemType: "MENU_ITEM", unitPrice: 90, quantity: 1 },
        { itemType: "MENU_ITEM", unitPrice: 60, quantity: 50, isExtra: true },
        { itemType: "ADD_ON", unitPrice: 1000, quantity: 1 },
      ]),
    ).toBe(60 * 50 + 1000);
  });

  it("a meal costs its Menu's price x guests, or the typed per-plate price x guests under Individual Pricing", () => {
    const meal = { price: 999, menuPricePerPlate: 400 };
    expect(mealBaseAmount(meal, false, 50)).toBe(20000);
    expect(mealBaseAmount(meal, true, 50)).toBe(49950);
    expect(mealBaseAmount({ price: null, menuPricePerPlate: 400 }, true, 50)).toBe(0);
    expect(mealBaseAmount({ price: null, menuPricePerPlate: null }, false, 50)).toBe(0);
  });

  it("prices several meals and splits menu amount from extras", () => {
    const result = priceMeals(
      [
        { price: null, menuPricePerPlate: 400, items: [{ itemType: "MENU_ITEM", unitPrice: 60, quantity: 10, isExtra: true }] },
        { price: null, menuPricePerPlate: 350, items: [] },
      ],
      false,
      10,
    );
    expect(result).toEqual({ menuAmount: 7500, extrasAmount: 600, mealsSubtotal: 8100 });
  });

  it("prices the menu on the adults, falling back to the total when only a total was recorded", () => {
    expect(menuGuestCount({ adultCount: 40, totalParticipants: 50 })).toBe(40);
    expect(menuGuestCount({ adultCount: null, totalParticipants: 50 })).toBe(50);
    expect(menuGuestCount({ adultCount: null, totalParticipants: null })).toBe(0);
  });
});

describe("child pricing (one rule for server and forms, issue 73)", () => {
  const menu = { childUnder5Chargeable: true, childUnder5Price: 100, child5To10PricingType: "PERCENTAGE" as const, child5To10PriceValue: 50, pricePerPlate: 500 };
  it("prices the same from numbers (form) and from strings like Decimal (server)", () => {
    expect(computeChildrenCharge(menu, 2, 3)).toBe(2 * 100 + 3 * 250);
    expect(computeChildrenCharge({ ...menu, childUnder5Price: "100", pricePerPlate: "500" }, 2, 3)).toBe(950);
    expect(computeChildrenCharge(null, 2, 3)).toBe(0);
  });
  it("individual rates: fixed and percentage of the reference menu", () => {
    const rates = { individualChildBelow5Rate: 50, individualChildBelow5PricingType: "FIXED" as const, individualChild5To10Rate: 40, individualChild5To10PricingType: "PERCENTAGE" as const };
    expect(computeIndividualChildrenCharge(rates, 500, 2, 1)).toBe(2 * 50 + 200);
  });
  it("first menu by date, from Dates or ISO strings", () => {
    expect(deriveStandardChildPricingMenuId([{ date: "2026-12-02", menuId: "b" }, { date: "2026-12-01", menuId: null }, { date: "2026-12-01T00:00:00Z", menuId: "a" }])).toBe("a");
    expect(deriveStandardChildPricingMenuId([{ date: new Date("2026-12-02"), menuId: "b" }])).toBe("b");
    expect(deriveStandardChildPricingMenuId([])).toBeNull();
  });
});
