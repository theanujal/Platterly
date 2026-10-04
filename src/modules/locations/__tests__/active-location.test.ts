import { describe, it, expect, afterEach, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "active_location" && cookieValue ? { value: cookieValue } : undefined) }) }));

import { prisma } from "@/lib/db";
import {
  assertEventAtMyLocationById,
  assertEventTaskAtMyLocation,
  assertExpenseAtMyLocation,
  assertInventoryItemAtMyLocation,
  assertInvoiceAtMyLocation,
  assertMayMoveEventTo,
  assertMenuSelectionAtMyLocation,
  assertOrderAtMyLocation,
  assertPaymentAtMyLocation,
  assertPurchaseOrderAtMyLocationById,
  assertStaffAssignmentAtMyLocation,
  getActiveLocation,
  kitchenAtMyLocation,
  orderAtMyLocation,
} from "../active-location";
import { addLocation, setMultiLocationEnabled } from "../locations";
import { setMemberLocation } from "@/modules/team/team";

const orgIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];

afterEach(async () => {
  cookieValue = undefined;
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = planIds.length = userIds.length = 0;
});

async function seed() {
  const plan = await prisma.subscriptionPlan.create({ data: { code: `al-${crypto.randomUUID()}`, name: "AL", multiLocation: true } });
  planIds.push(plan.id);
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "AL Co", slug: `al-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: plan.id, status: "ACTIVE", startDate: new Date() } });
  const person = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: role, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return { user, member };
  };
  return { org, owner: await person("owner"), staff: await person("staff") };
}

describe("getActiveLocation (Chunk 23)", () => {
  it("does nothing while multiple locations are off", async () => {
    const { org, owner } = await seed();
    expect(await getActiveLocation(org.id, owner.user.id)).toEqual({ enabled: false, locationId: null, locked: false, canSwitch: false });
  });

  it("the owner follows the cookie, ignoring a location from another kitchen or a made-up one", async () => {
    const a = await seed();
    const b = await seed();
    await setMultiLocationEnabled(a.org.id, true, a.owner.user.id);
    await setMultiLocationEnabled(b.org.id, true, b.owner.user.id);
    const north = await addLocation(a.org.id, "North", a.owner.user.id);
    const foreign = await addLocation(b.org.id, "Foreign", b.owner.user.id);
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ enabled: true, locationId: null, canSwitch: true });
    cookieValue = north.id;
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ locationId: north.id, locked: false, canSwitch: true });
    cookieValue = foreign.id;
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ locationId: null });
    cookieValue = "made-up";
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ locationId: null });
  });

  it("a member with a location is held to it whatever the cookie says; one without sees everything and cannot switch", async () => {
    const { org, owner, staff } = await seed();
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    const south = await addLocation(org.id, "South", owner.user.id);
    cookieValue = south.id;
    expect(await getActiveLocation(org.id, staff.user.id)).toEqual({ enabled: true, locationId: null, locked: false, canSwitch: false });
    await setMemberLocation(org.id, staff.member.id, north.id, owner.user.id);
    expect(await getActiveLocation(org.id, staff.user.id)).toEqual({ enabled: true, locationId: north.id, locked: true, canSwitch: false });
  });
});

describe("held members and direct addresses (Chunk 23)", () => {
  async function twoOrders(org: { id: string }, northId: string, southId: string) {
    const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Asha", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
    const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
    const make = async (kitchenId: string | null) => {
      const order = await prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01") } });
      await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: "E", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-01"), orderId: order.id, assignedKitchenId: kitchenId } });
      return order;
    };
    return { atNorth: await make(northId), atSouth: await make(southId), unassigned: await make(null) };
  }

  it("a held member can open only the orders and events at their location; everyone else can open all", async () => {
    const { org, owner, staff } = await seed();
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    const south = await addLocation(org.id, "South", owner.user.id);
    const { atNorth, atSouth, unassigned } = await twoOrders(org, north.id, south.id);

    // Not held (feature on, no location): everything opens.
    for (const o of [atNorth, atSouth, unassigned]) expect(await orderAtMyLocation(org.id, staff.user.id, o.id)).toBe(true);
    expect(await kitchenAtMyLocation(org.id, staff.user.id, south.id)).toBe(true);

    await setMemberLocation(org.id, staff.member.id, north.id, owner.user.id);
    expect(await orderAtMyLocation(org.id, staff.user.id, atNorth.id)).toBe(true);
    expect(await orderAtMyLocation(org.id, staff.user.id, atSouth.id)).toBe(false);
    expect(await orderAtMyLocation(org.id, staff.user.id, unassigned.id)).toBe(false);
    expect(await orderAtMyLocation(org.id, staff.user.id, null)).toBe(false);
    expect(await kitchenAtMyLocation(org.id, staff.user.id, north.id)).toBe(true);
    expect(await kitchenAtMyLocation(org.id, staff.user.id, south.id)).toBe(false);
    expect(await kitchenAtMyLocation(org.id, staff.user.id, null)).toBe(false);

    // The owner is never held, even with a cookie pointing at South.
    cookieValue = south.id;
    expect(await orderAtMyLocation(org.id, owner.user.id, atNorth.id)).toBe(true);
  });

  it("switching locations off lifts the hold", async () => {
    const { org, owner, staff } = await seed();
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    const south = await addLocation(org.id, "South", owner.user.id);
    const { atSouth } = await twoOrders(org, north.id, south.id);
    await setMemberLocation(org.id, staff.member.id, north.id, owner.user.id);
    expect(await orderAtMyLocation(org.id, staff.user.id, atSouth.id)).toBe(false);
    await setMultiLocationEnabled(org.id, false, owner.user.id);
    expect(await orderAtMyLocation(org.id, staff.user.id, atSouth.id)).toBe(true);
  });
});

describe("Server Action guards (Chunk 23)", () => {
  /** Two orders (one per location) with everything an action can be pointed at hanging off each. */
  async function world() {
    const { org, owner, staff } = await seed();
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    const south = await addLocation(org.id, "South", owner.user.id);
    const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Asha", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
    const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
    const supplier = await prisma.supplier.create({ data: { organizationId: org.id, name: "Fresh Mart" } });
    const staffMember = await prisma.staffMember.create({ data: { organizationId: org.id, name: "Ravi" } });
    let n = 0;
    const at = async (kitchenId: string) => {
      n += 1;
      const order = await prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01") } });
      const event = await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: "E", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-01"), orderId: order.id, assignedKitchenId: kitchenId } });
      const selection = await prisma.menuSelection.create({ data: { organizationId: org.id, eventId: event.id } });
      const invoice = await prisma.invoice.create({ data: { organizationId: org.id, orderId: order.id, number: `INV-${n}`, customerName: "Asha", businessName: "Scoped Co" } });
      const payment = await prisma.payment.create({ data: { organizationId: org.id, orderId: order.id, amount: 100, type: "ADVANCE", method: "CASH" } });
      const expense = await prisma.expense.create({ data: { organizationId: org.id, orderId: order.id, category: "FOOD", amount: 50, spentAt: new Date("2026-12-01") } });
      const assignment = await prisma.staffAssignment.create({ data: { organizationId: org.id, eventId: event.id, staffMemberId: staffMember.id, duty: "SERVING" } });
      const task = await prisma.eventTask.create({ data: { organizationId: org.id, eventId: event.id, title: "Pack" } });
      const purchaseOrder = await prisma.purchaseOrder.create({ data: { organizationId: org.id, number: `PO-${n}`, supplierId: supplier.id, kitchenId } });
      const item = await prisma.inventory.create({ data: { organizationId: org.id, name: `Item ${n}`, category: "Spices", unit: "kg", kitchenId } });
      return { order, event, selection, invoice, payment, expense, assignment, task, purchaseOrder, item };
    };
    const sharedItem = await prisma.inventory.create({ data: { organizationId: org.id, name: "Shared", category: "Spices", unit: "kg" } });
    const sharedPo = await prisma.purchaseOrder.create({ data: { organizationId: org.id, number: "PO-S", supplierId: supplier.id } });
    const companyExpense = await prisma.expense.create({ data: { organizationId: org.id, category: "RENT", amount: 999, spentAt: new Date("2026-12-01") } });
    return { org, owner, staff, north, south, a: await at(north.id), b: await at(south.id), sharedItem, sharedPo, companyExpense };
  }

  const allowed = (p: Promise<void>) => expect(p).resolves.toBeUndefined();
  const refused = (p: Promise<void>) => expect(p).rejects.toThrow();

  it("a held member is refused every kind of record at another location and allowed those at their own", async () => {
    const w = await world();
    await setMemberLocation(w.org.id, w.staff.member.id, w.north.id, w.owner.user.id);
    const o = w.org.id;
    const u = w.staff.user.id;
    // Their own location (A is North): all allowed.
    await allowed(assertOrderAtMyLocation(o, u, w.a.order.id));
    await allowed(assertEventAtMyLocationById(o, u, w.a.event.id));
    await allowed(assertMenuSelectionAtMyLocation(o, u, w.a.selection.id));
    await allowed(assertInvoiceAtMyLocation(o, u, w.a.invoice.id));
    await allowed(assertPaymentAtMyLocation(o, u, w.a.payment.id));
    await allowed(assertExpenseAtMyLocation(o, u, w.a.expense.id));
    await allowed(assertStaffAssignmentAtMyLocation(o, u, w.a.assignment.id));
    await allowed(assertEventTaskAtMyLocation(o, u, w.a.task.id));
    await allowed(assertPurchaseOrderAtMyLocationById(o, u, w.a.purchaseOrder.id));
    await allowed(assertInventoryItemAtMyLocation(o, u, w.a.item.id));
    // Records with no location are open to everyone: company expenses, shared items and purchase orders.
    await allowed(assertExpenseAtMyLocation(o, u, w.companyExpense.id));
    await allowed(assertInventoryItemAtMyLocation(o, u, w.sharedItem.id));
    await allowed(assertPurchaseOrderAtMyLocationById(o, u, w.sharedPo.id));
    // Another location (B is South): all refused.
    await refused(assertOrderAtMyLocation(o, u, w.b.order.id));
    await refused(assertEventAtMyLocationById(o, u, w.b.event.id));
    await refused(assertMenuSelectionAtMyLocation(o, u, w.b.selection.id));
    await refused(assertInvoiceAtMyLocation(o, u, w.b.invoice.id));
    await refused(assertPaymentAtMyLocation(o, u, w.b.payment.id));
    await refused(assertExpenseAtMyLocation(o, u, w.b.expense.id));
    await refused(assertStaffAssignmentAtMyLocation(o, u, w.b.assignment.id));
    await refused(assertEventTaskAtMyLocation(o, u, w.b.task.id));
    await refused(assertPurchaseOrderAtMyLocationById(o, u, w.b.purchaseOrder.id));
    await refused(assertInventoryItemAtMyLocation(o, u, w.b.item.id));
    // An id that does not exist is refused too.
    await refused(assertOrderAtMyLocation(o, u, "nope"));
    await refused(assertInvoiceAtMyLocation(o, u, "nope"));
  });

  it("a held member may not move an event to another location or to none; leaving the location alone is fine", async () => {
    const w = await world();
    await setMemberLocation(w.org.id, w.staff.member.id, w.north.id, w.owner.user.id);
    await allowed(assertMayMoveEventTo(w.org.id, w.staff.user.id, undefined));
    await allowed(assertMayMoveEventTo(w.org.id, w.staff.user.id, w.north.id));
    await refused(assertMayMoveEventTo(w.org.id, w.staff.user.id, w.south.id));
    await refused(assertMayMoveEventTo(w.org.id, w.staff.user.id, null));
  });

  it("anyone not held (the owner, or a member with no location) reaches every record", async () => {
    const w = await world();
    for (const user of [w.owner.user.id, w.staff.user.id]) {
      await allowed(assertOrderAtMyLocation(w.org.id, user, w.b.order.id));
      await allowed(assertPaymentAtMyLocation(w.org.id, user, w.b.payment.id));
      await allowed(assertInventoryItemAtMyLocation(w.org.id, user, w.b.item.id));
      await allowed(assertMayMoveEventTo(w.org.id, user, w.south.id));
    }
  });
});

