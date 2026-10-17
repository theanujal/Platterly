import "server-only";
import { prisma } from "@/lib/db";
import { parseCustomCharges } from "@/modules/orders/custom-charges";
import type { OrderInput } from "@/modules/orders/order";

/**
 * A person without the order-prices right (Sensitive data: orderPrices) can still create and edit orders (AJ, 2026-10-17, D7), but
 * what they submit never sets a price: the form was given none and anything a forged request adds is dropped here. The server then
 * works the total out from the catalog and the pricing already saved on the order, so the numbers stay authoritative and nothing
 * is sent to the browser to calculate them.
 */

/** The pricing fields of an order that nothing a restricted user sends may change. */
export type SavedPricing = Pick<
  OrderInput,
  | "pricingMethod"
  | "individualChildBelow5Rate"
  | "individualChildBelow5PricingType"
  | "individualChild5To10Rate"
  | "individualChild5To10PricingType"
  | "individualPricingEnabled"
  | "discount"
  | "discountMode"
  | "discountRate"
  | "transportationCost"
  | "transportationMode"
  | "transportationRate"
  | "otherCharges"
  | "otherChargesMode"
  | "otherChargesRate"
  | "customCharges"
>;

/** The pricing a brand-new order starts with when its creator cannot set prices: the menu's own prices, no discount, no extra charges. */
export const DEFAULT_PRICING: SavedPricing = {
  pricingMethod: "STANDARD",
  individualChildBelow5Rate: null,
  individualChildBelow5PricingType: null,
  individualChild5To10Rate: null,
  individualChild5To10PricingType: null,
  individualPricingEnabled: false,
  discount: 0,
  discountMode: "FIXED",
  discountRate: 0,
  transportationCost: 0,
  transportationMode: "FIXED",
  transportationRate: 0,
  otherCharges: 0,
  otherChargesMode: "FIXED",
  otherChargesRate: 0,
  customCharges: [],
};

const asNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** What the order already holds, in the shape of the order input. */
export async function savedPricing(organizationId: string, orderId: string): Promise<SavedPricing> {
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId } });
  return {
    pricingMethod: order.pricingMethod,
    individualChildBelow5Rate: asNumber(order.individualChildBelow5Rate),
    individualChildBelow5PricingType: order.individualChildBelow5PricingType,
    individualChild5To10Rate: asNumber(order.individualChild5To10Rate),
    individualChild5To10PricingType: order.individualChild5To10PricingType,
    individualPricingEnabled: order.individualPricingEnabled,
    discount: Number(order.discount),
    discountMode: order.discountMode,
    discountRate: Number(order.discountRate),
    transportationCost: Number(order.transportationCost),
    transportationMode: order.transportationMode,
    transportationRate: Number(order.transportationRate),
    otherCharges: Number(order.otherCharges),
    otherChargesMode: order.otherChargesMode,
    otherChargesRate: Number(order.otherChargesRate),
    customCharges: parseCustomCharges(order.customCharges),
  };
}

const slotKey = (date: Date, mealType: string) => `${date.toISOString().slice(0, 10)}|${mealType}`;

/** The per-plate price of each saved meal, by date and meal type (undefined where the meal has none). */
export async function savedMealPrices(organizationId: string, orderId: string): Promise<Map<string, number | undefined>> {
  const rows = await prisma.mealPlanEntry.findMany({ where: { orderId, order: { organizationId } }, select: { date: true, mealType: true, price: true } });
  return new Map(rows.map((row) => [slotKey(row.date, row.mealType), row.price === null ? undefined : Number(row.price)]));
}

/** Meals as submitted, each keeping the price it already had (a new meal gets none, so the menu's price applies). */
export function withSavedMealPrices<T extends { date: Date; mealType: string; price?: number }>(entries: T[], saved: Map<string, number | undefined>): T[] {
  return entries.map((entry) => ({ ...entry, price: saved.get(slotKey(entry.date, entry.mealType)) }));
}

/** The same for a quotation: what it already holds, in the shape of the quotation input (which has the same pricing fields as an order's). */
export async function savedQuotationPricing(organizationId: string, quotationId: string): Promise<SavedPricing> {
  const q = await prisma.quotation.findFirstOrThrow({ where: { id: quotationId, organizationId } });
  return {
    pricingMethod: q.pricingMethod,
    individualChildBelow5Rate: asNumber(q.individualChildBelow5Rate),
    individualChildBelow5PricingType: q.individualChildBelow5PricingType,
    individualChild5To10Rate: asNumber(q.individualChild5To10Rate),
    individualChild5To10PricingType: q.individualChild5To10PricingType,
    individualPricingEnabled: q.individualPricingEnabled,
    discount: Number(q.discount),
    discountMode: q.discountMode,
    discountRate: Number(q.discountRate),
    transportationCost: Number(q.transportationCost),
    transportationMode: q.transportationMode,
    transportationRate: Number(q.transportationRate),
    otherCharges: Number(q.otherCharges),
    otherChargesMode: q.otherChargesMode,
    otherChargesRate: Number(q.otherChargesRate),
    customCharges: parseCustomCharges(q.customCharges),
  };
}

export async function savedQuotationMealPrices(organizationId: string, quotationId: string): Promise<Map<string, number | undefined>> {
  const rows = await prisma.quotationMealPlanEntry.findMany({ where: { quotationId, quotation: { organizationId } }, select: { date: true, mealType: true, price: true } });
  return new Map(rows.map((row) => [slotKey(row.date, row.mealType), row.price === null ? undefined : Number(row.price)]));
}
