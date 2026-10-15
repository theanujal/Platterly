import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { listOrders } from "@/modules/orders/order";
import { approvalColumnStatus, parseApprovalFilter, parseOrdersView } from "@/modules/orders/approval-list";
import { cleanupWorlds, newBusiness } from "@/modules/menu-approvals/__tests__/phase2-world";
import type { MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";

afterEach(cleanupWorlds);

const PAST = new Date("2026-09-01");

describe("pure rules", () => {
  it("parses the filter and the view, ignoring anything else", () => {
    expect(parseApprovalFilter("NOT_STARTED")).toBe("NOT_STARTED");
    expect(parseApprovalFilter("DRAFT")).toBe("DRAFT");
    expect(parseApprovalFilter("nonsense")).toBeUndefined();
    expect(parseApprovalFilter("")).toBeUndefined();
    expect(parseOrdersView("past")).toBe("past");
    expect(parseOrdersView("anything")).toBe("upcoming");
    expect(parseOrdersView(undefined)).toBe("upcoming");
  });

  it("the column shows the least advanced approval, Not Started when none, and nothing for a closed order without one", () => {
    expect(approvalColumnStatus([], "PENDING_REVIEW")).toBe("NOT_STARTED");
    expect(approvalColumnStatus([], "COMPLETED")).toBeNull();
    expect(approvalColumnStatus([], "CANCELLED")).toBeNull();
    expect(approvalColumnStatus([{ status: "FINAL_LOCKED" }, { status: "DRAFT" }], "APPROVED")).toBe("DRAFT");
    expect(approvalColumnStatus([{ status: "FINAL_LOCKED" }], "COMPLETED")).toBe("FINAL_LOCKED");
  });
});

describe("the Orders list: approval filter and Past view", () => {
  async function seed() {
    const b = await newBusiness();
    const make = async (options: { status: MenuSelectionStatus | null; orderStatus?: OrderStatus; past?: boolean }) => {
      const { order, selection } = await b.makeOrder();
      if (options.past) await prisma.order.update({ where: { id: order.id }, data: { eventStartDate: PAST, eventEndDate: PAST } });
      if (options.orderStatus) await prisma.order.update({ where: { id: order.id }, data: { status: options.orderStatus } });
      if (options.status === null) await prisma.menuSelection.delete({ where: { id: selection.id } });
      else await prisma.menuSelection.update({ where: { id: selection.id }, data: { status: options.status } });
      return order.id;
    };
    return { b, make };
  }
  const ids = async (orgId: string, filter: Parameters<typeof listOrders>[1]) => (await listOrders(orgId, filter)).map((o) => o.id).sort();

  it("the Past view lists only past-event orders with outstanding approval work on an open order", async () => {
    const { b, make } = await seed();
    const outstanding = await Promise.all((["DRAFT", "SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING", "CHANGES_REQUESTED", "CUSTOMER_APPROVED"] as MenuSelectionStatus[]).map((status) => make({ status, past: true })));
    const sentToKitchen = await make({ status: "FINAL_LOCKED", past: true, orderStatus: "SENT_TO_KITCHEN" });
    const completed = await make({ status: "DRAFT", past: true, orderStatus: "COMPLETED" });
    const cancelled = await make({ status: "DRAFT", past: true, orderStatus: "CANCELLED" });
    const noApproval = await make({ status: null, past: true });
    const upcoming = await make({ status: "DRAFT" });

    const past = await ids(b.org.id, { when: "past", outstandingApproval: true });
    expect(past).toEqual([...outstanding].sort());
    for (const excluded of [sentToKitchen, completed, cancelled, noApproval, upcoming]) expect(past).not.toContain(excluded);
  });

  it("the default list is unchanged: upcoming only, past orders never leak into it", async () => {
    const { b, make } = await seed();
    const upcomingOpen = await make({ status: "DRAFT" });
    const upcomingNone = await make({ status: null });
    const pastOutstanding = await make({ status: "DRAFT", past: true });
    const upcoming = await ids(b.org.id, { when: "upcoming" });
    expect(upcoming).toEqual([upcomingOpen, upcomingNone].sort());
    expect(upcoming).not.toContain(pastOutstanding);
    // Callers that pass no `when` (global search) still see everything.
    expect(await ids(b.org.id, {})).toHaveLength(3);
  });

  it("filters by approval status and by Not Started, on top of the other filters", async () => {
    const { b, make } = await seed();
    const draft = await make({ status: "DRAFT" });
    const approved = await make({ status: "CUSTOMER_APPROVED" });
    const none = await make({ status: null });
    expect(await ids(b.org.id, { when: "upcoming", approval: "DRAFT" })).toEqual([draft]);
    expect(await ids(b.org.id, { when: "upcoming", approval: "CUSTOMER_APPROVED" })).toEqual([approved]);
    expect(await ids(b.org.id, { when: "upcoming", approval: "NOT_STARTED" })).toEqual([none]);
    expect(await ids(b.org.id, { when: "upcoming", approval: "FINAL_LOCKED" })).toEqual([]);
    // Combined with the Past rule: an upcoming order is never returned by the Past view, whatever the filter.
    expect(await ids(b.org.id, { when: "past", outstandingApproval: true, approval: "DRAFT" })).toEqual([]);
  });

  it("keeps the location filter working with the approval filter, and another business's orders out", async () => {
    const { b, make } = await seed();
    const mine = await make({ status: "DRAFT", past: true });
    const other = await make({ status: "DRAFT", past: true }); // same business, never put at a location
    const branch = await prisma.branch.create({ data: { organizationId: b.org.id, name: "Main branch" } });
    const kitchen = await prisma.kitchen.create({ data: { organizationId: b.org.id, branchId: branch.id, name: "North" } });
    await prisma.event.updateMany({ where: { orderId: mine }, data: { assignedKitchenId: kitchen.id } });
    expect(await ids(b.org.id, { when: "past", outstandingApproval: true, locationId: kitchen.id })).toEqual([mine]);
    expect(await ids(b.org.id, { when: "past", outstandingApproval: true, locationId: kitchen.id, approval: "DRAFT" })).toEqual([mine]);
    expect(await ids(b.org.id, { when: "past", outstandingApproval: true })).toEqual([mine, other].sort());

    const stranger = await newBusiness("Other Org");
    const theirs = await stranger.makeOrder();
    await prisma.order.update({ where: { id: theirs.order.id }, data: { eventStartDate: PAST, eventEndDate: PAST } });
    expect(await ids(b.org.id, { when: "past", outstandingApproval: true })).not.toContain(theirs.order.id);
    await prisma.event.updateMany({ where: { assignedKitchenId: kitchen.id }, data: { assignedKitchenId: null } });
    await prisma.kitchen.deleteMany({ where: { organizationId: b.org.id } });
    await prisma.branch.deleteMany({ where: { organizationId: b.org.id } });
  });
});
