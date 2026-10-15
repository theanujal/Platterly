import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { updateOrder, deleteOrder, type OrderInput } from "@/modules/orders/order";
import { updateEvent } from "@/modules/events/event";
import { OrderLockedError } from "@/modules/orders/order-lock";
import { isMoveBack, KITCHEN_STARTED_MESSAGE } from "@/modules/orders/kitchen-lock";
import { addNoteToOpenOrder, OrderClosedError, saveOrderWithMeals, setKitchenProductionStatus, setMenuSelectionItems, updateMenuApprovalMealPlan } from "@/modules/menu-approvals/menu-approval";
import { approveViaLink, saveVenueViaLink, sendMenuForApproval, askAboutApprovedMenuViaLink, confirmApprovalViaLink } from "@/modules/menu-approvals/approval-link";
import { changeStatusManually, ManualStatusChangeError } from "@/modules/menu-approvals/manual-status";
import { OrderCompletedError } from "@/modules/orders/order-guard";
import { cleanupWorlds, newBusiness } from "./phase2-world";
import type { KitchenProductionStatus, OrderStatus } from "@/generated/prisma/enums";

// The kitchen lock (AJ, 2026-10-16): once an order has reached the kitchen, no ordinary workflow changes it. The lock is read from the
// stored menu approval and order inside the writing transaction, never from the page or the order's (possibly stale) status.

afterEach(cleanupWorlds);

const STAGES: KitchenProductionStatus[] = ["PENDING", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED"];

async function handOff(b: Awaited<ReturnType<typeof newBusiness>>, stage: KitchenProductionStatus = "PENDING", orderStatus: OrderStatus = "SENT_TO_KITCHEN") {
  const made = await b.makeOrder();
  await prisma.menuSelection.update({ where: { id: made.selection.id }, data: { status: "FINAL_LOCKED", kitchenProductionStatus: stage, lockedAt: new Date() } });
  await prisma.order.update({ where: { id: made.order.id }, data: { status: orderStatus } });
  return made;
}

async function formInput(orderId: string, overrides: Partial<OrderInput> = {}): Promise<OrderInput> {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return {
    customerId: o.customerId,
    eventTypeId: o.eventTypeId,
    eventStartDate: o.eventStartDate,
    eventEndDate: o.eventEndDate,
    adultCount: o.adultCount,
    totalParticipants: o.totalParticipants,
    venue: o.venue,
    notes: o.notes,
    ...overrides,
  } as OrderInput;
}

describe("every order or approval change is refused once the order is with the kitchen", () => {
  it.each(STAGES)("at kitchen stage %s, even when the order's own status is stale (Approved)", async (stage) => {
    const b = await newBusiness();
    // The order says Approved but the menu approval is Final/Locked: the lock reads the approval, not the order's status.
    const { order, selection } = await handOff(b, stage, "APPROVED");
    const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const refused = (promise: Promise<unknown>) => promise.then(() => null, (e) => e);

    expect(await refused(updateOrder(b.org.id, order.id, await formInput(order.id, { adultCount: 150, totalParticipants: 170 }), b.owner.user.id))).toBeInstanceOf(OrderLockedError);
    expect(await refused(updateOrder(b.org.id, order.id, await formInput(order.id, { discount: 500 }), b.owner.user.id))).toBeInstanceOf(OrderLockedError);
    expect(await refused(updateOrder(b.org.id, order.id, await formInput(order.id, { transportationCost: 900 }), b.owner.user.id))).toBeInstanceOf(OrderLockedError);
    expect(await refused(updateOrder(b.org.id, order.id, await formInput(order.id, { customCharges: [{ label: "Generator", amount: 1000 }] }), b.owner.user.id))).toBeInstanceOf(OrderLockedError);
    expect(await refused(updateOrder(b.org.id, order.id, await formInput(order.id, { venue: "Elsewhere", notes: "new note" }), b.owner.user.id))).toBeInstanceOf(OrderLockedError);
    expect(await refused(updateOrder(b.org.id, order.id, await formInput(order.id, { status: "PENDING_REVIEW" }), b.owner.user.id))).toBeInstanceOf(OrderLockedError);
    expect(await refused(updateOrder(b.org.id, order.id, await formInput(order.id, { childBelow5Count: 3 }), b.owner.user.id))).toBeInstanceOf(OrderLockedError);
    expect(await refused(saveOrderWithMeals(b.org.id, order.id, { ...(await formInput(order.id, { venue: "Elsewhere" })), mealPlanEntries: [] }, b.owner.user.id))).toBeTruthy();
    expect(await refused(updateMenuApprovalMealPlan(b.org.id, selection.id, [], b.owner.user.id))).toBeTruthy();
    expect(await refused(setMenuSelectionItems(b.org.id, selection.id, [], b.owner.user.id))).toBeTruthy();
    const event = await prisma.event.findFirstOrThrow({ where: { orderId: order.id } });
    expect(await refused(updateEvent(b.org.id, event.id, { customerId: order.customerId, startDate: event.startDate, endDate: event.endDate, name: "Renamed", guestCount: 999 } as never, b.owner.user.id))).toBeInstanceOf(OrderLockedError);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toEqual(before); // nothing was written, not even the timestamp
    expect(await prisma.mealPlanEntry.count({ where: { orderId: order.id } })).toBe(1);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).name).toBe(event.name);
  });

  it("a plain save cannot write Sent to Kitchen or Completed (only the hand-off and the kitchen's own progress do)", async () => {
    const b = await newBusiness();
    const { order } = await b.makeOrder();
    for (const status of ["SENT_TO_KITCHEN", "COMPLETED"] as OrderStatus[]) {
      expect(await updateOrder(b.org.id, order.id, await formInput(order.id, { status }), b.owner.user.id).catch((e) => e)).toBeInstanceOf(OrderLockedError);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).not.toBe("SENT_TO_KITCHEN");
  });

  it("an order is deletable before the kitchen and when it was Cancelled, not once it is with the kitchen", async () => {
    const b = await newBusiness();
    const cooking = await handOff(b, "IN_PREPARATION");
    expect(await deleteOrder(b.org.id, cooking.order.id, b.owner.user.id).catch((e) => e)).toBeInstanceOf(OrderLockedError);
    expect(await prisma.order.count({ where: { id: cooking.order.id } })).toBe(1);
    const cancelled = await handOff(b, "CANCELLED", "CANCELLED");
    await deleteOrder(b.org.id, cancelled.order.id, b.owner.user.id);
    expect(await prisma.order.count({ where: { id: cancelled.order.id } })).toBe(0);
  });

  it("the kitchen's own progress, payments and reading still work under the lock", async () => {
    const b = await newBusiness();
    const { order, selection } = await handOff(b, "PENDING");
    await setKitchenProductionStatus(b.org.id, selection.id, "IN_PREPARATION", b.owner.user.id);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).kitchenProductionStatus).toBe("IN_PREPARATION");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).customerId).toBe(order.customerId);
  });
});

describe("manual move-back: where it stops", () => {
  it("isMoveBack: leaving Final/Locked, leaving Cancelled and an earlier stage are moves back; closing and holding are not", () => {
    const at = (menu: "FINAL_LOCKED" | "APPROVED", stage: KitchenProductionStatus) => ({ menu: (menu === "APPROVED" ? "CUSTOMER_APPROVED" : menu) as never, stage });
    expect(isMoveBack(at("FINAL_LOCKED", "PENDING"), at("APPROVED", "PENDING"))).toBe(true);
    expect(isMoveBack(at("FINAL_LOCKED", "READY"), at("FINAL_LOCKED", "PENDING"))).toBe(true);
    expect(isMoveBack(at("FINAL_LOCKED", "CANCELLED"), at("FINAL_LOCKED", "PENDING"))).toBe(true);
    expect(isMoveBack(at("FINAL_LOCKED", "READY"), at("FINAL_LOCKED", "CANCELLED"))).toBe(false);
    expect(isMoveBack(at("FINAL_LOCKED", "PENDING"), at("FINAL_LOCKED", "DELIVERED"))).toBe(false);
    expect(isMoveBack(at("FINAL_LOCKED", "READY"), at("FINAL_LOCKED", "READY"))).toBe(false);
    expect(isMoveBack(at("APPROVED", "PENDING"), at("APPROVED", "PENDING"))).toBe(false);
  });

  it("is allowed while the kitchen is at Pending and nothing has been recorded (a mistaken send)", async () => {
    const b = await newBusiness();
    const { order, selection } = await handOff(b, "PENDING");
    await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "APPROVED" }, reason: "Sent by mistake", actorUserId: b.owner.user.id });
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("CUSTOMER_APPROVED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("APPROVED");
  });

  it.each(["IN_PREPARATION", "READY", "DELIVERED"] as KitchenProductionStatus[])("is refused at stage %s, by the order's status or the menu's", async (stage) => {
    const b = await newBusiness();
    const { order, selection } = await handOff(b, stage, stage === "DELIVERED" ? "SENT_TO_KITCHEN" : "SENT_TO_KITCHEN");
    const asOrder = await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "APPROVED" }, reason: "Trying to reopen", actorUserId: b.owner.user.id }).catch((e) => e);
    expect(asOrder).toBeInstanceOf(ManualStatusChangeError);
    expect(asOrder.message).toBe(KITCHEN_STARTED_MESSAGE);
    const asMenu = await changeStatusManually(b.org.id, { menuSelectionId: selection.id, target: { kind: "MENU", status: "DRAFT" }, reason: "Trying to reopen", actorUserId: b.owner.user.id }).catch((e) => e);
    expect(asMenu).toBeInstanceOf(ManualStatusChangeError);
    const after = await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } });
    expect([after.status, after.kitchenProductionStatus]).toEqual(["FINAL_LOCKED", stage]);
  });

  it("is refused after the kitchen has been In Preparation even if the stage was set back to Pending (the audit trail remembers)", async () => {
    const b = await newBusiness();
    const { order, selection } = await handOff(b, "PENDING");
    await setKitchenProductionStatus(b.org.id, selection.id, "IN_PREPARATION", b.owner.user.id);
    await setKitchenProductionStatus(b.org.id, selection.id, "PENDING", b.owner.user.id);
    const refused = await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "APPROVED" }, reason: "Reopen", actorUserId: b.owner.user.id }).catch((e) => e);
    expect(refused).toBeInstanceOf(ManualStatusChangeError);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("FINAL_LOCKED");
  });

  it("is refused once stock has been sent to the order, at Pending", async () => {
    const b = await newBusiness();
    const { order } = await handOff(b, "PENDING");
    await prisma.order.update({ where: { id: order.id }, data: { stockDeductedAt: new Date() } });
    expect(await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "APPROVED" }, reason: "Reopen", actorUserId: b.owner.user.id }).catch((e) => e)).toBeInstanceOf(ManualStatusChangeError);
  });

  it("cannot lower the kitchen stage through the order status (Sent to Kitchen at Ready)", async () => {
    const b = await newBusiness();
    const { order, selection } = await handOff(b, "READY");
    expect(await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "SENT_TO_KITCHEN" }, reason: "Back to start", actorUserId: b.owner.user.id }).catch((e) => e)).toBeInstanceOf(ManualStatusChangeError);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).kitchenProductionStatus).toBe("READY");
  });

  it("can always close the order: Cancelled is not a way back, even after cooking started", async () => {
    const b = await newBusiness();
    const { order, selection } = await handOff(b, "IN_PREPARATION");
    await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "CANCELLED" }, reason: "Customer cancelled", actorUserId: b.owner.user.id });
    const after = await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } });
    expect([after.status, after.kitchenProductionStatus]).toEqual(["FINAL_LOCKED", "CANCELLED"]);
    // ...and it cannot be reopened afterwards, because the kitchen had started.
    expect(await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "APPROVED" }, reason: "Reopen", actorUserId: b.owner.user.id }).catch((e) => e)).toBeInstanceOf(ManualStatusChangeError);
  });

  it("a cancelled order that never started can be reopened (nothing was cooked)", async () => {
    const b = await newBusiness();
    const { order } = await handOff(b, "CANCELLED", "CANCELLED");
    await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "APPROVED" }, reason: "Customer changed their mind", actorUserId: b.owner.user.id });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("APPROVED");
  });

  it("an order with no menu approval and stock sent cannot be moved back from Sent to Kitchen", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await prisma.menuSelection.delete({ where: { id: selection.id } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "SENT_TO_KITCHEN", stockDeductedAt: new Date() } });
    expect(await changeStatusManually(b.org.id, { orderId: order.id, target: { kind: "ORDER", status: "PENDING_REVIEW" }, reason: "Reopen", actorUserId: b.owner.user.id }).catch((e) => e)).toBeInstanceOf(ManualStatusChangeError);
  });
});

describe("notes on a closed order", () => {
  it("a Completed order takes no new note from the team or the customer, and keeps the notes it has", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await addNoteToOpenOrder(b.org.id, selection.id, { authorType: "TEAM", body: "Existing note" });
    await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    expect(await addNoteToOpenOrder(b.org.id, selection.id, { authorType: "TEAM", body: "Late team note" }).catch((e) => e)).toBeInstanceOf(OrderCompletedError);
    expect(await addNoteToOpenOrder(b.org.id, selection.id, { authorType: "CUSTOMER", body: "Late customer note" }, { alsoClosed: ["CANCELLED"] }).catch((e) => e)).toBeInstanceOf(OrderCompletedError);
    expect((await prisma.menuApprovalNote.findMany({ where: { menuSelectionId: selection.id } })).map((n) => n.body)).toEqual(["Existing note"]);
  });

  it("current behaviour for Cancelled: the customer's link is closed, the team can still add a note", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    expect(await addNoteToOpenOrder(b.org.id, selection.id, { authorType: "CUSTOMER", body: "Late customer note" }, { alsoClosed: ["CANCELLED"] }).catch((e) => e)).toBeInstanceOf(OrderClosedError);
    expect(await addNoteToOpenOrder(b.org.id, selection.id, { authorType: "TEAM", body: "Why it was cancelled" })).toBeTruthy();
  });

  it("the customer link refuses a question on an approved menu once the order is Completed or Cancelled", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    const sent = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    const token = sent.url.split("/").pop()!;
    await approveViaLink(token);
    expect((await askAboutApprovedMenuViaLink(token, "Can we add a dessert?")).ok).toBe(true);
    for (const status of ["COMPLETED", "CANCELLED"] as OrderStatus[]) {
      await prisma.order.update({ where: { id: order.id }, data: { status } });
      expect((await askAboutApprovedMenuViaLink(token, `After ${status}`)).ok, status).toBe(false);
    }
    expect((await prisma.menuApprovalNote.findMany({ where: { menuSelectionId: selection.id, authorType: "CUSTOMER" } })).filter((n) => n.body.startsWith("After"))).toHaveLength(0);
  });
});

describe("the customer's link cannot change an order the kitchen has", () => {
  it("refuses the venue form and its confirmation after the hand-off, and leaves the venue as it was", async () => {
    const b = await newBusiness();
    const { order, selection } = await b.makeOrder();
    const sent = await sendMenuForApproval(b.org.id, { menuSelectionId: selection.id }, b.owner.user.id);
    const token = sent.url.split("/").pop()!;
    await approveViaLink(token); // approved, the venue form is next
    await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: "FINAL_LOCKED", kitchenProductionStatus: "PENDING", lockedAt: new Date() } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "SENT_TO_KITCHEN" } });
    const form = { venueType: "HOME", venueBuildingName: "Hall", completeVenueAddress: "1 Road", venueContactName: "Raj", venueContactPhone: "+919812345678" } as never;
    expect((await saveVenueViaLink(token, form)).ok).toBe(false);
    expect((await confirmApprovalViaLink(token)).ok).toBe(false);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([after.venue, after.eventAddress, after.venueDetailsSubmittedAt]).toEqual([null, null, null]);
  });
});
