import { ValidationError } from "@/lib/errors";
import { parseCustomCharges } from "@/modules/orders/custom-charges";
import { PRICE_FROZEN_MESSAGE } from "@/modules/menu-approvals/approval-stages";
import type { OrderInput } from "@/modules/orders/order";

/**
 * Price freeze (Menu Approvals + Orders merge, Phase 2, Decision 14). While a menu is with the customer, approved or with the
 * kitchen, the price the customer agreed to can't be changed by an ordinary order edit. Pure: `updateOrder` calls it under the
 * menu's row lock with what is stored and what is being saved.
 */
export class PriceFrozenError extends ValidationError {
  constructor() {
    super(PRICE_FROZEN_MESSAGE);
    this.name = "PriceFrozenError";
  }
}

type Stored = {
  adultCount: number | null;
  childBelow5Count: number | null;
  child5To10Count: number | null;
  totalParticipants: number | null;
  pricingMethod: string;
  individualChildBelow5Rate: unknown;
  individualChildBelow5PricingType: string | null;
  individualChild5To10Rate: unknown;
  individualChild5To10PricingType: string | null;
  individualPricingEnabled: boolean;
  discount: unknown;
  transportationCost: unknown;
  otherCharges: unknown;
  customCharges: unknown;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function customLines(value: unknown) {
  return JSON.stringify(parseCustomCharges(value).map((line) => ({ label: line.label, amount: Number(line.amount) })));
}

/**
 * The price-affecting fields a save would change. A field left out of the input (undefined) is not being changed, and a value equal to
 * the stored one is not a change, so saving an unchanged order (the form submits every field) is never refused.
 * The meal plan is not compared here: it has its own rule (editable stages only).
 */
export function priceFieldChanges(before: Stored, input: OrderInput): string[] {
  const changed: string[] = [];
  // updateOrder writes the counts as given (undefined leaves them alone) but keeps the stored rate, discount and charges when the
  // input has null or nothing, so "not being changed" is `undefined` for the first group and `null` or `undefined` for the second.
  const counts: [string, unknown, unknown][] = [
    ["adultCount", before.adultCount, input.adultCount],
    ["childBelow5Count", before.childBelow5Count, input.childBelow5Count],
    ["child5To10Count", before.child5To10Count, input.child5To10Count],
    ["totalParticipants", before.totalParticipants, input.totalParticipants],
  ];
  const amounts: [string, unknown, unknown][] = [
    ["discount", before.discount, input.discount],
    ["transportationCost", before.transportationCost, input.transportationCost],
    ["otherCharges", before.otherCharges, input.otherCharges],
  ];
  for (const [name, stored, next] of counts) {
    if (next === undefined) continue;
    if (Math.abs((num(stored) ?? 0) - (num(next) ?? 0)) > 0.0001) changed.push(name);
  }
  for (const [name, stored, next] of amounts) {
    if (next === undefined || next === null) continue;
    if (Math.abs((num(stored) ?? 0) - Number(next)) > 0.0001) changed.push(name);
  }
  const plain: [string, unknown, unknown][] = [
    ["pricingMethod", before.pricingMethod, input.pricingMethod],
    ["individualPricingEnabled", before.individualPricingEnabled, input.individualPricingEnabled],
  ];
  for (const [name, stored, next] of plain) {
    if (next !== undefined && next !== null && stored !== next) changed.push(name);
  }
  // The children's rates and their types only set a price under Individual children's pricing. Under Standard pricing the form still
  // submits them (a stored null reads as "FIXED"), so they count only when that method is the one in force.
  if ((input.pricingMethod ?? before.pricingMethod) === "INDIVIDUAL") {
    for (const [name, stored, next] of [
      ["individualChildBelow5Rate", before.individualChildBelow5Rate, input.individualChildBelow5Rate],
      ["individualChild5To10Rate", before.individualChild5To10Rate, input.individualChild5To10Rate],
    ] as [string, unknown, unknown][]) {
      if (next !== undefined && next !== null && Math.abs((num(stored) ?? 0) - Number(next)) > 0.0001) changed.push(name);
    }
    for (const [name, stored, next] of [
      ["individualChildBelow5PricingType", before.individualChildBelow5PricingType, input.individualChildBelow5PricingType],
      ["individualChild5To10PricingType", before.individualChild5To10PricingType, input.individualChild5To10PricingType],
    ] as [string, string | null, string | null | undefined][]) {
      if (next !== undefined && next !== null && (stored ?? "FIXED") !== next) changed.push(name);
    }
  }
  if (input.customCharges !== undefined && customLines(before.customCharges) !== customLines(input.customCharges)) changed.push("customCharges");
  return changed;
}
