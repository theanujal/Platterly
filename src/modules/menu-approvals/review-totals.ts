import { percentOf } from "@/modules/orders/amount";
import { resolveCustomCharges, sumCustomCharges, type CustomCharge } from "@/modules/orders/custom-charges";

/** What the order holds besides the meals; the same fields as `ReviewPricing`. Pure, so the review's live total and its test share it. */
export interface ReviewChargeInputs {
  childrenCharge: number;
  discount: number;
  discountMode: "FIXED" | "PERCENTAGE";
  discountRate: number;
  otherCharges: number;
  otherChargesMode: "FIXED" | "PERCENTAGE";
  otherChargesRate: number;
  transportationCost: number;
  transportationMode: "FIXED" | "PERCENTAGE";
  transportationRate: number;
  customChargeLines: CustomCharge[];
}

/**
 * The total of a draft meal plan, worked out like `recalculateOrderTotals`: a percentage Discount, Extra / Service Cost, Transportation
 * or team line is a share of the subtotal (meals + children), so it moves with the meals.
 */
export function reviewTotals(mealsSubtotal: number, charges: ReviewChargeInputs) {
  const subtotal = mealsSubtotal + charges.childrenCharge;
  const resolve = (mode: "FIXED" | "PERCENTAGE", rate: number, fixed: number) => (mode === "PERCENTAGE" ? percentOf(subtotal, rate) : fixed);
  const chargesAndDiscount =
    resolve(charges.transportationMode, charges.transportationRate, charges.transportationCost) +
    resolve(charges.otherChargesMode, charges.otherChargesRate, charges.otherCharges) +
    sumCustomCharges(resolveCustomCharges(charges.customChargeLines, subtotal)) -
    resolve(charges.discountMode, charges.discountRate, charges.discount);
  return { chargesAndDiscount, total: subtotal + chargesAndDiscount };
}
