import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { computeIndividualChildrenCharge, createOrder, updateOrder, usesIndividualChildRates } from "../order";
import { parseCustomCharges, resolveCustomCharges, sumCustomCharges } from "../custom-charges";
import { createCustomer } from "@/modules/customers/customer";
import { percentOf } from "../amount";
import { priceFieldChanges } from "../price-freeze";
import { computeProfitability } from "@/modules/expenses/profitability";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function makeOrder(extra: Record<string, unknown> = {}) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Amount Kitchen", slug: `amt-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Team", email: `t-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Anoop Jalota", phone: `98${Math.floor(10000000 + Math.random() * 89999999)}` }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-05"),
      totalParticipants: 100,
      adultCount: 1,
      individualPricingEnabled: true,
      mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 10000 }],
      ...extra,
    },
    actor.id,
  );
  return { org, actor, order };
}

describe("percentOf", () => {
  it("rounds to the paisa", () => {
    expect(percentOf(10000, 10)).toBe(1000);
    expect(percentOf(999, 12.5)).toBe(124.88);
    expect(percentOf(0, 50)).toBe(0);
  });
});

describe("Discount and Extra / Service Cost as a percentage (AJ, 2026-10-16)", () => {
  it("a percentage is taken from the subtotal and stored as the rupee amount", async () => {
    const { order } = await makeOrder({ discountMode: "PERCENTAGE", discountRate: 10, otherChargesMode: "PERCENTAGE", otherChargesRate: 5, transportationCost: 200 });
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(saved.subtotal)).toBe(10000);
    expect(Number(saved.discount)).toBe(1000);
    expect(Number(saved.otherCharges)).toBe(500);
    expect(Number(saved.total)).toBe(10000 - 1000 + 500 + 200);
    expect(saved.discountMode).toBe("PERCENTAGE");
  });

  it("the amount follows the subtotal when the meal price changes", async () => {
    const { org, actor, order } = await makeOrder({ discountMode: "PERCENTAGE", discountRate: 10 });
    await updateOrder(org.id, order.id, { customerId: order.customerId, eventStartDate: order.eventStartDate, eventEndDate: order.eventEndDate, mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 20000 }] }, actor.id);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(saved.discount)).toBe(2000);
    expect(Number(saved.total)).toBe(18000);
  });

  it("a fixed amount stays a fixed amount, and a rate over 100 is refused", async () => {
    const { order } = await makeOrder({ discount: 750 });
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.discountMode).toBe("FIXED");
    expect(Number(saved.total)).toBe(9250);
    await expect(makeOrder({ discountMode: "PERCENTAGE", discountRate: 101 })).rejects.toThrow(/percentage/);
  });
});

describe("price freeze with percentages", () => {
  const stored = { adultCount: 1, childBelow5Count: 0, child5To10Count: 0, totalParticipants: 100, pricingMethod: "STANDARD", individualChildBelow5Rate: null, individualChildBelow5PricingType: null, individualChild5To10Rate: null, individualChild5To10PricingType: null, individualPricingEnabled: true, discount: 1000, transportationCost: 0, otherCharges: 0, discountMode: "PERCENTAGE", discountRate: 10, otherChargesMode: "FIXED", otherChargesRate: 0, customCharges: [] };
  it("an unchanged percentage is not a price change even when the submitted amount differs by rounding", () => {
    expect(priceFieldChanges(stored, { customerId: "x", eventStartDate: new Date(), eventEndDate: new Date(), discount: 1000.01, discountMode: "PERCENTAGE", discountRate: 10 })).toEqual([]);
  });
  it("a changed rate, or a changed mode, is", () => {
    expect(priceFieldChanges(stored, { customerId: "x", eventStartDate: new Date(), eventEndDate: new Date(), discount: 1100, discountMode: "PERCENTAGE", discountRate: 11 })).toEqual(["discount"]);
    expect(priceFieldChanges(stored, { customerId: "x", eventStartDate: new Date(), eventEndDate: new Date(), discount: 1000, discountMode: "FIXED", discountRate: 0 })).toEqual(["discount"]);
  });
});

describe("food cost from the inventory sent to the order (AJ, 2026-10-16)", () => {
  it("adds the stock cost to Food on top of recorded Food expenses", () => {
    const p = computeProfitability(10000, [{ category: "FOOD", amount: 500 }, { category: "LABOUR", amount: 1000 }], 2500);
    expect(p.byCategory.FOOD).toBe(3000);
    expect(p.inventoryFoodCost).toBe(2500);
    expect(p.totalCost).toBe(4000);
    expect(p.foodCostPercent).toBe(30);
  });
  it("is unchanged when no stock was sent", () => {
    expect(computeProfitability(10000, [{ category: "FOOD", amount: 500 }]).byCategory.FOOD).toBe(500);
  });
});

describe("child rates typed under Individual Pricing (AJ, 2026-10-16)", () => {
  const base = { pricingMethod: "STANDARD" as const, individualPricingEnabled: true, individualChildBelow5Rate: null, individualChild5To10Rate: null };
  it("uses them when the switch is on and a rate was typed, even with the method left at Standard", () => {
    expect(usesIndividualChildRates({ ...base, individualChildBelow5Rate: 50 })).toBe(true);
    expect(computeIndividualChildrenCharge({ individualChildBelow5Rate: 50, individualChildBelow5PricingType: "FIXED", individualChild5To10Rate: 50, individualChild5To10PricingType: "FIXED" }, 0, 3, 3)).toBe(300);
  });
  it("keeps pricing from the Menu when the switch is on but no child rate was typed (storefront orders)", () => {
    expect(usesIndividualChildRates(base)).toBe(false);
    expect(usesIndividualChildRates({ ...base, pricingMethod: "INDIVIDUAL" })).toBe(true);
  });
});

describe("custom charges as a percentage (AJ, 2026-10-16)", () => {
  it("keeps a percentage line by its rate and resolves its amount from the subtotal", () => {
    const lines = parseCustomCharges([{ label: "Generator", mode: "PERCENTAGE", rate: 2, amount: 0 }, { label: "Tent", amount: 500 }, { label: "Bad", mode: "PERCENTAGE", rate: 150 }]);
    expect(lines.map((l) => l.label)).toEqual(["Generator", "Tent"]);
    expect(sumCustomCharges(resolveCustomCharges(lines, 10000))).toBe(700);
    expect(resolveCustomCharges(lines, 10000)[0]).toMatchObject({ mode: "PERCENTAGE", rate: 2, amount: 200 });
  });
});
