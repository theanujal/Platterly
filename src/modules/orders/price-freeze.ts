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
  discountMode?: string;
  discountRate?: unknown;
  otherChargesMode?: string;
  otherChargesRate?: unknown;
  transportationMode?: string;
  transportationRate?: unknown;
  customCharges: unknown;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function customLines(value: unknown) {
  // A percentage line is compared by its rate: its rupee amount follows the subtotal.
  return JSON.stringify(parseCustomCharges(value).map((line) => (line.mode === "PERCENTAGE" ? { label: line.label, mode: line.mode, rate: line.rate } : { label: line.label, amount: Number(line.amount) })));
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
  // A percentage amount is derived from its rate, so then the mode and the rate are what is compared, not the amount.
  const modes: Record<string, [string, unknown, string | undefined, number | undefined, string | undefined]> = {
    discount: ["discount", before.discountRate, before.discountMode, input.discountRate, input.discountMode],
    otherCharges: ["otherCharges", before.otherChargesRate, before.otherChargesMode, input.otherChargesRate, input.otherChargesMode],
    transportationCost: ["transportationCost", before.transportationRate, before.transportationMode, input.transportationRate, input.transportationMode],
  };
  for (const [name, stored, next] of amounts) {
    const mode = modes[name];
    if (mode) {
      const [, storedRate, storedMode, nextRate, nextMode] = mode;
      const effectiveMode = nextMode ?? storedMode ?? "FIXED";
      if (effectiveMode !== (storedMode ?? "FIXED")) {
        changed.push(name);
        continue;
      }
      if (effectiveMode === "PERCENTAGE") {
        if (nextRate !== undefined && Math.abs((num(storedRate) ?? 0) - nextRate) > 0.0001) changed.push(name);
        continue;
      }
    }
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

/** The customer, event and venue details are frozen along with the price (AJ, 2026-10-17), with a message that says so. */
export class DetailsFrozenError extends ValidationError {
  constructor() {
    super("The customer has the menu, so the customer, event, guest and pricing details can't be changed here. Recall the menu to edit them; the customer will approve the new version.");
    this.name = "DetailsFrozenError";
  }
}

type StoredDetails = {
  customerId: string;
  eventTypeId: string | null;
  orderKind: string;
  eventStartDate: Date;
  eventEndDate: Date;
  venuePerEvent: boolean;
  liveCounterAvailable: boolean | null;
  gasElectricAvailable: boolean | null;
} & Record<(typeof TEXT_DETAILS)[number], unknown>;

const TEXT_DETAILS = [
  "venue", "eventAddress", "venueType", "vehicleAccess", "venueAccessInstructions", "venueDoorNumber", "venueTower", "venueFloor", "venueLandmark",
  "venueContactName", "venueContactPhone", "deliveryInstructions", "cookingInstructions",
] as const;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : value == null ? "" : String(value));
const day = (value: Date) => value.toISOString().slice(0, 10);

type StoredEventVenue = { date: Date; mealType: string; venueType: string; venue: string; eventAddress: string; venueDoorNumber: string | null; venueTower: string | null; venueFloor: string | null; venueLandmark: string | null; venueContactName: string; venueContactPhone: string; venueAccessInstructions: string | null; cookingInstructions: string | null; gasElectricAvailable: boolean; liveCounterAvailable: boolean };

/**
 * The customer, event and venue fields a save would change. Like `priceFieldChanges`: a field left out of the input is not being
 * changed, and a value equal to the stored one (an empty text and null are the same) is not a change, so saving an unchanged order is
 * never refused. The per-event venues are compared against the stored rows by event.
 */
export function detailFieldChanges(before: StoredDetails, input: OrderInput, storedEventVenues: StoredEventVenue[] = []): string[] {
  const changed: string[] = [];
  if (input.customerId !== undefined && input.customerId !== before.customerId) changed.push("customerId");
  if (input.eventTypeId !== undefined && (input.eventTypeId ?? null) !== before.eventTypeId) changed.push("eventTypeId");
  if (input.orderKind !== undefined && input.orderKind !== before.orderKind) changed.push("orderKind");
  if (input.eventStartDate !== undefined && day(input.eventStartDate) !== day(before.eventStartDate)) changed.push("eventStartDate");
  if (input.eventEndDate !== undefined && day(input.eventEndDate) !== day(before.eventEndDate)) changed.push("eventEndDate");
  for (const name of TEXT_DETAILS) {
    const next = (input as unknown as Record<string, unknown>)[name];
    if (next !== undefined && text(next) !== text(before[name])) changed.push(name);
  }
  if (input.liveCounterAvailable !== undefined && (input.liveCounterAvailable ?? false) !== (before.liveCounterAvailable ?? false)) changed.push("liveCounterAvailable");
  if (input.gasElectricAvailable !== undefined && (input.gasElectricAvailable ?? false) !== (before.gasElectricAvailable ?? false)) changed.push("gasElectricAvailable");
  if (input.venuePerEvent !== undefined && input.venuePerEvent !== before.venuePerEvent) changed.push("venuePerEvent");
  if (input.venuePerEvent && input.eventVenues) {
    const stored = new Map(storedEventVenues.map((row) => [`${day(row.date)}-${row.mealType}`, row]));
    for (const event of input.eventVenues) {
      const row = stored.get(event.key);
      const d = event.details;
      const same =
        row &&
        text(d.venueType) === text(row.venueType) && text(d.venueBuildingName) === text(row.venue) && text(d.completeVenueAddress) === text(row.eventAddress) &&
        text(d.venueDoorNumber) === text(row.venueDoorNumber) && text(d.venueTower) === text(row.venueTower) && text(d.venueFloor) === text(row.venueFloor) &&
        text(d.venueLandmark) === text(row.venueLandmark) && text(d.venueContactName) === text(row.venueContactName) && text(d.venueContactPhone).replace(/\s/g, "") === text(row.venueContactPhone).replace(/\s/g, "") &&
        text(d.venueAccessInstructions) === text(row.venueAccessInstructions) && text(d.cookingInstructions) === text(row.cookingInstructions) &&
        (d.gasElectricAvailable === true) === row.gasElectricAvailable && (d.liveCounterAvailable === true) === row.liveCounterAvailable;
      if (!same) changed.push(`eventVenue:${event.key}`);
    }
  }
  return changed;
}
