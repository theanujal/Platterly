import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  submitEventDetails,
  createMenuSelection,
  sendToCustomer,
  recallMenu,
  customerRequestsChanges,
  customerApproves,
  approveAndSendToKitchen,
  setMenuSelectionItems,
  getMenuSelection,
  listMenuSelectionsForKitchen,
  listKitchenProductionQueue,
  listKitchenProductionBoard,
  setKitchenProductionStatus,
  syncOrderStatus,
  updateMenuApprovalMealPlan,
  listMenuApprovalNotes,
  addMenuApprovalNote,
  InvalidMenuSelectionTransitionError,
  type EventDetailsIntakeInput,
} from "@/modules/menu-approvals/menu-approval";
import { sendMenuForApproval } from "@/modules/menu-approvals/approval-link";
import { changeStatusManually, ManualStatusChangeError } from "@/modules/menu-approvals/manual-status";
import { listStatusChanges } from "@/modules/menu-approvals/status-history";
import { createEventType } from "@/modules/events/event-type";
import { createMenuItem } from "@/modules/menus/item";
import { createMenu } from "@/modules/menus/menu";

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

/** Team sends the menu -> customer approves -> team approves and sends it to the kitchen (which locks it). Returns the selection. */
async function lockThroughWorkflow(orgId: string, eventId: string, actorId: string) {
  const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId } });
  await sendMenuForApproval(orgId, { menuSelectionId: selection.id }, actorId);
  await customerApproves(orgId, selection.id);
  await approveAndSendToKitchen(orgId, selection.id, actorId);
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

describe("MenuSelection state machine (team -> customer -> kitchen, AJ 2026-09-30)", () => {
  it("walks the happy path: sent, customer approves, then the team sends it to the kitchen", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });
    expect(selection.status).toBe("DRAFT");

    const sent = await sendToCustomer(org.id, selection.id, actor.id);
    expect(sent.status).toBe("SENT_TO_CUSTOMER");

    // The customer's approval stops at Customer Approved: the office team sends it to the kitchen itself.
    const approved = await customerApproves(org.id, selection.id);
    expect(approved.status).toBe("CUSTOMER_APPROVED");
    expect(approved.submittedAt).not.toBeNull();
    expect(await orderStatusOf(order.id)).toBe("APPROVED");

    const done = await approveAndSendToKitchen(org.id, selection.id, actor.id);
    expect(done.status).toBe("FINAL_LOCKED");
    expect(done.lockedAt).not.toBeNull();
    expect(done.kitchenProductionStatus).toBe("PENDING");
    expect(await orderStatusOf(order.id)).toBe("SENT_TO_KITCHEN");
  });

  it("supports the changes-requested loop; a re-send is Customer Reviewing, and it can repeat", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

    // sendMenuForApproval is what the app calls: version 1 is Awaiting Customer Approval, later versions Customer Reviewing.
    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("SENT_TO_CUSTOMER");

    const changesRequested = await customerRequestsChanges(org.id, selection.id, "Need more starters");
    expect(changesRequested.status).toBe("CHANGES_REQUESTED");
    expect(changesRequested.customerRequestNote).toBe("Need more starters");

    // The customer can't approve their own change request — the team must send an updated menu first.
    await expect(customerApproves(org.id, selection.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("CUSTOMER_REVIEWING");

    await customerRequestsChanges(org.id, selection.id, "One more thing");
    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("CUSTOMER_REVIEWING");

    const approved = await customerApproves(org.id, selection.id);
    expect(approved.status).toBe("CUSTOMER_APPROVED");
  });

  it("lets the team recall a sent or approved menu to edit it, and only then", async () => {
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
    // Approved but not yet sent to the kitchen: the team can still take it back to change something.
    expect((await recallMenu(org.id, selection.id, actor.id)).status).toBe("DRAFT");

    await sendToCustomer(org.id, selection.id, actor.id);
    await customerApproves(org.id, selection.id);
    await approveAndSendToKitchen(org.id, selection.id, actor.id);
    await expect(recallMenu(org.id, selection.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError); // too late once it is with the kitchen
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

    // DRAFT cannot skip straight to any customer or kitchen state.
    await expect(customerApproves(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(customerRequestsChanges(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(approveAndSendToKitchen(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await sendToCustomer(org.id, draft.id, actor.id);

    // Can't reach the kitchen before the customer approves, and can't be sent twice.
    await expect(approveAndSendToKitchen(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(sendToCustomer(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    await customerApproves(org.id, draft.id); // -> CUSTOMER_APPROVED

    // Once approved, the customer-side actions are no longer valid.
    await expect(customerRequestsChanges(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(customerApproves(org.id, draft.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(sendToCustomer(org.id, draft.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);

    const locked = await approveAndSendToKitchen(org.id, draft.id, actor.id);

    // FINAL_LOCKED is terminal for the normal flow — nothing transitions out of it.
    await expect(approveAndSendToKitchen(org.id, locked.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
    await expect(recallMenu(org.id, locked.id, actor.id)).rejects.toThrow(InvalidMenuSelectionTransitionError);
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
    expect(await orderStatusOf(order.id)).toBe("APPROVED");
    await approveAndSendToKitchen(org.id, selection.id, actor.id);
    expect(await orderStatusOf(order.id)).toBe("SENT_TO_KITCHEN");

    await setKitchenProductionStatus(org.id, selection.id, "IN_PREPARATION", actor.id);
    await setKitchenProductionStatus(org.id, selection.id, "READY", actor.id);
    expect(await orderStatusOf(order.id)).toBe("SENT_TO_KITCHEN"); // still the kitchen's until it leaves
    await setKitchenProductionStatus(org.id, selection.id, "DELIVERED", actor.id);
    expect(await orderStatusOf(order.id)).toBe("COMPLETED");
  });

  it("writes every automatic change into the status history, for the menu approval and for the order", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    await lockThroughWorkflow(org.id, event.id, actor.id);

    const history = (await listStatusChanges(org.id, order.id)).reverse();
    expect(history.every((h) => h.source === "AUTOMATIC")).toBe(true);
    const orderSide = history.filter((h) => h.subject === "ORDER").map((h) => [h.fromStatus, h.toStatus]);
    expect(orderSide).toEqual([
      ["PENDING_REVIEW", "AWAITING_CUSTOMER_APPROVAL"],
      ["AWAITING_CUSTOMER_APPROVAL", "APPROVED"],
      ["APPROVED", "SENT_TO_KITCHEN"],
    ]);
    const menuSide = history.filter((h) => h.subject === "MENU_APPROVAL").map((h) => [h.fromStatus, h.toStatus, h.trigger]);
    expect(menuSide).toEqual([
      ["DRAFT", "SENT_TO_CUSTOMER", "Menu sent to customer"],
      ["SENT_TO_CUSTOMER", "CUSTOMER_APPROVED", "Customer approved the menu"],
      ["CUSTOMER_APPROVED", "FINAL_LOCKED", "Approved and sent to the kitchen"],
    ]);
    // The actor is kept for the team's own clicks.
    expect(history.find((h) => h.toStatus === "FINAL_LOCKED")?.actorName).toBe("Kitchen Admin");
  });

  it("cancels the Order when the kitchen cancels", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    await lockThroughWorkflow(org.id, event.id, actor.id);
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });

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

describe("Changing a status by hand (AJ, 2026-09-30)", () => {
  async function setup() {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const { event, order } = await submitEventDetails(org.id, intakeInput(eventType.id));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });
    return { org, actor, order, selection };
  }

  it("requires a reason, and changes nothing without one", async () => {
    const { org, actor, order, selection } = await setup();
    for (const reason of ["", "   ", "ok"]) {
      await expect(
        changeStatusManually(org.id, { orderId: order.id, target: { kind: "ORDER", status: "APPROVED" }, reason, actorUserId: actor.id }),
      ).rejects.toBeInstanceOf(ManualStatusChangeError);
    }
    expect(await orderStatusOf(order.id)).toBe("PENDING_REVIEW");
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("DRAFT");
    expect(await listStatusChanges(org.id, order.id)).toHaveLength(0);
  });

  it("an order-level change moves the menu approval with it, and is recorded with who, why and both statuses", async () => {
    const { org, actor, order, selection } = await setup();

    // Everything was agreed on a call: the team marks the order Approved by hand.
    await changeStatusManually(org.id, {
      orderId: order.id,
      target: { kind: "ORDER", status: "APPROVED" },
      reason: "Customer confirmed the menu over a call",
      actorUserId: actor.id,
    });

    expect(await orderStatusOf(order.id)).toBe("APPROVED");
    const after = await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } });
    expect(after.status).toBe("CUSTOMER_APPROVED");
    expect(after.submittedAt).not.toBeNull();

    const [entry] = await listStatusChanges(org.id, order.id);
    expect(entry).toMatchObject({
      subject: "ORDER",
      source: "MANUAL",
      fromStatus: "PENDING_REVIEW",
      toStatus: "APPROVED",
      reason: "Customer confirmed the menu over a call",
      actorName: "Kitchen Admin",
    });
    // One row for the whole action, and the reason also lands in the menu's Notes and the audit log.
    expect(await listStatusChanges(org.id, order.id)).toHaveLength(1);
    expect((await listMenuApprovalNotes(org.id, selection.id)).map((n) => [n.authorType, n.body])).toEqual([
      ["TEAM", "Status changed by hand from Needs Review to Customer Approved. Reason: Customer confirmed the menu over a call"],
    ]);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "menu_selection.status_changed_manually" } })).toBe(1);

    // The team can then carry on normally from there.
    expect((await approveAndSendToKitchen(org.id, selection.id, actor.id)).status).toBe("FINAL_LOCKED");
    expect(await orderStatusOf(order.id)).toBe("SENT_TO_KITCHEN");
  });

  it("a menu-level change moves the order too, and revokes the customer's link when it stops waiting on them", async () => {
    const { org, actor, order, selection } = await setup();
    const sent = await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
    const token = sent.url.split("/menu-approval/")[1];
    expect(await prisma.secureAccessToken.count({ where: { token, revokedAt: null } })).toBe(1);

    await changeStatusManually(org.id, {
      menuSelectionId: selection.id,
      target: { kind: "MENU", status: "CUSTOMER_APPROVED" },
      reason: "Approved by phone, link no longer needed",
      actorUserId: actor.id,
    });

    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("CUSTOMER_APPROVED");
    expect(await orderStatusOf(order.id)).toBe("APPROVED");
    expect(await prisma.secureAccessToken.count({ where: { token, revokedAt: null } })).toBe(0);
    const [entry] = await listStatusChanges(org.id, order.id, { subject: "MENU_APPROVAL" });
    expect(entry).toMatchObject({ subject: "MENU_APPROVAL", source: "MANUAL", fromStatus: "SENT_TO_CUSTOMER", toStatus: "CUSTOMER_APPROVED", trigger: "Order is now Approved" });
  });

  it("can move a locked order back for editing, and Completed / Cancelled set the kitchen stage", async () => {
    const { org, actor, order, selection } = await setup();
    await changeStatusManually(org.id, { orderId: order.id, target: { kind: "ORDER", status: "COMPLETED" }, reason: "Delivered, recorded late", actorUserId: actor.id });
    let now = await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } });
    expect([now.status, now.kitchenProductionStatus]).toEqual(["FINAL_LOCKED", "DELIVERED"]);
    expect(await orderStatusOf(order.id)).toBe("COMPLETED");

    await changeStatusManually(org.id, { orderId: order.id, target: { kind: "ORDER", status: "PENDING_REVIEW" }, reason: "Customer wants to change the menu", actorUserId: actor.id });
    now = await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } });
    expect([now.status, now.kitchenProductionStatus, now.lockedAt]).toEqual(["DRAFT", "PENDING", null]);
    expect(await orderStatusOf(order.id)).toBe("PENDING_REVIEW");
  });

  it("does nothing, and records nothing, when the status is already there", async () => {
    const { org, actor, order } = await setup();
    const result = await changeStatusManually(org.id, { orderId: order.id, target: { kind: "ORDER", status: "PENDING_REVIEW" }, reason: "No change needed", actorUserId: actor.id });
    expect(result.unchanged).toBe(true);
    expect(await listStatusChanges(org.id, order.id)).toHaveLength(0);
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

    const kitchenReviewing = await listMenuSelectionsForKitchen(org.id, ["CUSTOMER_APPROVED"]);
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

describe("Menu Approvals edits the order's own meal plan (AJ, 2026-09-30)", () => {
  async function setupPlan() {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const menu = await createMenu(org.id, { name: "Feast", menuType: "VEGETARIAN", pricePerPlate: 400 }, actor.id);
    const dal = await createMenuItem(org.id, { name: "Dal", foodType: "VEGETARIAN", price: 90 }, actor.id);
    const rabdi = await createMenuItem(org.id, { name: "Rabdi", foodType: "VEGETARIAN", price: 60 }, actor.id);
    const { order, event } = await submitEventDetails(org.id, intakeInput(eventType.id, { guestCount: 50 }));
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { eventId: event.id } });
    return { org, actor, menu, dal, rabdi, order, selection };
  }

  it("writes the meal plan onto the order, re-prices it by the menu rule, and mirrors the flat selection rows", async () => {
    const { org, actor, menu, dal, rabdi, order, selection } = await setupPlan();

    await updateMenuApprovalMealPlan(
      org.id,
      selection.id,
      [
        {
          date: new Date("2026-12-01"),
          mealType: "DINNER",
          menuId: menu.id,
          items: [
            { itemType: "MENU_ITEM", catalogId: dal.id, quantity: 1 },
            { itemType: "MENU_ITEM", catalogId: rabdi.id, quantity: 50, isExtra: true },
          ],
        },
      ],
      actor.id,
    );

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { mealPlanEntries: { include: { items: true } } } });
    expect(saved.mealPlanEntries).toHaveLength(1);
    expect(saved.mealPlanEntries[0].items).toHaveLength(2);
    // 400 x 50 guests; Dal is included, the Extra Rabdi is 60 x 50.
    expect(Number(saved.total)).toBe(400 * 50 + 60 * 50);

    const items = await prisma.menuSelectionItem.findMany({ where: { menuSelectionId: selection.id }, orderBy: { name: "asc" } });
    expect(items.map((i) => [i.name, i.isExtra])).toEqual([
      ["Dal", false],
      ["Rabdi", true],
    ]);
  });

  it("refuses an edit once the menu is with the customer", async () => {
    const { org, actor, menu, selection } = await setupPlan();
    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);

    await expect(
      updateMenuApprovalMealPlan(org.id, selection.id, [{ date: new Date("2026-12-01"), mealType: "DINNER", menuId: menu.id, items: [] }], actor.id),
    ).rejects.toBeInstanceOf(InvalidMenuSelectionTransitionError);
  });

  it("keeps every note, oldest first, tagged with who wrote it and the version", async () => {
    const { org, actor, selection } = await setupPlan();

    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id, "Sending v1, please check the starters");
    await customerRequestsChanges(org.id, selection.id, "Swap the paneer for something lighter");
    await sendMenuForApproval(org.id, { menuSelectionId: selection.id }, actor.id);
    await customerApproves(org.id, selection.id);
    await addMenuApprovalNote(org.id, selection.id, { authorType: "TEAM", authorName: "Kitchen Admin", body: "Add the dessert back at the kitchen's request", versionNumber: 2 });

    const notes = await listMenuApprovalNotes(org.id, selection.id);
    expect(notes.map((n) => [n.authorType, n.versionNumber, n.body])).toEqual([
      ["TEAM", 1, "Sending v1, please check the starters"],
      ["CUSTOMER", 1, "Swap the paneer for something lighter"],
      ["TEAM", 2, "Add the dessert back at the kitchen's request"],
    ]);
    expect(notes[2].authorName).toBe("Kitchen Admin");
  });
});
