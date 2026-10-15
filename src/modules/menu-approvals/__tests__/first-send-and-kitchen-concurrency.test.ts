import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder, syncOrderEvent } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { sendMenuForApproval, approveViaLink, ensureOrderMenuSelection } from "@/modules/menu-approvals/approval-link";
import { approveAndSendToKitchen, setKitchenProductionStatus, InvalidMenuSelectionTransitionError } from "@/modules/menu-approvals/menu-approval";
import { deriveOrderStatus } from "@/modules/orders/order-status";

/**
 * Real simultaneous requests against the real database (Promise.allSettled, separate connections), for the two paths that were not
 * covered by the first Phase 0 round: the first send of a menu for an order that has no Event or MenuSelection yet, and kitchen
 * stage changes. What this proves: the order-level and menu-level locks serialise the requests, so one Event, one MenuSelection and
 * one history row per real change result. What it does not prove: every interleaving (the timing is sampled, not exhaustive).
 */

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.statusChange.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuVersionItem.deleteMany({ where: { menuVersion: { menuSelection: { organizationId: { in: orgIds } } } } });
  await prisma.menuVersion.deleteMany({ where: { menuSelection: { organizationId: { in: orgIds } } } });
  await prisma.menuSelectionItem.deleteMany({ where: { menuSelection: { organizationId: { in: orgIds } } } });
  await prisma.menuApprovalNote.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuSelection.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

/** An admin-created Order with an Event Type but no Event and no MenuSelection: exactly the state a first send starts from. */
async function bareOrder(withEventType = true) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "First Send Org", slug: `fs-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Team", email: `team-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: actor.id, role: "owner", createdAt: new Date() } });
  const customer = await createCustomer(org.id, { name: "Anoop", phone: "9876543210", email: "anoop@example.test" }, actor.id);
  const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventTypeId: withEventType ? eventType.id : null,
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-05"),
      totalParticipants: 120,
      adultCount: 1,
      individualPricingEnabled: true,
      mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 5000 }],
    },
    actor.id,
  );
  return { org, actor, customer, eventType, order };
}

const settle = (calls: Promise<unknown>[]) => Promise.allSettled(calls);
const fulfilled = (results: PromiseSettledResult<unknown>[]) => results.filter((r) => r.status === "fulfilled");
const rejected = (results: PromiseSettledResult<unknown>[]) => results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
const counts = async (orgId: string, orderId: string) => ({
  events: await prisma.event.count({ where: { organizationId: orgId } }),
  linkedEvents: await prisma.event.count({ where: { organizationId: orgId, orderId } }),
  selections: await prisma.menuSelection.count({ where: { organizationId: orgId } }),
  versions: await prisma.menuVersion.count({ where: { menuSelection: { organizationId: orgId } } }),
});
const audits = (orgId: string, action: string) => prisma.auditLog.count({ where: { organizationId: orgId, action } });

describe("the first send of a menu for an order with no Event or MenuSelection", () => {
  it("six simultaneous first sends: one Event, one MenuSelection, one version; the rest refused clearly", async () => {
    const w = await bareOrder();
    expect(await counts(w.org.id, w.order.id)).toMatchObject({ events: 0, selections: 0 });

    const results = await settle(Array.from({ length: 6 }, () => sendMenuForApproval(w.org.id, { orderId: w.order.id }, w.actor.id, "please approve")));
    expect(fulfilled(results)).toHaveLength(1);
    for (const r of rejected(results)) {
      expect(r.reason).toBeInstanceOf(InvalidMenuSelectionTransitionError);
      expect(String(r.reason.message)).toMatch(/already with the customer/);
    }

    expect(await counts(w.org.id, w.order.id)).toEqual({ events: 1, linkedEvents: 1, selections: 1, versions: 1 }); // no orphan Event, no second selection
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: w.org.id } });
    expect([selection.status, selection.currentVersion]).toEqual(["SENT_TO_CUSTOMER", 1]);
    expect(await prisma.secureAccessToken.count({ where: { organizationId: w.org.id, resourceType: "MENU_APPROVAL", revokedAt: null } })).toBe(1);
    expect(await prisma.statusChange.count({ where: { organizationId: w.org.id, orderId: w.order.id, subject: "MENU_APPROVAL", toStatus: "SENT_TO_CUSTOMER" } })).toBe(1);
    expect(await audits(w.org.id, "event.create")).toBe(1);
    expect(await audits(w.org.id, "order.event_created")).toBe(1);
    expect(await audits(w.org.id, "menu_selection.create")).toBe(1);
  });

  it("simultaneous ensures (the save of an order, three at once) all get the same MenuSelection", async () => {
    const w = await bareOrder();
    const results = await settle(Array.from({ length: 6 }, () => ensureOrderMenuSelection(w.org.id, w.order.id, w.actor.id)));
    expect(fulfilled(results)).toHaveLength(6); // an ensure is idempotent: the later ones just find it
    const ids = new Set(results.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    expect(ids.size).toBe(1);
    expect(await counts(w.org.id, w.order.id)).toMatchObject({ events: 1, linkedEvents: 1, selections: 1 });
  });

  it("saving the order (event sync) and the first send at the same moment still make one Event", async () => {
    const w = await bareOrder();
    const results = await settle([
      syncOrderEvent(w.org.id, w.order.id, w.actor.id),
      syncOrderEvent(w.org.id, w.order.id, w.actor.id),
      sendMenuForApproval(w.org.id, { orderId: w.order.id }, w.actor.id),
      ensureOrderMenuSelection(w.org.id, w.order.id, w.actor.id),
    ]);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect(await counts(w.org.id, w.order.id)).toMatchObject({ events: 1, linkedEvents: 1, selections: 1, versions: 1 });
  });

  it("an Event that already exists without a MenuSelection is used, not duplicated", async () => {
    const w = await bareOrder();
    await syncOrderEvent(w.org.id, w.order.id, w.actor.id);
    const results = await settle(Array.from({ length: 4 }, () => ensureOrderMenuSelection(w.org.id, w.order.id, w.actor.id)));
    expect(fulfilled(results)).toHaveLength(4);
    expect(await counts(w.org.id, w.order.id)).toMatchObject({ events: 1, selections: 1 });
  });

  it("an order with no Event Type: every simultaneous first send is refused with the same message and nothing is left behind", async () => {
    const w = await bareOrder(false);
    const results = await settle(Array.from({ length: 4 }, () => sendMenuForApproval(w.org.id, { orderId: w.order.id }, w.actor.id)));
    expect(fulfilled(results)).toHaveLength(0);
    for (const r of rejected(results)) expect(String(r.reason.message)).toMatch(/Event Type/);
    expect(await counts(w.org.id, w.order.id)).toEqual({ events: 0, linkedEvents: 0, selections: 0, versions: 0 });
    expect(await audits(w.org.id, "event.create")).toBe(0);
  });

  it("later sends, resends and customer links behave as before on an order whose first send raced", async () => {
    const w = await bareOrder();
    const results = await settle([sendMenuForApproval(w.org.id, { orderId: w.order.id }, w.actor.id), sendMenuForApproval(w.org.id, { orderId: w.order.id }, w.actor.id)]);
    expect(fulfilled(results)).toHaveLength(1); // either request may be the one that wins
    const first = (fulfilled(results)[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof sendMenuForApproval>>>).value;
    expect(first.versionNumber).toBe(1);
    const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: w.org.id } });
    expect(await approveViaLink(first.url.split("/menu-approval/")[1])).toEqual({ ok: true });
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: selection.id } })).status).toBe("CUSTOMER_APPROVED");
  });
});

/** An order that has been handed to the kitchen (Pending stage), ready for kitchen stage changes. */
async function handedOff() {
  const w = await bareOrder();
  const sent = await sendMenuForApproval(w.org.id, { orderId: w.order.id }, w.actor.id);
  expect(await approveViaLink(sent.url.split("/menu-approval/")[1])).toEqual({ ok: true });
  const selection = await prisma.menuSelection.findFirstOrThrow({ where: { organizationId: w.org.id } });
  await approveAndSendToKitchen(w.org.id, selection.id, w.actor.id);
  return { ...w, selection };
}

const orderHistory = (orgId: string, orderId: string) => prisma.statusChange.findMany({ where: { organizationId: orgId, orderId, subject: "ORDER" }, orderBy: { createdAt: "asc" } });

describe("kitchen stage changes", () => {
  it("four simultaneous 'Delivered': one change, one Order history row (Completed), one audit entry", async () => {
    const w = await handedOff();
    const results = await settle(Array.from({ length: 4 }, () => setKitchenProductionStatus(w.org.id, w.selection.id, "DELIVERED", w.actor.id)));
    expect(fulfilled(results)).toHaveLength(4); // the repeats find the stage already set and change nothing
    expect((await prisma.order.findUniqueOrThrow({ where: { id: w.order.id } })).status).toBe("COMPLETED");
    const completed = (await orderHistory(w.org.id, w.order.id)).filter((c) => c.toStatus === "COMPLETED");
    expect(completed).toHaveLength(1);
    expect(await audits(w.org.id, "menu_selection.kitchen_production_status_change")).toBe(1);
    const synced = await prisma.auditLog.findMany({ where: { organizationId: w.org.id, action: "order.status_synced" } });
    expect(synced.filter((a) => (a.after as { status: string }).status === "COMPLETED")).toHaveLength(1); // the Order was completed once
  });

  it("different stages at once: any order of arrival ends consistent, with an unbroken, duplicate-free status history", async () => {
    for (let run = 0; run < 4; run++) {
      const w = await handedOff();
      const stages = ["IN_PREPARATION", "READY", "DELIVERED", "CANCELLED", "PENDING"] as const;
      const results = await settle(stages.map((stage) => setKitchenProductionStatus(w.org.id, w.selection.id, stage, w.actor.id)));
      expect(fulfilled(results).length).toBeGreaterThanOrEqual(4);

      const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.selection.id } });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: w.order.id } });
      expect(order.status).toBe(deriveOrderStatus([{ status: selection.status, kitchenProductionStatus: selection.kitchenProductionStatus }]));

      // every stage change is recorded once, and the Order's history is a chain: each row starts where the last one ended
      const rows = (await orderHistory(w.org.id, w.order.id)).filter((c) => c.trigger?.startsWith("Kitchen stage"));
      let at = "SENT_TO_KITCHEN";
      for (const row of rows) {
        expect(row.fromStatus).toBe(at);
        expect(row.toStatus).not.toBe(row.fromStatus);
        at = row.toStatus;
      }
      expect(at).toBe(order.status);
      const stageAudits = await prisma.auditLog.findMany({ where: { organizationId: w.org.id, action: "menu_selection.kitchen_production_status_change" }, orderBy: { createdAt: "asc" } });
      let stage = "PENDING";
      for (const a of stageAudits) {
        expect((a.before as { kitchenProductionStatus: string }).kitchenProductionStatus).toBe(stage);
        stage = (a.after as { kitchenProductionStatus: string }).kitchenProductionStatus;
      }
      expect(stage).toBe(selection.kitchenProductionStatus);
    }
  });

  it("a sequential change, and a change to a menu that is not locked yet, behave as before", async () => {
    const w = await handedOff();
    await setKitchenProductionStatus(w.org.id, w.selection.id, "IN_PREPARATION", w.actor.id);
    await setKitchenProductionStatus(w.org.id, w.selection.id, "READY", w.actor.id);
    await setKitchenProductionStatus(w.org.id, w.selection.id, "DELIVERED", w.actor.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: w.order.id } })).status).toBe("COMPLETED");
    const other = await bareOrder();
    const sel = await ensureOrderMenuSelection(other.org.id, other.order.id, other.actor.id);
    await expect(setKitchenProductionStatus(other.org.id, sel!.id, "READY", other.actor.id)).rejects.toBeInstanceOf(InvalidMenuSelectionTransitionError);
  });
});
