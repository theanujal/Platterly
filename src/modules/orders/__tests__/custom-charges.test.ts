import { describe, it, expect } from "vitest";
import { parseCustomCharges, sumCustomCharges, MAX_CUSTOM_CHARGES } from "../custom-charges";
import { buildInvoiceLines } from "@/modules/invoices/invoice";

describe("parseCustomCharges", () => {
  it("keeps labelled positive amounts, trims labels and rounds to paise", () => {
    expect(parseCustomCharges([{ label: "  Generator ", amount: 1500.456 }])).toEqual([{ label: "Generator", amount: 1500.46 }]);
  });
  it("drops blank labels, zero, negative, NaN and junk lines", () => {
    expect(parseCustomCharges([{ label: "", amount: 10 }, { label: "A", amount: 0 }, { label: "B", amount: -5 }, { label: "C", amount: Number.NaN }, null, "x"])).toEqual([]);
  });
  it("accepts a JSON string and ignores invalid input", () => {
    expect(parseCustomCharges('[{"label":"Tent","amount":200}]')).toEqual([{ label: "Tent", amount: 200 }]);
    expect(parseCustomCharges("not json")).toEqual([]);
    expect(parseCustomCharges(undefined)).toEqual([]);
  });
  it("caps the number of lines", () => {
    const many = Array.from({ length: MAX_CUSTOM_CHARGES + 5 }, (_, i) => ({ label: `L${i}`, amount: 1 }));
    expect(parseCustomCharges(many)).toHaveLength(MAX_CUSTOM_CHARGES);
  });
  it("sums without float drift", () => {
    expect(sumCustomCharges([{ label: "a", amount: 0.1 }, { label: "b", amount: 0.2 }])).toBe(0.3);
  });
});

describe("invoice lines", () => {
  it("an Individual Pricing meal is a per-plate line: adults x the typed price", () => {
    const lines = buildInvoiceLines({
      adultCount: 40, totalParticipants: 50, individualPricingEnabled: true, childrenCharge: 0, transportationCost: 0, otherCharges: 0,
      discount: 0, total: 16000,
      mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", price: 400, menuName: "North Indian", menuPricePerPlate: 300, items: [] }],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ description: "North Indian", quantity: 40, rate: 400 });
  });

  it("lists only the selected menu x guests, extra items, add-ons and live counters, never the dishes inside the menu", () => {
    const lines = buildInvoiceLines({
      adultCount: 50, totalParticipants: 50, individualPricingEnabled: false, childrenCharge: 0, transportationCost: 0, otherCharges: 0, discount: 0, total: 50 * 400 + 50 * 60 + 10 * 70 + 5000,
      mealPlanEntries: [
        {
          date: new Date("2026-12-01"), mealType: "LUNCH", price: null, menuName: "North Indian", menuPricePerPlate: 400,
          items: [
            { name: "Dal Makhani", itemType: "MENU_ITEM", unitPrice: 90, quantity: 1, isExtra: false },
            { name: "Gulab Jamun", itemType: "MENU_ITEM", unitPrice: 60, quantity: 50, isExtra: true },
            { name: "Chaat Counter", itemType: "ADD_ON", unitPrice: 70, quantity: 10, isExtra: false, addOnType: "LIVE_COUNTER" },
            { name: "Mocktail Bar", itemType: "ADD_ON", unitPrice: 5000, quantity: 1, isExtra: false, addOnType: "SPECIAL_ADD_ON" },
          ],
        },
      ],
    });
    expect(lines.map((l) => [l.description, l.detail, l.quantity, l.rate])).toEqual([
      ["North Indian", "Lunch, 1 Dec 2026 · 50 guests", 50, 400],
      ["Gulab Jamun", "Extra item, Lunch", 50, 60],
      ["Chaat Counter", "Live counter, Lunch", 10, 70],
      ["Mocktail Bar", "Add-on, Lunch", 1, 5000],
    ]);
  });

  it("each custom charge becomes its own line and the lines still add up to the total", () => {
    const lines = buildInvoiceLines({
      adultCount: 10, totalParticipants: null, individualPricingEnabled: true, childrenCharge: 0, transportationCost: 0, otherCharges: 0,
      customCharges: [{ label: "Generator", amount: 1500 }], discount: 0, total: 1500, mealPlanEntries: [],
    });
    expect(lines).toEqual([{ description: "Generator", quantity: 1, rate: 1500 }]);
  });
});
