import { describe, expect, it } from "vitest";
import { lowStockError, lowStockStep } from "../options";

describe("low stock alert rule", () => {
  it("is optional", () => {
    expect(lowStockError("kg", "")).toBeNull();
    expect(lowStockError("pcs", undefined)).toBeNull();
  });
  it("must be zero or more", () => {
    expect(lowStockError("kg", "-1")).toMatch(/zero or more/);
    expect(lowStockError("kg", "abc")).toMatch(/zero or more/);
    expect(lowStockError("kg", "0")).toBeNull();
  });
  it("allows up to 3 decimals for weights and volumes", () => {
    expect(lowStockError("kg", "2.5")).toBeNull();
    expect(lowStockError("ml", 0.125)).toBeNull();
    expect(lowStockError("ltr", "1.2345")).toMatch(/3 decimal/);
  });
  it("must be a whole number for counted units", () => {
    for (const unit of ["pcs", "dozen", "box", "packet", "bag", "bottle"]) {
      expect(lowStockError(unit, "12")).toBeNull();
      expect(lowStockError(unit, "2.5")).toMatch(/whole number/);
    }
  });
  it("has a step to match the unit", () => {
    expect(lowStockStep("pcs")).toBe("1");
    expect(lowStockStep("kg")).toBe("0.001");
  });
});
