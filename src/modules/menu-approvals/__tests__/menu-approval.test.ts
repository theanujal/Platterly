import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  submitEventDetails,
  createMenuSelection,
  sendToCustomer,
  recallMenu,
  customerRequestsChanges,
  customerResumesReviewing,
  customerApproves,
  kitchenRequestsChanges,
  kitchenApproves,
  lockMenuSelection,
  setMenuSelectionItems,
  getMenuSelection,
  listMenuSelectionsForKitchen,
  listKitchenProductionQueue,
  listKitchenProductionBoard,
  setKitchenProductionStatus,
  syncOrderStatus,
  InvalidMenuSelectionTransitionError,
  type EventDetailsIntakeInput,
} from "@/modules/menu-approvals/menu-approval";
import { sendMenuForApproval } from "@/modules/menu-approvals/approval-link";
import { createEventType } from "@/modules/events/event-type";
import { createMenuItem } from "@/modules/menus/item";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuVersionItem.deleteMany({ where: { menuVersion: { menuSelection: { organizationId: { in: cleanupOrgIds } } } } });
  await prisma.menuVersion.deleteMany({ where: { menuSelection: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuSelectionItem.deleteMany({ where: { menuSelection: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.menuSelection.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Menu Selection Test Org", slug: `menusel-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Kitchen Admin", email: `kitchen-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

function intakeInput(orgEventTypeId: string, overrides?: Partial<EventDetailsIntakeInput>): EventDetailsIntakeInput {
  return {
    name: "Asha Rao",
    email: "asha@example.test",
    phone: "9876543210",
    eventTypeId: orgEventTypeId,
    eventDate: new Date("2026-12-01"),
    guestCount: 80,
    eventMealType: "DINNER",
    menuPreference: "VEGETARIAN",
    ...overrides,
  };
}

/** Team sends the menu -> customer approves -> kitchen team approves (which auto-locks it). Returns the selection id. */
async function lockThroughWorkflow(orgId: string, eventId: string, actorId: string) {
  const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId } });
  await sendMenuForApproval(orgId, { menuSelectionId: selection.id }, actorId);
  await customerApproves(orgId, selection.id);
  await kitchenApproves(orgId, selection.id, actorId);
  return selection;
}

async function orderStatusOf(orderId: string) {
  return (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;
}

describe("submitEventDetails (Chunk 11 Group 11.2)", () => {
  it("creates a new Customer, Order, Event, and a DRAFT (Needs Review) MenuSelection — nothing is sent to the customer yet", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);

    const result = await submitEventDetails(org.id, intakeInput(eventType.id));

    // Phone is normalized to E.164 at write time (AJ, 2026-09-19) — see lib/phone.ts.
    expect(result.customer.phone).toBe("+919876543210");
    expect(result.order.customerId).toBe(result.customer.id);
    expect(result.event.orderId).toBe(result.order.id);
    expect(result.menuSelection.eventId).toBe(result.event.id);
    expect(result.menuSelection.status).toBe("DRAFT");
    expect(result.order.status).toBe("PENDING_REVIEW");
  });

  it("a repeat customer (same phone) gets a brand-new Order/Event, never mapped to their existing one", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Birthday" }, actor.id);

    const first = await submitEventDetails(org.id, intakeInput(eventType.id));
    const second = await submitEventDetails(org.id, intakeInput(eventType.id, { eventDate: new Date("2026-12-15") }));

    expect(second.customer.id).toBe(first.customer.id); // same Customer record
    expect(second.order.id).not.toBe(first.order.id); // but a distinct new Order
    expect(second.event.id).not.toBe(first.event.id); // and a distinct new Event

    const orderCount = await prisma.order.count({ where: { customerId: first.customer.id } });
    expect(orderCount).toBe(2);
  });

  it("captures the venue/delivery detail fields onto the Order", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Corporate" }, actor.id);

    const result = await submitEventDetails(
      org.id,
      intakeInput(eventType.id, {
        venueType: "CLUBHOUSE",
        venueHallName: "Grand Hall",
        vehicleAccess: "VEHICLE_AND_PARKING",
        liveCounterAvailable: true,
      }),
    );

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.order.id } });
    expect(order.venueType).toBe("CLUBHOUSE");
    expect(order.venueHallName).toBe("Grand Hall");
    expect(order.vehicleAccess).toBe("VEHICLE_AND_PARKING");
    expect(order.liveCounterAvailable).toBe(true);
  });
});

describe("MenuSelection state machine (team -> customer -> kitchen, AJ 2026-09-26)", () => {
  it("walks the full happy path, and the kitchen team's approval locks the menu automatically", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });
    expect(selection.status).toBe("DRAFT");

    const sent = await sendToCustomer(org.id, selection.id, actor.id);
    expect(sent.status).toBe("SENT_TO_CUSTOMER");

    const approved = await customerApproves(org.id, selection.id);
    expect(approved.status).toBe("KITCHEN_REVIEWING"); // customer approval hands straight to the kitchen team's review
    expect(approved.submittedAt).not.toBeNull();

    // No separate "lock" step: kitchen approval IS the hand-off to the Kitchen Dashboard.
    const done = await kitchenApproves(org.id, selection.id, actor.id);
    expect(done.status).toBe("FINAL_LOCKED");
    expect(done.lockedAt).not.toBeNull();
    expect(done.kitchenProductionStatus).toBe("PENDING");
    expect(await orderStatusOf(order.id)).toBe("SENT_TO_KITCHEN");
  });

  it("supports the customer changes-requested loop: request changes, team re-sends, customer approves", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });
    await sendToCustomer(org.id, selection.id, actor.id);

    const viewed = await customerResumesReviewing(org.id, selection.id);
    expect(viewed.status).toBe("CUSTOMER_REVIEWING");

    const changesRequested = await customerRequestsChanges(org.id, selection.id, "Need more starters");
    expect(changesRequested.status).toBe("CHANGES_REQUESTED");
    expect(changesRequested.customerRequestNote).toBe("Need more starters");

    // The customer can't approve their own change request — the team must send an updated menu first.
    await expect(customerApproves(org.id, selection.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await sendToCustomer(org.id, selection.id, actor.id);
    const approved = await customerApproves(org.id, selection.id);
    expect(approved.status).toBe("KITCHEN_REVIEWING");
  });

  it("sends kitchen-requested changes back through the customer instead of resuming the kitchen review", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });
    await sendToCustomer(org.id, selection.id, actor.id);
    await customerApproves(org.id, selection.id);

    const kitchenChanges = await kitchenRequestsChanges(org.id, selection.id, actor.id, "Out of stock item");
    expect(kitchenChanges.status).toBe("KITCHEN_CHANGES_REQUESTED");
    expect(kitchenChanges.kitchenRequestNote).toBe("Out of stock item");

    // The customer never approved a menu that later changed: it goes back to them.
    const resent = await sendToCustomer(org.id, selection.id, actor.id);
    expect(resent.status).toBe("SENT_TO_CUSTOMER");
  });

  it("lets the team recall a sent menu to edit it, and only then", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    await expect(recallMenu(org.id, selection.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError); // nothing sent yet
    await sendToCustomer(org.id, selection.id, actor.id);
    expect(await orderStatusOf(order.id)).toBe("AWAITING_CUSTOMER_APPROVAL");

    const recalled = await recallMenu(org.id, selection.id, actor.id);
    expect(recalled.status).toBe("DRAFT");
    expect(await orderStatusOf(order.id)).toBe("PENDING_REVIEW");

    await sendToCustomer(org.id, selection.id, actor.id);
    await customerApproves(org.id, selection.id);
    await expect(recallMenu(org.id, selection.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError); // too late once the customer approved
  });

  it("rejects every invalid transition exhaustively", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const event1 = await prisma.event.create({
      data: {
        organizationId: org.id,
        customerId: (await prisma.customer.create({ data: { organizationId: org.id, name: "X", phone: "1" } })).id,
        eventTypeId: eventType.id,
        name: "Test Event",
        startDate: new Date(),
        endDate: new Date(),
      },
    });
    const draft = await createMenuSelection(org.id, event1.id);

    // DRAFT cannot skip straight to any customer/kitchen state.
    await expect(customerApproves(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(customerRequestsChanges(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(kitchenApproves(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(lockMenuSelection(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await sendToCustomer(org.id, draft.id, actor.id);

    // Can't jump straight to the kitchen's states from the customer's.
    await expect(kitchenApproves(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(lockMenuSelection(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    // ...and can't be sent twice.
    await expect(sendToCustomer(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await customerApproves(org.id, draft.id); // -> KITCHEN_REVIEWING

    // Once handed to the kitchen, the customer-side actions are no longer valid.
    await expect(customerRequestsChanges(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(customerApproves(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(sendToCustomer(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    const locked = await kitchenApproves(org.id, draft.id, actor.id);

    // FINAL_LOCKED is terminal — nothing transitions out of it.
    await expect(kitchenApproves(org.id, locked.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(kitchenRequestsChanges(org.id, locked.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(lockMenuSelection(org.id, locked.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
  });
});

describe("Order status follows the workflow (syncOrderStatus)", () => {
  it("moves the Order through every status from placed to Completed", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    expect(await orderStatusOf(order.id)).toBe("PENDING_REVIEW");
    await sendToCustomer(org.id, selection.id, actor.id);
    expect(await orderStatusOf(order.id)).toBe("AWAITING_CUSTOMER_APPROVAL");
    await customerRequestsChanges(org.id, selection.id, "Swap the starter");
    expect(await orderStatusOf(order.id)).toBe("PENDING_REVIEW"); // team has to act again
    await sendToCustomer(org.id, selection.id, actor.id);
    await customerApproves(org.id, selection.id);
    expect(await orderStatusOf(order.id)).toBe("KITCHEN_REVIEW");
    await kitchenApproves(org.id, selection.id, actor.id);
    expect(await orderStatusOf(order.id)).toBe("SENT_TO_KITCHEN");

    await setKitchenProductionStatus(org.id, selection.id, "IN_PREPARATION", actor.id);
    await setKitchenProductionStatus(org.id, selection.id, "READY", actor.id);
    expect(await orderStatusOf(order.id)).toBe("SENT_TO_KITCHEN"); // still the kitchen's until it leaves
    await setKitchenProductionStatus(org.id, selection.id, "DELIVERED", actor.id);
    expect(await orderStatusOf(order.id)).toBe("COMPLETED");
  });

  it("records the transient Approved status in the audit trail on the way to Sent to Kitchen", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    await lockThroughWorkflow(org.id, event.id, actor.id);

    const logs = await prisma.auditLog.findMany({ where: { organizationId: org.id, action: "order.status_synced", recordId: order.id } });
    const reached = logs.map((l) => (l.after as { status?: string } | null)?.status);
    expect(reached).toEqual(expect.arrayContaining(["AWAITING_CUSTOMER_APPROVAL", "KITCHEN_REVIEW", "APPROVED", "SENT_TO_KITCHEN"]));
  });

  it("cancels the Order when the kitchen cancels, and a hand-set status is overwritten by the next transition", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } }); // manual override on the order form
    await sendToCustomer(org.id, selection.id, actor.id);
    expect(await orderStatusOf(order.id)).toBe("AWAITING_CUSTOMER_APPROVAL");

    await customerApproves(org.id, selection.id);
    await kitchenApproves(org.id, selection.id, actor.id);
    await setKitchenProductionStatus(org.id, selection.id, "CANCELLED", actor.id);
    expect(await orderStatusOf(order.id)).toBe("CANCELLED");
  });

  it("leaves an Order with no menu selection alone", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    await prisma.order.update({ where: { id: order.id }, data: { status: "APPROVED" } });
    await syncOrderStatus(org.id, crypto.randomUUID());
    expect(await orderStatusOf(order.id)).toBe("APPROVED");
  });
});

describe("MenuSelection item versioning (Chunk 11 Group 11.3, PRD §30)", () => {
  it("mutates items in place with no MenuVersion while still pre-approval", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    await setMenuSelectionItems(org.id, selection.id, [{ itemType: "MENU_ITEM", catalogId: menuItem.id }]);

    const versionCount = await prisma.menuVersion.count({ where: { menuSelectionId: selection.id } });
    expect(versionCount).toBe(0);

    const after = await getMenuSelection(org.id, selection.id);
    expect(after?.items).toHaveLength(1);
    expect(after?.currentVersion).toBe(1);
  });

  it("ignores any client-sent quantity — a selected item is always stored once (add/remove only)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    // A tampered payload still carries `quantity`, even though the type no longer allows it.
    const forged = [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 50 }] as unknown as Parameters<typeof setMenuSelectionItems>[2];
    await setMenuSelectionItems(org.id, selection.id, forged);

    const after = await getMenuSelection(org.id, selection.id);
    expect(after?.items.map((i) => i.quantity)).toEqual([1]);
  });

  it("refuses to edit items once the menu has been sent, so the customer approves exactly what the kitchen cooks", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const paneer = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const naan = await createMenuItem(org.id, { name: "Butter Naan", foodType: "VEGETARIAN", price: 40 }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    await setMenuSelectionItems(org.id, selection.id, [{ itemType: "MENU_ITEM", catalogId: paneer.id }]);
    await sendToCustomer(org.id, selection.id, actor.id);
    await expect(setMenuSelectionItems(org.id, selection.id, [{ itemType: "MENU_ITEM", catalogId: naan.id }], actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    // Recalling reopens it for editing.
    await recallMenu(org.id, selection.id, actor.id);
    await setMenuSelectionItems(org.id, selection.id, [{ itemType: "MENU_ITEM", catalogId: naan.id }], actor.id);
    const after = await getMenuSelection(org.id, selection.id);
    expect(after?.items.map((i) => i.name)).toEqual(["Butter Naan"]);

    await sendToCustomer(org.id, selection.id, actor.id);
    await customerApproves(org.id, selection.id);
    await expect(setMenuSelectionItems(org.id, selection.id, [{ itemType: "MENU_ITEM", catalogId: paneer.id }], actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
  });
});

describe("listMenuSelectionsForKitchen (Chunk 11 Group 11.5)", () => {
  it("filters by status for the Kitchen Dashboard", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event: eventA } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const { event: eventB } = await submitEventDetails(org.id, intakeInput(eventType.id, { phone: "9999999999", eventDate: new Date("2027-01-01") }));
    const selectionB = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: eventB.id } });
    await sendToCustomer(org.id, selectionB.id, actor.id);
    await customerApproves(org.id, selectionB.id);

    const kitchenReviewing = await listMenuSelectionsForKitchen(org.id, ["KITCHEN_REVIEWING"]);
    expect(kitchenReviewing).toHaveLength(1);
    expect(kitchenReviewing[0].eventId).toBe(eventB.id);

    const all = await listMenuSelectionsForKitchen(org.id);
    expect(all.map((s) => s.eventId).sort()).toEqual([eventA.id, eventB.id].sort());
  });
});

describe("Kitchen Dashboard production status (Chunk 11 Group 11.5, PRD §34)", () => {
  it("only surfaces FINAL_LOCKED menu selections, nearest event first", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);

    const { event: eventNear } = await submitEventDetails(org.id, intakeInput(eventType.id, { phone: "1000000001", eventDate: new Date("2026-12-05") }));
    const nearSelection = await lockThroughWorkflow(org.id, eventNear.id, actor.id);

    const { event: eventFar } = await submitEventDetails(org.id, intakeInput(eventType.id, { phone: "1000000002", eventDate: new Date("2027-01-20") }));
    const farSelection = await lockThroughWorkflow(org.id, eventFar.id, actor.id);

    // Still DRAFT (Needs Review) — not locked, so it should never appear.
    await submitEventDetails(org.id, intakeInput(eventType.id, { phone: "1000000003", eventDate: new Date("2026-12-01") }));

    const queue = await listKitchenProductionQueue(org.id);
    expect(queue.map((s) => s.eventId)).toEqual([nearSelection.eventId, farSelection.eventId]);
    expect(queue.every((s) => s.kitchenProductionStatus === "PENDING")).toBe(true);
  });

  it("setKitchenProductionStatus is a free-choice jump — any stage, any direction, incl. CANCELLED", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await lockThroughWorkflow(org.id, event.id, actor.id);

    const ready = await setKitchenProductionStatus(org.id, selection.id, "READY", actor.id);
    expect(ready.kitchenProductionStatus).toBe("READY");

    // Jumping backward is allowed — this is a free-choice dropdown, not a
    // forward-only advance (AJ's explicit ask, 2026-09-19).
    const backToPending = await setKitchenProductionStatus(org.id, selection.id, "PENDING", actor.id);
    expect(backToPending.kitchenProductionStatus).toBe("PENDING");

    const cancelled = await setKitchenProductionStatus(org.id, selection.id, "CANCELLED", actor.id);
    expect(cancelled.kitchenProductionStatus).toBe("CANCELLED");

    // Not `findFirst` + `orderBy: createdAt desc` — 3 real transitions land
    // within the same millisecond locally, so timestamp ties make "last
    // written" non-deterministic. Asserting a matching row exists at all is
    // just as strong a check and isn't a race (caught as a real flake, AJ's
    // full-suite run, 2026-09-19).
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: org.id, action: "menu_selection.kitchen_production_status_change", recordId: selection.id },
    });
    expect(logs).toHaveLength(3); // READY, PENDING, CANCELLED — each a real (non-no-op) transition
    expect(logs.some((l) => (l.after as { kitchenProductionStatus?: string } | null)?.kitchenProductionStatus === "CANCELLED")).toBe(true);
  });

  it("setKitchenProductionStatus is a no-op (no write, no audit log) when the same stage is picked again", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await lockThroughWorkflow(org.id, event.id, actor.id);

    const result = await setKitchenProductionStatus(org.id, selection.id, "PENDING", actor.id);
    expect(result.kitchenProductionStatus).toBe("PENDING");

    const log = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "menu_selection.kitchen_production_status_change", recordId: selection.id },
    });
    expect(log).toBeNull();
  });

  it("refuses to set a production status before the menu selection is FINAL_LOCKED", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    await expect(setKitchenProductionStatus(org.id, selection.id, "IN_PREPARATION", actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await sendToCustomer(org.id, selection.id, actor.id);
    await customerApproves(org.id, selection.id);
    await expect(setKitchenProductionStatus(org.id, selection.id, "IN_PREPARATION", actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
  });
});

describe("listKitchenProductionBoard (Chunk 11 Group 11.5 redesign, AJ 2026-09-19)", () => {
  it("only includes the 3 in-flight stages, within a today-through-+2-days window", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);

    async function lockedToday(phone: string, daysFromNow: number) {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + daysFromNow);
      const { event } = await submitEventDetails(org.id, intakeInput(eventType.id, { phone, eventDate }));
      return lockThroughWorkflow(org.id, event.id, actor.id);
    }

    const inWindow = await lockedToday("2000000001", 2);
    const tooFar = await lockedToday("2000000002", 5);
    const completedInWindow = await lockedToday("2000000003", 1);
    await setKitchenProductionStatus(org.id, completedInWindow.id, "DELIVERED", actor.id);

    const board = await listKitchenProductionBoard(org.id);
    const boardIds = board.map((s) => s.id);
    expect(boardIds).toContain(inWindow.id);
    expect(boardIds).not.toContain(tooFar.id); // outside the +2-day window
    expect(boardIds).not.toContain(completedInWindow.id); // DELIVERED never shows on the board, even in-window
  });
});
