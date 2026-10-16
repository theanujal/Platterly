import { describe, expect, it } from "vitest";
import { reviewTotals, type ReviewChargeInputs } from "../review-totals";

const base: ReviewChargeInputs = {
  childrenCharge: 1650,
  discount: 500,
  discountMode: "FIXED",
  discountRate: 0,
  otherCharges: 49990,
  otherChargesMode: "FIXED",
  otherChargesRate: 0,
  transportationCost: 10000,
  transportationMode: "FIXED",
  transportationRate: 0,
  customChargeLines: [{ label: "Generator", amount: 5000 }],
};

describe("reviewTotals", () => {
  it("adds fixed charges and takes off the discount, as the order does", () => {
    // 16,500 meals + 1,650 children = 18,150 subtotal; ORD-0021's own total is 82,640.
    expect(reviewTotals(16500, base)).toEqual({ chargesAndDiscount: 64490, total: 82640 });
  });

  it("resolves percentage lines against the draft's subtotal, so they follow the meals", () => {
    const pct: ReviewChargeInputs = {
      ...base,
      discountMode: "PERCENTAGE",
      discountRate: 10,
      otherChargesMode: "PERCENTAGE",
      otherChargesRate: 5,
      transportationMode: "FIXED",
      transportationCost: 1000,
      customChargeLines: [{ label: "Service", amount: 0, mode: "PERCENTAGE", rate: 2 }],
    };
    // subtotal 10,000 + 1,650 = 11,650: discount 1,165, extra 582.5, service 233, transport 1,000.
    expect(reviewTotals(10000, pct)).toEqual({ chargesAndDiscount: 650.5, total: 12300.5 });
    // more meals, bigger percentages
    expect(reviewTotals(20000, pct).total).toBeGreaterThan(reviewTotals(10000, pct).total);
  });
});
