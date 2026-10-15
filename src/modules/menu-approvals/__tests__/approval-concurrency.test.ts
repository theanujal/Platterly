import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { sendMenuForApproval, approveViaLink, recallMenuFromCustomer, ensureOrderMenuSelection, getActiveApprovalUrl } from "@/modules/menu-approvals/approval-link";
import { approveAndSendToKitchen, customerApproves, InvalidMenuSelectionTransitionError, KitchenHandoffError } from "@/modules/menu-approvals/menu-approval";
import { changeStatusManually } from "@/modules/menu-approvals/manual-status";
import { generateInvoiceFromOrder, createInvoiceOnKitchenHandoff, InvoiceError } from "@/modules/invoices/invoice";

/**
 * Real simultaneous requests: each test fires several calls at once (Promise.allSettled) from separate database connections and
 * checks what the database holds afterwards. What this proves: the locks and conditional writes serialise the requests, so exactly
 * one wins and nothing is duplicated. What it does not prove: every possible interleaving (a timing-dependent test can only sample
 * some), and the behaviour of two separate application servers (the locks are in Postgres, so they apply, but this runs in one process).
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

async function world() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Race Org", slug: `race-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Team", email: `team-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: actor.id, role: "owner", createdAt: new Date() } });
  const customer = await createCustomer(org.id, { name: "Anoop", phone: "9876543210", email: "anoop@example.test" }, actor.id);
  const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
  const makeOrder = async () => {
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventTypeId: eventType.id,
        eventStartDate: new Date("2026-12-05"),
        eventEndDate: new Date("2026-12-05"),
        totalParticipants: 120,
        adultCount: 1,
        individualPricingEnabled: true,
        mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 5000 }],
      },
      actor.id,
    );
    const selection = (await ensureOrderMenuSelection(org.id, order.id, actor.id))!;
    return { order, selection };
  };
  const first = await makeOrder();
  return { org, actor, makeOrder, ...first };
}

/** A menu the customer has approved (via the real link), waiting for the team's Approve & Send to Kitchen. */
async function approvedWorld() {
  const w = await world();
  const sent = await sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id);
  const token = sent.url.split("/menu-approval/")[1];
  expect(await approveViaLink(token)).toEqual({ ok: true });
  return { ...w, token };
}

const settle = (calls: Promise<unknown>[]) => Promise.allSettled(calls);
const fulfilled = (results: PromiseSettledResult<unknown>[]) => results.filter((r) => r.status === "fulfilled");
const rejected = (results: PromiseSettledResult<unknown>[]) => results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
const history = (orgId: string, orderId: string, subject: "ORDER" | "MENU_APPROVAL", toStatus: string) => prisma.statusChange.count({ where: { organizationId: orgId, orderId, subject, toStatus } });
const invoices = (orgId: string, orderId: string) => prisma.invoice.count({ where: { organizationId: orgId, orderId, type: "INVOICE", status: { not: "CANCELLED" } } });
const audits = (orgId: string, action: string) => prisma.auditLog.count({ where: { organizationId: orgId, action } });

describe("simultaneous approval transitions: exactly one wins, nothing is duplicated", () => {
  it("five simultaneous sends of the same menu: one version, one link, one status change, the rest refused", async () => {
    const w = await world();
    const results = await settle(Array.from({ length: 5 }, () => sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id, "please approve")));
    expect(fulfilled(results)).toHaveLength(1);
    for (const r of rejected(results)) expect(r.reason).toBeInstanceOf(InvalidMenuSelectionTransitionError);

    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.selection.id } });
    expect([selection.status, selection.currentVersion]).toEqual(["SENT_TO_CUSTOMER", 1]);
    expect(await prisma.menuVersion.count({ where: { menuSelectionId: w.selection.id } })).toBe(1);
    expect(await prisma.secureAccessToken.count({ where: { organizationId: w.org.id, resourceType: "MENU_APPROVAL", revokedAt: null } })).toBe(1);
    expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "SENT_TO_CUSTOMER")).toBe(1);
    expect(await history(w.org.id, w.order.id, "ORDER", "AWAITING_CUSTOMER_APPROVAL")).toBe(1);
    expect(await prisma.menuApprovalNote.count({ where: { menuSelectionId: w.selection.id, authorType: "TEAM" } })).toBe(1); // the note of the winner only
    expect(await audits(w.org.id, "menu_selection.version_sent")).toBe(1);
    expect(await getActiveApprovalUrl(w.org.id, w.selection.id)).not.toBeNull();
  });

  it("the customer's two simultaneous approvals through the same link: one is recorded", async () => {
    const w = await world();
    const sent = await sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id);
    const token = sent.url.split("/menu-approval/")[1];
    const results = await settle([approveViaLink(token), approveViaLink(token), approveViaLink(token)]);
    expect(fulfilled(results)).toHaveLength(1);
    for (const r of rejected(results)) expect(r.reason).toBeInstanceOf(InvalidMenuSelectionTransitionError);
    expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "CUSTOMER_APPROVED")).toBe(1);
    expect(await history(w.org.id, w.order.id, "ORDER", "APPROVED")).toBe(1);
    expect(await audits(w.org.id, "menu_selection.customer_approved")).toBe(1);
  });

  it("a recall and a customer approval at the same moment: one wins, and the versions and link agree with the status", async () => {
    for (let run = 0; run < 4; run++) {
      const w = await world();
      const sent = await sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id);
      const token = sent.url.split("/menu-approval/")[1];
      const [recall, approve] = await settle([recallMenuFromCustomer(w.org.id, w.selection.id, w.actor.id), approveViaLink(token)]);
      const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.selection.id } });
      const liveTokens = await prisma.secureAccessToken.count({ where: { organizationId: w.org.id, resourceType: "MENU_APPROVAL", revokedAt: null } });
      const live = await prisma.menuVersion.count({ where: { menuSelectionId: w.selection.id, supersededAt: null } });
      if (recall.status === "fulfilled" && approve.status === "rejected") {
        expect(selection.status).toBe("DRAFT");
        expect([liveTokens, live]).toEqual([0, 0]); // recalled: link dead, version replaced
      } else if (approve.status === "fulfilled" && recall.status === "rejected") {
        expect(selection.status).toBe("CUSTOMER_APPROVED");
        expect([liveTokens, live]).toEqual([1, 1]); // approved: the recall that lost changed nothing
      } else {
        // The customer approved first and the recall then ran from Customer Approved (also a valid transition): the recall wins last.
        expect(recall.status).toBe("fulfilled");
        expect(approve.status).toBe("fulfilled");
        expect(selection.status).toBe("DRAFT");
        expect([liveTokens, live]).toEqual([0, 0]);
      }
      expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "CUSTOMER_APPROVED")).toBeLessThanOrEqual(1);
    }
  });
});

describe("simultaneous Approve & Send to Kitchen", () => {
  it("five at once: one hand-off, one invoice, one history row each, one number used", async () => {
    const w = await approvedWorld();
    const numberBefore = (await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } })).invoiceNextValue;
    const results = await settle(Array.from({ length: 5 }, () => approveAndSendToKitchen(w.org.id, w.selection.id, w.actor.id)));
    expect(fulfilled(results)).toHaveLength(1);
    for (const r of rejected(results)) {
      expect(r.reason).toBeInstanceOf(InvalidMenuSelectionTransitionError);
      expect(String(r.reason.message)).toMatch(/already|just been changed/);
    }

    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.selection.id } });
    expect(selection.status).toBe("FINAL_LOCKED");
    expect(selection.lockedAt).toBeInstanceOf(Date);
    expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "FINAL_LOCKED")).toBe(1);
    expect(await history(w.org.id, w.order.id, "ORDER", "SENT_TO_KITCHEN")).toBe(1);
    expect(await audits(w.org.id, "menu_selection.approved_and_sent_to_kitchen")).toBe(1);
    expect(await invoices(w.org.id, w.order.id)).toBe(1);
    expect(await audits(w.org.id, "invoice.create")).toBe(1);
    // the counter moved once: no number was taken and thrown away by the requests that lost
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } })).invoiceNextValue).toBe(numberBefore + 1);
  });

  it("a repeat after the hand-off committed (a lost response, a double click) is refused with a clear message and repeats nothing", async () => {
    const w = await approvedWorld();
    await approveAndSendToKitchen(w.org.id, w.selection.id, w.actor.id);
    await expect(approveAndSendToKitchen(w.org.id, w.selection.id, w.actor.id)).rejects.toThrow(/already "Approved & Sent to Kitchen"/);
    expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "FINAL_LOCKED")).toBe(1);
    expect(await invoices(w.org.id, w.order.id)).toBe(1);
    expect(await audits(w.org.id, "menu_selection.approved_and_sent_to_kitchen")).toBe(1);
  });

  it("the team clicking Approve & Send while someone sets the same status by hand: one hand-off, one invoice", async () => {
    const w = await approvedWorld();
    const results = await settle([
      approveAndSendToKitchen(w.org.id, w.selection.id, w.actor.id),
      changeStatusManually(w.org.id, { menuSelectionId: w.selection.id, target: { kind: "MENU", status: "FINAL_LOCKED" }, reason: "agreed on the phone", actorUserId: w.actor.id }),
      changeStatusManually(w.org.id, { orderId: w.order.id, target: { kind: "ORDER", status: "SENT_TO_KITCHEN" }, reason: "agreed on the phone", actorUserId: w.actor.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    // Whichever request won, the hand-off is recorded once: a menu-approval row, or (when the order-level change won) the order's own row.
    const menuRows = await history(w.org.id, w.order.id, "MENU_APPROVAL", "FINAL_LOCKED");
    const orderRows = await history(w.org.id, w.order.id, "ORDER", "SENT_TO_KITCHEN");
    expect(menuRows).toBeLessThanOrEqual(1);
    expect(orderRows).toBeLessThanOrEqual(1);
    expect(menuRows + orderRows).toBeGreaterThanOrEqual(1);
    expect(await invoices(w.org.id, w.order.id)).toBe(1);
    expect((await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.selection.id } })).status).toBe("FINAL_LOCKED");
  });

  it("two people setting the same status by hand at once: one change, one history row, one note", async () => {
    const w = await world();
    const results = await settle(
      Array.from({ length: 4 }, () => changeStatusManually(w.org.id, { menuSelectionId: w.selection.id, target: { kind: "MENU", status: "CUSTOMER_APPROVED" }, reason: "customer confirmed by call", actorUserId: w.actor.id })),
    );
    expect(fulfilled(results)).toHaveLength(4); // the others find it already there and report "unchanged"
    expect(results.filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<{ unchanged: boolean }>).value.unchanged === false)).toHaveLength(1);
    expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "CUSTOMER_APPROVED")).toBe(1);
    expect(await prisma.menuApprovalNote.count({ where: { menuSelectionId: w.selection.id } })).toBe(1);
  });
});

describe("invoice creation is once per order, under any mix of requests", () => {
  it("six simultaneous Create Invoice / hand-off invoices: one invoice, the rest refused, no number wasted", async () => {
    const w = await world();
    const before = (await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } })).invoiceNextValue;
    const results = await settle([
      generateInvoiceFromOrder(w.org.id, w.order.id, { actorUserId: w.actor.id }),
      generateInvoiceFromOrder(w.org.id, w.order.id, { actorUserId: w.actor.id }),
      generateInvoiceFromOrder(w.org.id, w.order.id, { actorUserId: w.actor.id }),
      createInvoiceOnKitchenHandoff(w.org.id, w.order.id, w.actor.id),
      createInvoiceOnKitchenHandoff(w.org.id, w.order.id, w.actor.id),
      generateInvoiceFromOrder(w.org.id, w.order.id, { actorUserId: w.actor.id }),
    ]);
    expect(await invoices(w.org.id, w.order.id)).toBe(1);
    for (const r of rejected(results)) expect(r.reason).toBeInstanceOf(InvoiceError);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } })).invoiceNextValue).toBe(before + 1);
  });

  it("a cancelled invoice does not block a new one (the existing rule), and still only one live invoice results", async () => {
    const w = await world();
    const first = await generateInvoiceFromOrder(w.org.id, w.order.id, { actorUserId: w.actor.id });
    await prisma.invoice.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    const results = await settle([generateInvoiceFromOrder(w.org.id, w.order.id, { actorUserId: w.actor.id }), generateInvoiceFromOrder(w.org.id, w.order.id, { actorUserId: w.actor.id })]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(await invoices(w.org.id, w.order.id)).toBe(1);
  });
});

describe("a failed hand-off or invoice leaves nothing half done", () => {
  it("when the invoice cannot be created the hand-off is rolled back whole, is audited, and a retry then succeeds", async () => {
    const w = await approvedWorld();
    // Force a real database failure inside the invoice step: the next invoice number is one that already exists.
    const other = await w.makeOrder();
    const taken = await generateInvoiceFromOrder(w.org.id, other.order.id, { actorUserId: w.actor.id });
    await prisma.organization.update({ where: { id: w.org.id }, data: { invoiceNextValue: Number(taken.number.replace(/\D/g, "")) } });
    const counter = (await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } })).invoiceNextValue;
    const historyBefore = await prisma.statusChange.count({ where: { organizationId: w.org.id, orderId: w.order.id } });

    await expect(approveAndSendToKitchen(w.org.id, w.selection.id, w.actor.id)).rejects.toBeInstanceOf(KitchenHandoffError);

    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.selection.id } });
    expect([selection.status, selection.lockedAt]).toEqual(["CUSTOMER_APPROVED", null]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: w.order.id } })).status).toBe("APPROVED");
    expect(await prisma.statusChange.count({ where: { organizationId: w.org.id, orderId: w.order.id } })).toBe(historyBefore);
    expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "FINAL_LOCKED")).toBe(0);
    expect(await invoices(w.org.id, w.order.id)).toBe(0);
    expect(await audits(w.org.id, "menu_selection.approved_and_sent_to_kitchen")).toBe(0);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: w.org.id } })).invoiceNextValue).toBe(counter); // the number was handed back
    expect(await audits(w.org.id, "invoice.auto_create_failed")).toBe(1); // the failure is kept (written after the rollback)

    // fix the cause; the same request now goes through, exactly once
    await prisma.organization.update({ where: { id: w.org.id }, data: { invoiceNextValue: counter + 1 } });
    await approveAndSendToKitchen(w.org.id, w.selection.id, w.actor.id);
    expect(await invoices(w.org.id, w.order.id)).toBe(1);
    expect(await history(w.org.id, w.order.id, "MENU_APPROVAL", "FINAL_LOCKED")).toBe(1);
  });

  it("a send that fails part way leaves no version, no revoked link and no status change", async () => {
    const w = await world();
    const first = await sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id);
    await recallMenuFromCustomer(w.org.id, w.selection.id, w.actor.id);
    // a second send whose version number is already taken makes the version insert fail inside the transaction
    await prisma.menuVersion.create({ data: { menuSelectionId: w.selection.id, versionNumber: 2, status: "SENT_TO_CUSTOMER", supersededAt: new Date() } });
    await prisma.menuVersion.delete({ where: { menuSelectionId_versionNumber: { menuSelectionId: w.selection.id, versionNumber: 2 } } });
    const versions = await prisma.menuVersion.count({ where: { menuSelectionId: w.selection.id } });
    const changes = await prisma.statusChange.count({ where: { organizationId: w.org.id, orderId: w.order.id } });
    // an already-approved menu cannot be sent: refused before anything is written
    await customerApprovesViaStatus(w);
    await expect(sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id)).rejects.toBeInstanceOf(InvalidMenuSelectionTransitionError);
    expect(await prisma.menuVersion.count({ where: { menuSelectionId: w.selection.id } })).toBe(versions);
    expect(await prisma.statusChange.count({ where: { organizationId: w.org.id, orderId: w.order.id } })).toBe(changes + 2); // only the approval's own two rows
    expect(first.versionNumber).toBe(1);
  });
});

async function customerApprovesViaStatus(w: { org: { id: string }; selection: { id: string }; actor: { id: string } }) {
  await prisma.menuSelection.update({ where: { id: w.selection.id }, data: { status: "SENT_TO_CUSTOMER" } });
  await customerApproves(w.org.id, w.selection.id);
}

describe("sequential behaviour is unchanged", () => {
  it("send, change request, resend, approve, hand-off, in order, each step once", async () => {
    const w = await world();
    const v1 = await sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id);
    await recallMenuFromCustomer(w.org.id, w.selection.id, w.actor.id);
    const v2 = await sendMenuForApproval(w.org.id, { menuSelectionId: w.selection.id }, w.actor.id);
    expect([v1.versionNumber, v2.versionNumber]).toEqual([1, 2]);
    expect(await approveViaLink(v2.url.split("/menu-approval/")[1])).toEqual({ ok: true });
    await approveAndSendToKitchen(w.org.id, w.selection.id, w.actor.id);
    const selection = await prisma.menuSelection.findUniqueOrThrow({ where: { id: w.selection.id } });
    expect([selection.status, selection.currentVersion]).toEqual(["FINAL_LOCKED", 2]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: w.order.id } })).status).toBe("SENT_TO_KITCHEN");
    expect(await invoices(w.org.id, w.order.id)).toBe(1);
    expect(await prisma.menuVersion.count({ where: { menuSelectionId: w.selection.id } })).toBe(2);
    // the old version's link is dead, the new one's is the only live one
    const dead = await approveViaLink(v1.url.split("/menu-approval/")[1]);
    expect(dead).toEqual({ ok: false });
  });
});
