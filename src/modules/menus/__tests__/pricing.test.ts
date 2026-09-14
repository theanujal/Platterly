import { describe, it, expect } from "vitest";
import { calculatePackagePrice, GuestCountOutOfRangeError } from "@/modules/menus/pricing";

describe("calculatePackagePrice (Chunk 6 Group 6.1 verify step)", () => {
  it("FIXED package: base price only, ignores guest count", () => {
    const total = calculatePackagePrice(
      { pricingModel: "FIXED", fixedPrice: 15000, perPersonPrice: null, minGuests: null, maxGuests: null },
      50,
    );
    expect(total).toBe(15000);
  });

  it("PER_PERSON package: base price scales with guest count", () => {
    const total = calculatePackagePrice(
      { pricingModel: "PER_PERSON", fixedPrice: null, perPersonPrice: 500, minGuests: null, maxGuests: null },
      100,
    );
    expect(total).toBe(50000);
  });

  it("included items (neither optional nor add-on) are always priced in", () => {
    const total = calculatePackagePrice(
      { pricingModel: "PER_PERSON", fixedPrice: null, perPersonPrice: 500, minGuests: null, maxGuests: null },
      10,
      [{ isOptional: false, isAddOn: false, extraPrice: 50 }],
    );
    expect(total).toBe(10 * 500 + 10 * 50);
  });

  it("unselected optional/add-on items contribute nothing", () => {
    const total = calculatePackagePrice(
      { pricingModel: "PER_PERSON", fixedPrice: null, perPersonPrice: 500, minGuests: null, maxGuests: null },
      10,
      [{ isOptional: true, isAddOn: false, extraPrice: 100, selected: false }],
    );
    expect(total).toBe(5000);
  });

  it("selected optional item adds extraPrice per-guest for a PER_PERSON package", () => {
    const total = calculatePackagePrice(
      { pricingModel: "PER_PERSON", fixedPrice: null, perPersonPrice: 500, minGuests: null, maxGuests: null },
      10,
      [{ isOptional: true, isAddOn: false, extraPrice: 100, selected: true }],
    );
    expect(total).toBe(10 * 500 + 10 * 100);
  });

  it("selected add-on adds extraPrice flat for a FIXED package", () => {
    const total = calculatePackagePrice(
      { pricingModel: "FIXED", fixedPrice: 15000, perPersonPrice: null, minGuests: null, maxGuests: null },
      50,
      [{ isOptional: false, isAddOn: true, extraPrice: 2000, selected: true }],
    );
    expect(total).toBe(17000);
  });

  it("rejects a guest count below minGuests", () => {
    expect(() =>
      calculatePackagePrice(
        { pricingModel: "PER_PERSON", fixedPrice: null, perPersonPrice: 500, minGuests: 20, maxGuests: null },
        10,
      ),
    ).toThrow(GuestCountOutOfRangeError);
  });

  it("rejects a guest count above maxGuests", () => {
    expect(() =>
      calculatePackagePrice(
        { pricingModel: "PER_PERSON", fixedPrice: null, perPersonPrice: 500, minGuests: null, maxGuests: 100 },
        150,
      ),
    ).toThrow(GuestCountOutOfRangeError);
  });
});
