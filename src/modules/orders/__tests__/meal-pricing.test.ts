import { describe, it, expect } from "vitest";
import { extrasAndAddOnsAmount, itemMovesPrice, mealBaseAmount, menuGuestCount, priceMeals } from "../meal-pricing";

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

  it("a meal costs its Menu's price x guests, or the typed price under Individual Pricing", () => {
    const meal = { price: 999, menuPricePerPlate: 400 };
    expect(mealBaseAmount(meal, false, 50)).toBe(20000);
    expect(mealBaseAmount(meal, true, 50)).toBe(999);
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
