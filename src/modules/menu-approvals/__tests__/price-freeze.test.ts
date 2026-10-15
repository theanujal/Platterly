import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { updateOrder, type OrderInput } from "@/modules/orders/order";
import { OrderLockedError } from "@/modules/orders/order-lock";
import { priceFieldChanges, PriceFrozenError } from "@/modules/orders/price-freeze";
import { saveOrderWithMeals, updateMenuApprovalMealPlan, InvalidMenuSelectionTransitionError } from "@/modules/menu-approvals/menu-approval";
import { sendMenuForApproval } from "@/modules/menu-approvals/approval-link";
import { cleanupWorlds, newBusiness } from "./phase2-world";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

/**
 * Decision 14 of the Menu Approvals + Orders merge: while a menu is with the customer, approved or with the kitchen, a real price-field
 * change by an ordinary order edit is refused (nothing written), an unchanged value is not a change, and the order save and its
 * meal-plan save are one operation. Real database, the real transactions and locks.
 */

afterEach(cleanupWorlds);

const FROZEN: MenuSelectionStatus[] = ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING", "CUSTOMER_APPROVED", "FINAL_LOCKED"];
// Final/Locked is the kitchen hand-off: the whole order is locked there, so the price freeze is never the first thing to refuse.
const PRE_KITCHEN_FROZEN = FROZEN.filter((status) => status !== "FINAL_LOCKED");
const EDITABLE: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

// What the order form submits: the whole order every time, so an unchanged save must work.
async function formInput(orderId: string, patch: Partial<OrderInput> = {}): Promise<OrderInput> {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return {
    customerId: o.customerId,
    eventTypeId: o.eventTypeId ?? undefined,
    eventStartDate: o.eventStartDate,
    eventEndDate: o.eventEndDate,
    adultCount: o.adultCount ?? undefined,
    childBelow5Count: o.childBelow5Count ?? undefined,
    child5To10Count: o.child5To10Count ?? undefined,
    totalParticipants: o.totalParticipants ?? undefined,
    discount: Number(o.discount),
    transportationCost: Number(o.transportationCost),
    otherCharges: Number(o.otherCharges),
    customCharges: [],
    individualPricingEnabled: o.individualPricingEnabled,
    pricingMethod: o.pricingMethod,
    notes: o.notes ?? "",
    ...patch,
  };
}

async function setStatus(selectionId: string, status: MenuSelectionStatus) {
  await prisma.menuSelection.update({ where: { id: selectionId }, data: { status } });
}

describe("priceFieldChanges (pure)", () => {
  const stored = {
    adultCount: 100,
    childBelow5Count: null,
    child5To10Count: 4,
    totalParticipants: 104,
    pricingMethod: "STANDARD",
    individualChildBelow5Rate: null,
    individualChildBelow5PricingType: "FIXED",
    individualChild5To10Rate: null,
    individualChild5To10PricingType: "FIXED",
    individualPricingEnabled: false,
    discount: "500.00",
    transportationCost: "0.00",
    otherCharges: "0.00",
    customCharges: [{ label: "Tent", amount: 1000 }],
  };
  const base = { customerId: "c" } as OrderInput;

  it("is empty for an order saved unchanged, and for fields left out", () => {
    expect(priceFieldChanges(stored, base)).toEqual([]);
    expect(priceFieldChanges(stored, { ...base, adultCount: 100, discount: 500, customCharges: [{ label: "Tent", amount: 1000 }], individualPricingEnabled: false, pricingMethod: "STANDARD" })).toEqual([]);
    expect(priceFieldChanges(stored, { ...base, discount: null as unknown as number, individualChildBelow5Rate: null })).toEqual([]); // null keeps the stored value
  });

  it.each([
    ["adultCount", { adultCount: 101 }],
    ["childBelow5Count", { childBelow5Count: 2 }],
    ["child5To10Count", { child5To10Count: 5 }],
    ["totalParticipants", { totalParticipants: 110 }],
    ["discount", { discount: 600 }],
    ["transportationCost", { transportationCost: 50 }],
    ["otherCharges", { otherCharges: 10 }],
    ["pricingMethod", { pricingMethod: "INDIVIDUAL" as const }],
    ["individualPricingEnabled", { individualPricingEnabled: true }],
    ["customCharges", { customCharges: [{ label: "Tent", amount: 1200 }] }],
  ])("flags %s", (field, patch) => {
    expect(priceFieldChanges(stored, { ...base, ...patch })).toEqual([field]);
  });

  it.each([
    ["individualChildBelow5Rate", { individualChildBelow5Rate: 20 }],
    ["individualChild5To10Rate", { individualChild5To10Rate: 30 }],
    ["individualChildBelow5PricingType", { individualChildBelow5PricingType: "PERCENTAGE" as const }],
    ["individualChild5To10PricingType", { individualChild5To10PricingType: "PERCENTAGE" as const }],
  ])("flags %s under Individual children's pricing, and ignores it under Standard pricing", (field, patch) => {
    expect(priceFieldChanges({ ...stored, pricingMethod: "INDIVIDUAL" }, { ...base, ...patch })).toEqual([field]);
    expect(priceFieldChanges(stored, { ...base, ...patch })).toEqual([]);
  });

  it("reads a stored null children's pricing type as FIXED, so a form that sends FIXED is not a change", () => {
    const nullTypes = { ...stored, pricingMethod: "INDIVIDUAL", individualChildBelow5PricingType: null, individualChild5To10PricingType: null };
    expect(priceFieldChanges(nullTypes, { ...base, individualChildBelow5PricingType: "FIXED", individualChild5To10PricingType: "FIXED" })).toEqual([]);
    expect(priceFieldChanges(nullTypes, { ...base, individualChildBelow5PricingType: "PERCENTAGE" })).toEqual(["individualChildBelow5PricingType"]);
  });

  it("does not flag a field that has nothing to do with the price", () => {
    expect(priceFieldChanges(stored, { ...base, notes: "x", venue: "Hall", kitchenNotes: "y" })).toEqual([]);
  });
});

describe("the price freeze on an ordinary order edit", () => {
  it.each(FROZEN)("refuses a price change in %s and writes nothing", async (status) => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await setStatus(selection.id, status);
    const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    const refused = await updateOrder(b.org.id, order.id, await formInput(order.id, { discount: 700, notes: "changed too" }), b.owner.user.id).catch((e) => e);
    expect(refused).toBeInstanceOf(status === "FINAL_LOCKED" ? OrderLockedError : PriceFrozenError);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(after.discount)).toBe(Number(before.discount));
    expect(Number(after.total)).toBe(Number(before.total));
    expect(after.notes).toBe(before.notes); // nothing else in the same save was kept either
  });

  it.each(PRE_KITCHEN_FROZEN)("saves an unchanged order and a change to something that is not a price in %s", async (status) => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await setStatus(selection.id, status);
    await updateOrder(b.org.id, order.id, await formInput(order.id), b.owner.user.id); // the form re-submits every field
    await updateOrder(b.org.id, order.id, await formInput(order.id, { notes: "Gate code 4411", venue: "Hall B" }), b.owner.user.id);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([saved.notes, saved.venue]).toEqual(["Gate code 4411", "Hall B"]);
  });

  it.each(EDITABLE)("still allows a price change in %s", async (status) => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await setStatus(selection.id, status);
    await updateOrder(b.org.id, order.id, await formInput(order.id, { discount: 700 }), b.owner.user.id);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(saved.discount)).toBe(700);
    expect(Number(saved.total)).toBe(Number(saved.subtotal) - 700);
  });

  it("does not apply to an order that has no menu approval yet", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await prisma.menuSelection.delete({ where: { id: selection.id } });
    await updateOrder(b.org.id, order.id, await formInput(order.id, { discount: 900 }), b.owner.user.id);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).discount)).toBe(900);
  });

  it("a legitimate change goes through Recall, edit and a new send", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    expect(await updateOrder(b.org.id, order.id, await formInput(order.id, { discount: 100 }), b.owner.user.id).catch((e) => e)).toBeInstanceOf(PriceFrozenError);
    const { recallMenuFromCustomer } = await import("@/modules/menu-approvals/approval-link");
    await recallMenuFromCustomer(b.org.id, selection.id, b.owner.user.id);
    await updateOrder(b.org.id, order.id, await formInput(order.id, { discount: 100 }), b.owner.user.id);
    const second = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    expect(second.versionNumber).toBe(2);
    const v2 = await prisma.menuVersion.findFirstOrThrow({ where: { menuSelectionId: selection.id, versionNumber: 2 } });
    expect((v2.snapshot as { total: number }).total).toBe(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).total));
  });
});

describe("the order save and its meal-plan save are one operation", () => {
  const meal = (menuId: string | null) => [{ date: new Date("2026-12-05"), mealType: "DINNER" as const, price: 500, menuId, items: [] }];

  it("a failing meal plan leaves the other order fields unchanged", async () => {
    const b = await newBusiness();
    const { order } = await b.makeOrder();
    const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { mealPlanEntries: true } });
    const refused = await saveOrderWithMeals(
      b.org.id,
      order.id,
      { ...(await formInput(order.id, { notes: "must not stay", discount: 250 })), mealPlanEntries: meal("a-menu-that-does-not-exist") },
      b.owner.user.id,
    ).catch((e) => e);
    expect(refused).toBeInstanceOf(Error);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { mealPlanEntries: true } });
    expect(after.notes).toBe(before.notes);
    expect(Number(after.discount)).toBe(Number(before.discount));
    expect(Number(after.total)).toBe(Number(before.total));
    expect(after.mealPlanEntries.map((m) => Number(m.price))).toEqual(before.mealPlanEntries.map((m) => Number(m.price)));
  });

  it("a menu that is with the customer refuses the whole save, order fields included", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    const refused = await saveOrderWithMeals(b.org.id, order.id, { ...(await formInput(order.id, { notes: "must not stay" })), mealPlanEntries: meal(null) }, b.owner.user.id).catch((e) => e);
    expect(refused).toBeInstanceOf(InvalidMenuSelectionTransitionError);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).notes).toBeNull();
  });

  it("in Needs Review the order fields and the meals are saved together", async () => {
    const b = await newBusiness();
    const { order } = await b.makeOrder();
    await saveOrderWithMeals(b.org.id, order.id, { ...(await formInput(order.id, { notes: "kept", discount: 250 })), mealPlanEntries: meal(null) }, b.owner.user.id);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { mealPlanEntries: true } });
    expect([saved.notes, Number(saved.discount), Number(saved.mealPlanEntries[0].price)]).toEqual(["kept", 250, 500]);
    // 100 adults x 500 (Individual Pricing) - 250
    expect(Number(saved.total)).toBe(100 * 500 - 250);
  });

  it("the planner save alone is refused once the menu is approved", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await setStatus(selection.id, "CUSTOMER_APPROVED");
    const refused = await updateMenuApprovalMealPlan(b.org.id, selection.id, meal(null), b.owner.user.id).catch((e) => e);
    expect(refused).toBeInstanceOf(InvalidMenuSelectionTransitionError);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).total)).toBe(40000);
  });
});

describe("races under the menu's lock", () => {
  it("a send and a price change at the same moment never leave the sent version with another price than the order", async () => {
    for (let round = 0; round < 6; round++) {
      const b = await newBusiness();
      const { order, selection } = await b.makeOrder();
      const [sent, edited] = await Promise.allSettled([
        sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id),
        (async () => updateOrder(b.org.id, order.id, await formInput(order.id, { discount: 1000 }), b.owner.user.id))(),
      ]);
      expect(sent.status).toBe("fulfilled");
      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const version = await prisma.menuVersion.findFirstOrThrow({ where: { menuSelectionId: selection.id } });
      // Either the edit came first (the version has the new price) or the send did (the edit was refused). Never a mismatch.
      expect((version.snapshot as { total: number }).total).toBe(Number(finalOrder.total));
      if (edited.status === "rejected") expect(edited.reason).toBeInstanceOf(PriceFrozenError);
    }
  });
});
