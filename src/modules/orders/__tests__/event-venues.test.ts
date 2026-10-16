import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder, updateOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { cleanEventVenues, VenueDetailsError, type VenueDetailsInput } from "@/modules/orders/event-venues";

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

const venue = (name: string, contact = "Ravi"): VenueDetailsInput => ({
  venueType: "HOME",
  venueBuildingName: name,
  completeVenueAddress: `${name}, Whitefield`,
  venueContactName: contact,
  venueContactPhone: "9000000002",
});

async function makeMultiOrder() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Venue Org", slug: `venue-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Asha Rao", phone: "9876543210" }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      orderKind: "MULTI",
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-06"),
      adultCount: 10,
      mealPlanEntries: [
        { date: new Date("2026-12-05"), mealType: "LUNCH", price: 1000 },
        { date: new Date("2026-12-06"), mealType: "DINNER", price: 1000 },
      ],
    },
    actor.id,
  );
  return { org, actor, order };
}

describe("one venue per event on the team's order (Order Details)", () => {
  it("saves a venue for every event, mirrors the first one onto the order, and clears them when the venue is the same for all", async () => {
    const { org, actor, order } = await makeMultiOrder();
    await updateOrder(
      org.id,
      order.id,
      {
        customerId: order.customerId,
        eventStartDate: order.eventStartDate,
        eventEndDate: order.eventEndDate,
        venuePerEvent: true,
        eventVenues: [
          { key: "2026-12-05-LUNCH", details: venue("Green Villa") },
          { key: "2026-12-06-DINNER", details: venue("Palm Hall", "Meera") },
        ],
      },
      actor.id,
    );
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { eventVenues: { orderBy: { date: "asc" } } } });
    expect(saved).toMatchObject({ venuePerEvent: true, venue: "Green Villa", venueContactName: "Ravi" });
    expect(saved.eventVenues.map((row) => [row.venue, row.venueContactName, row.mealType])).toEqual([
      ["Green Villa", "Ravi", "LUNCH"],
      ["Palm Hall", "Meera", "DINNER"],
    ]);

    await updateOrder(org.id, order.id, { customerId: order.customerId, eventStartDate: order.eventStartDate, eventEndDate: order.eventEndDate, venuePerEvent: false }, actor.id);
    expect(await prisma.orderEventVenue.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).venuePerEvent).toBe(false);
  });

  it("refuses a missing event, a missing required field, and leaves the saved venues untouched", async () => {
    const { org, actor, order } = await makeMultiOrder();
    const base = { customerId: order.customerId, eventStartDate: order.eventStartDate, eventEndDate: order.eventEndDate, venuePerEvent: true };
    await expect(updateOrder(org.id, order.id, { ...base, eventVenues: [{ key: "2026-12-05-LUNCH", details: venue("Green Villa") }] }, actor.id)).rejects.toThrow(/every event/);
    await expect(
      updateOrder(org.id, order.id, { ...base, eventVenues: [{ key: "2026-12-05-LUNCH", details: venue("Green Villa") }, { key: "2026-12-06-DINNER", details: { ...venue("Palm Hall"), venueType: "" } }] }, actor.id),
    ).rejects.toThrow(/Venue Type \(Event 2\) is required/);
    expect(await prisma.orderEventVenue.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).venuePerEvent).toBe(false);
  });

  it("an update that says nothing about venues leaves the venue choice alone", async () => {
    const { org, actor, order } = await makeMultiOrder();
    await updateOrder(
      org.id,
      order.id,
      { customerId: order.customerId, eventStartDate: order.eventStartDate, eventEndDate: order.eventEndDate, venuePerEvent: true, eventVenues: [{ key: "2026-12-05-LUNCH", details: venue("A") }, { key: "2026-12-06-DINNER", details: venue("B") }] },
      actor.id,
    );
    await updateOrder(org.id, order.id, { customerId: order.customerId, eventStartDate: order.eventStartDate, eventEndDate: order.eventEndDate, notes: "Call first" }, actor.id);
    expect(await prisma.orderEventVenue.count({ where: { orderId: order.id } })).toBe(2);
  });
});

describe("cleanEventVenues", () => {
  const slots = [
    { date: "2026-12-05", mealType: "LUNCH" as const },
    { date: "2026-12-06", mealType: "DINNER" as const },
  ];
  it("needs at least two events and one venue for each", () => {
    expect(() => cleanEventVenues([slots[0]], [{ key: "2026-12-05-LUNCH", details: venue("A") }])).toThrow(VenueDetailsError);
    expect(() => cleanEventVenues(slots, [{ key: "2026-12-05-LUNCH", details: venue("A") }, { key: "2026-12-07-LUNCH", details: venue("B") }])).toThrow(/every event/);
    const cleaned = cleanEventVenues(slots, [{ key: "2026-12-06-DINNER", details: venue("B") }, { key: "2026-12-05-LUNCH", details: venue("A") }]);
    expect(cleaned.map((event) => event.data.venue)).toEqual(["A", "B"]);
  });
});
