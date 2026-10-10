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
  it("each custom charge becomes its own line and the lines still add up to the total", () => {
    const lines = buildInvoiceLines({
      adultCount: 10, totalParticipants: null, individualPricingEnabled: true, childrenCharge: 0, transportationCost: 0, otherCharges: 0,
      customCharges: [{ label: "Generator", amount: 1500 }], discount: 0, total: 1500, mealPlanEntries: [],
    });
    expect(lines).toEqual([{ description: "Generator", quantity: 1, rate: 1500 }]);
  });
});
