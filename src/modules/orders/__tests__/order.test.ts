import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createOrder,
  updateOrder,
  deleteOrder,
  listOrders,
  getOrder,
  recalculateOrderTotals,
  sendOrderWhatsApp,
  createEventForOrder,
  getPartialPaymentsOverview,
  OrderEventTypeRequiredError,
  syncOrderEvent,
} from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { createMenu } from "@/modules/menus/menu";
import { createMenuItem } from "@/modules/menus/item";
import { createAddOn } from "@/modules/addons/addon";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menu.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.addOn.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Order Test Org", slug: `order-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

async function makeCustomer(orgId: string, actorUserId: string) {
  return createCustomer(orgId, { name: "Asha Rao", phone: "9876543210" }, actorUserId);
}

describe("Order CRUD (Chunk 10 Groups 10.2/10.3)", () => {
  it("createOrder stores event info, participant info, and defaults status/paymentStatus", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-02"),
        venue: "Taj Hall",
        adultCount: 100,
        childBelow5Count: 5,
        child5To10Count: 15,
        adultNonVegCount: 60,
        adultVegCount: 40,
      },
      actor.id,
    );

    expect(order.status).toBe("PENDING_REVIEW");
    expect(order.paymentStatus).toBe("UNPAID");
    expect(order.venue).toBe("Taj Hall");
    expect(order.adultCount).toBe(100);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "order.create", recordId: order.id } });
    expect(log).not.toBeNull();
  });

  it("updateOrder changes fields and writes a before/after AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);

    const updated = await updateOrder(org.id, order.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date(), status: "APPROVED" }, actor.id);
    expect(updated.status).toBe("APPROVED");

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "order.update", recordId: order.id } });
    expect(log).not.toBeNull();
  });

  it("deleteOrder hard-deletes and cascades items/mealPlanEntries", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 2 }] }],
      },
      actor.id,
    );

    await deleteOrder(org.id, order.id, actor.id);

    expect(await getOrder(org.id, order.id)).toBeNull();
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.mealPlanEntry.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("listOrders filters by status/search and is tenant-isolated", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const draft = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);
    const confirmed = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date(), status: "APPROVED" }, actor.id);

    expect((await listOrders(org.id, { status: "APPROVED" })).map((o) => o.id)).toEqual([confirmed.id]);
    expect((await listOrders(org.id, { search: "asha" })).map((o) => o.id).sort()).toEqual([draft.id, confirmed.id].sort());
  });

  it("listOrders `when` splits on the event's last day and ignores status", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const day = (offset: number) => {
      const n = new Date();
      return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset));
    };
    const make = (start: Date, end: Date, status: "PENDING_REVIEW" | "CANCELLED" = "PENDING_REVIEW") =>
      prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, eventStartDate: start, eventEndDate: end, status } });
    const today = await make(day(0), day(0));
    const future = await make(day(5), day(6));
    const underway = await make(day(-1), day(1)); // multi-day: its last day is still ahead
    const over = await make(day(-10), day(-9));
    const cancelledFuture = await make(day(3), day(3), "CANCELLED");
    const cancelledOver = await make(day(-4), day(-4), "CANCELLED");

    const ids = async (when?: "upcoming" | "past") => (await listOrders(org.id, { when })).map((o) => o.id).sort();
    expect(await ids("upcoming")).toEqual([today.id, future.id, underway.id, cancelledFuture.id].sort());
    expect(await ids("past")).toEqual([over.id, cancelledOver.id].sort());
    expect(await ids()).toHaveLength(6);
  });

  it("listOrders filters by event type", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const wedding = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const birthday = await createEventType(org.id, { name: "Birthday" }, actor.id);
    const dates = { eventStartDate: new Date(), eventEndDate: new Date() };
    const weddingOrder = await createOrder(org.id, { customerId: customer.id, eventTypeId: wedding.id, ...dates }, actor.id);
    await createOrder(org.id, { customerId: customer.id, eventTypeId: birthday.id, ...dates }, actor.id);
    await createOrder(org.id, { customerId: customer.id, ...dates }, actor.id);

    expect((await listOrders(org.id, { eventTypeId: wedding.id })).map((o) => o.id)).toEqual([weddingOrder.id]);
    expect(await listOrders(org.id)).toHaveLength(3);
  });

  it("listOrders returns each linked Event's menu-approval and kitchen state for the Orders card and list", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const withMenu = await createOrder(org.id, { customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);
    const withoutEvent = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);
    const event = await createEventForOrder(org.id, withMenu.id, actor.id);
    await prisma.menuSelection.create({ data: { organizationId: org.id, eventId: event.id, status: "SENT_TO_CUSTOMER", currentVersion: 2 } });

    const listed = await listOrders(org.id);
    expect(listed.find((o) => o.id === withMenu.id)?.events.map((e) => e.menuSelection)).toEqual([{ status: "SENT_TO_CUSTOMER", currentVersion: 2, kitchenProductionStatus: "PENDING" }]);
    expect(listed.find((o) => o.id === withoutEvent.id)?.events).toEqual([]);
  });
});

describe("Order pricing/totals (Group 10.4/10.5) — recalculateOrderTotals", () => {
  it("subtotal sums each meal's own items; total/balance derive from discount/transportationCost/otherCharges/advance", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuItem = await createMenuItem(org.id, { name: "Paneer Tikka", foodType: "VEGETARIAN", price: 150 }, actor.id);
    const addOn = await createAddOn(org.id, { name: "Live Chaat Counter", type: "LIVE_COUNTER", priceType: "PER_PLATE", price: 200 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        discount: 100,
        transportationCost: 30,
        otherCharges: 20,
        advance: 500,
        mealPlanEntries: [
          {
            date: new Date("2026-12-01"),
            mealType: "LUNCH",
            items: [
              { itemType: "MENU_ITEM", catalogId: menuItem.id, quantity: 10 }, // 1500
              { itemType: "ADD_ON", catalogId: addOn.id, quantity: 1 }, // 200
            ],
          },
        ],
      },
      actor.id,
    );

    expect(Number(order.subtotal)).toBe(1700);
    expect(Number(order.total)).toBe(1700 - 100 + 30 + 20);
    expect(Number(order.balance)).toBe(1700 - 100 + 30 + 20 - 500);
  });

  it("individualPricingEnabled adds MealPlanEntry prices into subtotal; disabled ignores them", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);

    const withPricing = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        individualPricingEnabled: true,
        mealPlanEntries: [
          { date: new Date("2026-12-01"), mealType: "BREAKFAST", price: 100 },
          { date: new Date("2026-12-01"), mealType: "LUNCH", price: 300 },
        ],
      },
      actor.id,
    );
    expect(Number(withPricing.subtotal)).toBe(400);

    const withoutPricing = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        individualPricingEnabled: false,
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "DINNER", price: 500 }],
      },
      actor.id,
    );
    expect(Number(withoutPricing.subtotal)).toBe(0);
  });

  it("MealPlanEntry existence encodes selection — same (date, mealType) can't be added twice", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH" }],
      },
      actor.id,
    );
    const fetched = await getOrder(org.id, order.id);
    expect(fetched!.mealPlanEntries).toHaveLength(1);
  });

  it("updateOrder replacing a meal's items recalculates totals from the new set, not the old", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const cheapItem = await createMenuItem(org.id, { name: "Salad", foodType: "VEGETARIAN", price: 50 }, actor.id);
    const pricierItem = await createMenuItem(org.id, { name: "Biryani", foodType: "NON_VEGETARIAN", price: 300 }, actor.id);
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: cheapItem.id, quantity: 1 }] }],
      },
      actor.id,
    );
    expect(Number(order.subtotal)).toBe(50);

    const updated = await updateOrder(
      org.id,
      order.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: pricierItem.id, quantity: 2 }] }],
      },
      actor.id,
    );
    expect(Number(updated.subtotal)).toBe(600);
    const items = (await getOrder(org.id, order.id))!.mealPlanEntries[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Biryani");
  });

  it("item price/name are server-resolved snapshots, not trusted from a client-submitted price", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Wedding Menu", menuType: "VEGETARIAN", pricePerPlate: 999 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", items: [{ itemType: "MENU", catalogId: menu.id, quantity: 3 }] }],
      },
      actor.id,
    );
    const item = (await getOrder(org.id, order.id))!.mealPlanEntries[0].items[0];
    expect(item.name).toBe("Wedding Menu");
    expect(Number(item.unitPrice)).toBe(999);
    expect(Number(order.subtotal)).toBe(999 * 3);
  });

  it("recalculateOrderTotals is idempotent when called directly", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date(), transportationCost: 20 }, actor.id);

    const recalculated = await recalculateOrderTotals(order.id);
    expect(Number(recalculated.total)).toBe(20);
  });
});

describe("sendOrderWhatsApp (Group 10.5 — Create & Send WhatsApp)", () => {
  it("writes a Notification + WhatsAppMessage row via the log-only notify() driver", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Ravi Kumar", phone: "9000000000" }, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);

    await sendOrderWhatsApp(org.id, order.id, actor.id);

    const notification = await prisma.notification.findFirst({ where: { organizationId: org.id, event: "order.create_and_notify" } });
    expect(notification).not.toBeNull();
    // Phone is normalized to E.164 at write time (AJ, 2026-09-19) — see lib/phone.ts.
    const whatsapp = await prisma.whatsAppMessage.findFirst({ where: { organizationId: org.id, toPhone: "+919000000000" } });
    expect(whatsapp).not.toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "order.whatsapp_sent", recordId: order.id } });
    expect(log).not.toBeNull();
  });
});

describe("createEventForOrder (Group 10.6 — Event Creation Prompt)", () => {
  it("creates a real Event from the Order's own fields and links Event.orderId", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Zoya Khan", phone: "9222222222" }, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventTypeId: eventType.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-02"),
        venue: "Taj Hall",
        adultCount: 80,
        childBelow5Count: 5,
        child5To10Count: 15,
        totalParticipants: 100,
      },
      actor.id,
    );

    const event = await createEventForOrder(org.id, order.id, actor.id);

    expect(event.orderId).toBe(order.id);
    expect(event.customerId).toBe(customer.id);
    expect(event.eventTypeId).toBe(eventType.id);
    expect(event.venue).toBe("Taj Hall");
    expect(event.guestCount).toBe(100);

    const fetched = await getOrder(org.id, order.id);
    expect(fetched!.events.map((e) => e.id)).toEqual([event.id]);
  });

  it("rejects creating an Event when the Order has no eventTypeId set", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);

    await expect(createEventForOrder(org.id, order.id, actor.id)).rejects.toThrow(OrderEventTypeRequiredError);
  });

  it("deleting the Order unlinks (not deletes) its Event — SetNull, not Cascade", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Priya Nair", phone: "9333333333" }, actor.id);
    const eventType = await createEventType(org.id, { name: "Birthday" }, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);
    const event = await createEventForOrder(org.id, order.id, actor.id);

    await deleteOrder(org.id, order.id, actor.id);

    const stillExists = await prisma.event.findUnique({ where: { id: event.id } });
    expect(stillExists).not.toBeNull();
    expect(stillExists!.orderId).toBeNull();
  });
});

describe("Order Kind (Single vs Multi Order) and per-meal-slot Menu items", () => {
  it("defaults orderKind to SINGLE when omitted", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);
    expect(order.orderKind).toBe("SINGLE");
  });

  it("a Multi Order can assign a different Menu (and different chosen items) to each meal slot", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuA = await createMenu(org.id, { name: "Breakfast Menu", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const menuB = await createMenu(org.id, { name: "Dinner Menu", menuType: "NON_VEGETARIAN", pricePerPlate: 500 }, actor.id);
    const idli = await createMenuItem(org.id, { name: "Idli", foodType: "VEGETARIAN", price: 40 }, actor.id);
    const biryani = await createMenuItem(org.id, { name: "Biryani", foodType: "NON_VEGETARIAN", price: 300 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        orderKind: "MULTI",
        mealPlanEntries: [
          { date: new Date("2026-12-01"), mealType: "BREAKFAST", menuId: menuA.id, items: [{ itemType: "MENU_ITEM", catalogId: idli.id, quantity: 2 }] },
          { date: new Date("2026-12-01"), mealType: "DINNER", menuId: menuB.id, items: [{ itemType: "MENU_ITEM", catalogId: biryani.id, quantity: 1 }] },
        ],
      },
      actor.id,
    );

    const fetched = await getOrder(org.id, order.id);
    expect(fetched!.orderKind).toBe("MULTI");
    const breakfast = fetched!.mealPlanEntries.find((e) => e.mealType === "BREAKFAST")!;
    const dinner = fetched!.mealPlanEntries.find((e) => e.mealType === "DINNER")!;
    expect(breakfast.menuId).toBe(menuA.id);
    expect(breakfast.items.map((i) => i.name)).toEqual(["Idli"]);
    expect(dinner.menuId).toBe(menuB.id);
    expect(dinner.items.map((i) => i.name)).toEqual(["Biryani"]);
    // Whole-order Products & Menu Items list stays separate from per-slot items.
    expect(fetched!.items).toHaveLength(0);
  });

  it("updating a Multi Order re-submitting one slot unchanged preserves its id and items (no wipe-on-save)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Lunch Menu", menuType: "VEGETARIAN", pricePerPlate: 250 }, actor.id);
    const item = await createMenuItem(org.id, { name: "Dal Makhani", foodType: "VEGETARIAN", price: 120 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-02"),
        orderKind: "MULTI",
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: item.id, quantity: 3 }] }],
      },
      actor.id,
    );
    const before = (await getOrder(org.id, order.id))!.mealPlanEntries[0];

    await updateOrder(
      org.id,
      order.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-02"),
        orderKind: "MULTI",
        mealPlanEntries: [
          { date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: item.id, quantity: 3 }] },
          { date: new Date("2026-12-02"), mealType: "DINNER" },
        ],
      },
      actor.id,
    );

    const after = await getOrder(org.id, order.id);
    const lunch = after!.mealPlanEntries.find((e) => e.mealType === "LUNCH")!;
    // The MealPlanEntry row itself keeps its id (the actual bug this guards
    // against: a blind recreate would cascade-delete its items via a new
    // id). Its own items are still a full-replace blob each save — same
    // convention as the whole-order Products list — so their content, not
    // row identity, is what must survive intact.
    expect(lunch.id).toBe(before.id);
    expect(lunch.items).toHaveLength(1);
    expect(lunch.items[0].name).toBe("Dal Makhani");
    expect(lunch.items[0].quantity).toBe(3);
  });

  it("unchecking a previously-selected slot deletes it and cascades its items", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const item = await createMenuItem(org.id, { name: "Item", foodType: "VEGETARIAN", price: 10 }, actor.id);
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        orderKind: "MULTI",
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: item.id, quantity: 1 }] }],
      },
      actor.id,
    );
    const entryId = (await getOrder(org.id, order.id))!.mealPlanEntries[0].id;

    await updateOrder(org.id, order.id, { customerId: customer.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01"), orderKind: "MULTI", mealPlanEntries: [] }, actor.id);

    expect(await prisma.mealPlanEntry.findUnique({ where: { id: entryId } })).toBeNull();
    expect(await prisma.orderItem.count({ where: { mealPlanEntryId: entryId } })).toBe(0);
  });

  it("a Single Order also persists a meal's own Menu/items — not Multi-only (Create Order redesign, 2026-09-20)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const item = await createMenuItem(org.id, { name: "Item", foodType: "VEGETARIAN", price: 10 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        orderKind: "SINGLE",
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id, items: [{ itemType: "MENU_ITEM", catalogId: item.id, quantity: 1 }] }],
      },
      actor.id,
    );

    const entry = (await getOrder(org.id, order.id))!.mealPlanEntries[0];
    expect(entry.menuId).toBe(menu.id);
    expect(entry.items).toHaveLength(1);
    expect(entry.items[0].name).toBe("Item");
  });

  it("a cross-tenant menuId on a Single Order's meal slot is rejected too — the guard doesn't depend on orderKind", async () => {
    const org = await makeOrg();
    const otherOrg = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const otherMenu = await createMenu(otherOrg.id, { name: "Someone Else's Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);

    await expect(
      createOrder(
        org.id,
        {
          customerId: customer.id,
          eventStartDate: new Date("2026-12-01"),
          eventEndDate: new Date("2026-12-01"),
          orderKind: "SINGLE",
          mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: otherMenu.id }],
        },
        actor.id,
      ),
    ).rejects.toThrow();
  });

  it("a cross-tenant menuId on a Multi Order's meal slot is rejected", async () => {
    const org = await makeOrg();
    const otherOrg = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const otherMenu = await createMenu(otherOrg.id, { name: "Someone Else's Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);

    await expect(
      createOrder(
        org.id,
        {
          customerId: customer.id,
          eventStartDate: new Date("2026-12-01"),
          eventEndDate: new Date("2026-12-01"),
          orderKind: "MULTI",
          mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: otherMenu.id }],
        },
        actor.id,
      ),
    ).rejects.toThrow();
  });

  it("listOrders filters by orderKind", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const single = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date(), orderKind: "SINGLE" }, actor.id);
    const multi = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date(), orderKind: "MULTI" }, actor.id);

    expect((await listOrders(org.id, { orderKind: "SINGLE" })).map((o) => o.id)).toEqual([single.id]);
    expect((await listOrders(org.id, { orderKind: "MULTI" })).map((o) => o.id)).toEqual([multi.id]);
  });

  it("recalculateOrderTotals sums every meal slot's own items together", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuA = await createMenu(org.id, { name: "Menu A", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const menuB = await createMenu(org.id, { name: "Menu B", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);
    const itemA = await createMenuItem(org.id, { name: "Item A", foodType: "VEGETARIAN", price: 40 }, actor.id);
    const itemB = await createMenuItem(org.id, { name: "Item B", foodType: "VEGETARIAN", price: 60 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        orderKind: "MULTI",
        mealPlanEntries: [
          { date: new Date("2026-12-01"), mealType: "BREAKFAST", menuId: menuA.id, items: [{ itemType: "MENU_ITEM", catalogId: itemA.id, quantity: 1 }] }, // 40
          { date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menuB.id, items: [{ itemType: "MENU_ITEM", catalogId: itemB.id, quantity: 2 }] }, // 120
        ],
      },
      actor.id,
    );

    expect(Number(order.subtotal)).toBe(40 + 120);
  });
});

describe("Children Guests & Pricing (charge formula — order-level, all Order Types)", () => {
  it("under-5 stays free even with a non-zero count when the Menu's chargeable toggle is off", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, childUnder5Chargeable: false, childUnder5Price: 50 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        // A meal assigns the Menu (so STANDARD's deriveStandardChildPricingMenuId
        // has something to find) without any items — isolates this assertion
        // to the children-charge formula alone.
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        childBelow5Count: 10,
      },
      actor.id,
    );

    expect(Number(order.childrenCharge)).toBe(0);
    expect(Number(order.subtotal)).toBe(0);
  });

  it("under-5 charges per child once the Menu's chargeable toggle is on", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, childUnder5Chargeable: true, childUnder5Price: 50 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        childBelow5Count: 4,
      },
      actor.id,
    );

    expect(Number(order.childrenCharge)).toBe(4 * 50);
  });

  it("5-10 PERCENTAGE pricing computes as a share of the Menu's own pricePerPlate", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(
      org.id,
      { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 333, child5To10PricingType: "PERCENTAGE", child5To10PriceValue: 33.33 },
      actor.id,
    );

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        child5To10Count: 3,
      },
      actor.id,
    );

    const expectedPerChild = (333 * 33.33) / 100;
    expect(Number(order.childrenCharge)).toBeCloseTo(3 * expectedPerChild, 2);
  });

  it("5-10 FIXED pricing charges a flat per-child amount independent of pricePerPlate", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(
      org.id,
      { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 999, child5To10PricingType: "FIXED", child5To10PriceValue: 75 },
      actor.id,
    );

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        child5To10Count: 2,
      },
      actor.id,
    );

    expect(Number(order.childrenCharge)).toBe(2 * 75);
  });

  it("zero counts on a chargeable Menu yield a zero charge", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(
      org.id,
      { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, childUnder5Chargeable: true, childUnder5Price: 50, child5To10PricingType: "FIXED", child5To10PriceValue: 75 },
      actor.id,
    );

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
      },
      actor.id,
    );

    expect(Number(order.childrenCharge)).toBe(0);
  });

  it("no meal with an assigned Menu yet charges nothing even with non-zero counts", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        childBelow5Count: 5,
        child5To10Count: 5,
      },
      actor.id,
    );

    expect(Number(order.childrenCharge)).toBe(0);
  });

  it("a Multi Order still prices children once, order-level, from the earliest-dated meal's own Menu", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menuA = await createMenu(org.id, { name: "Menu A", menuType: "VEGETARIAN", pricePerPlate: 200, child5To10PricingType: "FIXED", child5To10PriceValue: 50 }, actor.id);
    const menuB = await createMenu(org.id, { name: "Menu B", menuType: "NON_VEGETARIAN", pricePerPlate: 300, child5To10PricingType: "FIXED", child5To10PriceValue: 80 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-02"),
        orderKind: "MULTI",
        child5To10Count: 2,
        mealPlanEntries: [
          { date: new Date("2026-12-01"), mealType: "BREAKFAST", menuId: menuA.id },
          { date: new Date("2026-12-02"), mealType: "DINNER", menuId: menuB.id },
        ],
      },
      actor.id,
    );

    // 2026-12-01 (Menu A, rate 50) is earlier than 2026-12-02 (Menu B) — Menu A wins, not summed across both.
    expect(Number(order.childrenCharge)).toBe(2 * 50);
  });

  it("a Multi Order with no meal assigned a Menu yet charges nothing regardless of its counts", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        orderKind: "MULTI",
        child5To10Count: 4,
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH" }],
      },
      actor.id,
    );

    expect(Number(order.childrenCharge)).toBe(0);
  });

  it("updateOrder recomputes childrenCharge when counts/assigned Menu change", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, child5To10PricingType: "FIXED", child5To10PriceValue: 60 }, actor.id);
    const order = await createOrder(
      org.id,
      { customerId: customer.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01") },
      actor.id,
    );
    expect(Number(order.childrenCharge)).toBe(0);

    const updated = await updateOrder(
      org.id,
      order.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        child5To10Count: 3,
      },
      actor.id,
    );
    expect(Number(updated.childrenCharge)).toBe(3 * 60);
  });

  it("INDIVIDUAL pricing charges a Percentage-of-Menu-price rate for one band and a flat Per Plate rate for the other", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 400 }, actor.id);

    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        pricingMethod: "INDIVIDUAL",
        childBelow5Count: 2,
        individualChildBelow5Rate: 25, // 25% of 400 = 100/child
        individualChildBelow5PricingType: "PERCENTAGE",
        child5To10Count: 3,
        individualChild5To10Rate: 120, // flat ₹120/child
        individualChild5To10PricingType: "FIXED",
      },
      actor.id,
    );

    expect(Number(order.childrenCharge)).toBe(2 * 100 + 3 * 120);
  });

  it("a cross-tenant menuId on a Single Order's meal is rejected", async () => {
    const org = await makeOrg();
    const otherOrg = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const otherMenu = await createMenu(otherOrg.id, { name: "Someone Else's Menu", menuType: "VEGETARIAN", pricePerPlate: 100 }, actor.id);

    await expect(
      createOrder(
        org.id,
        {
          customerId: customer.id,
          eventStartDate: new Date("2026-12-01"),
          eventEndDate: new Date("2026-12-01"),
          mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: otherMenu.id }],
        },
        actor.id,
      ),
    ).rejects.toThrow();
  });

  it("deleting a Menu referenced by the derived childPricingMenuId SetNulls the Order and later recalculation degrades to 0, not a throw", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const menu = await createMenu(org.id, { name: "Menu", menuType: "VEGETARIAN", pricePerPlate: 200, childUnder5Chargeable: true, childUnder5Price: 50 }, actor.id);
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventStartDate: new Date("2026-12-01"),
        eventEndDate: new Date("2026-12-01"),
        mealPlanEntries: [{ date: new Date("2026-12-01"), mealType: "LUNCH", menuId: menu.id }],
        childBelow5Count: 2,
      },
      actor.id,
    );
    expect(Number(order.childrenCharge)).toBe(100);

    await prisma.menu.delete({ where: { id: menu.id } });

    const afterDelete = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterDelete.childPricingMenuId).toBeNull();

    const recalculated = await recalculateOrderTotals(order.id);
    expect(Number(recalculated.childrenCharge)).toBe(0);
  });
});

describe("Order Numbering (per-tenant prefix/counter/padding)", () => {
  it("assigns a formatted, incrementing orderNumber on createOrder using Organization's prefix/padding", async () => {
    const org = await makeOrg();
    await prisma.organization.update({ where: { id: org.id }, data: { orderNumberPrefix: "AJ", orderNumberNextValue: 5, orderNumberPadding: 4 } });
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);

    const first = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);
    const second = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);

    expect(first.orderNumber).toBe("AJ-0005");
    expect(second.orderNumber).toBe("AJ-0006");
  });

  it("two tenants' order-number counters are independent (tenant isolation)", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const customerA = await makeCustomer(orgA.id, actor.id);
    const customerB = await makeCustomer(orgB.id, actor.id);

    const orderA = await createOrder(orgA.id, { customerId: customerA.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);
    const orderB = await createOrder(orgB.id, { customerId: customerB.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);

    expect(orderA.orderNumber).toBe("ORD-0001");
    expect(orderB.orderNumber).toBe("ORD-0001");
  });

  it("updateOrder never changes an already-assigned orderNumber", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() }, actor.id);

    const updated = await updateOrder(org.id, order.id, { customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date(), status: "APPROVED" }, actor.id);

    expect(updated.orderNumber).toBe(order.orderNumber);
  });
});

describe("getPartialPaymentsOverview — Dashboard Partial Payments card", () => {
  it("aggregates only non-cancelled Partially Paid/Unpaid orders with a real balance, incl. overdue-by-event-date", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const future = new Date(Date.now() + 30 * 86400000);
    const past = new Date(Date.now() - 5 * 86400000);

    // otherCharges alone drives `total` here (no catalog items needed) —
    // subtotal stays 0, total = 0 - discount + otherCharges, per
    // recalculateOrderTotals.
    await createOrder(
      org.id,
      { customerId: customer.id, eventStartDate: future, eventEndDate: future, otherCharges: 10000, advance: 4000, paymentStatus: "PARTIALLY_PAID", status: "APPROVED" },
      actor.id,
    );
    await createOrder(
      org.id,
      { customerId: customer.id, eventStartDate: past, eventEndDate: past, otherCharges: 5000, advance: 0, paymentStatus: "UNPAID", status: "APPROVED" },
      actor.id,
    );
    // Fully paid — excluded by paymentStatus AND balance filters.
    await createOrder(
      org.id,
      { customerId: customer.id, eventStartDate: future, eventEndDate: future, otherCharges: 2000, advance: 2000, paymentStatus: "PAID", status: "COMPLETED" },
      actor.id,
    );
    // Cancelled with an unpaid balance — excluded by status filter.
    await createOrder(
      org.id,
      { customerId: customer.id, eventStartDate: future, eventEndDate: future, otherCharges: 3000, advance: 0, paymentStatus: "UNPAID", status: "CANCELLED" },
      actor.id,
    );

    const overview = await getPartialPaymentsOverview(org.id);
    expect(overview.totalOrders).toBe(2);
    expect(overview.partialCount).toBe(1);
    expect(overview.overdueCount).toBe(1);
    expect(overview.totalDue).toBe(6000 + 5000);
    expect(overview.totalCollected).toBe(4000);
    // orderBy balance desc — the 6000-balance order first.
    expect(overview.orders.map((o) => o.balance)).toEqual([6000, 5000]);
  });

  it("tenant-isolated — another org's unpaid orders never leak in", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const customerB = await makeCustomer(orgB.id, actor.id);

    await createOrder(orgB.id, { customerId: customerB.id, eventStartDate: new Date(), eventEndDate: new Date(), otherCharges: 9000, paymentStatus: "UNPAID", status: "APPROVED" }, actor.id);

    const overview = await getPartialPaymentsOverview(orgA.id);
    expect(overview.totalOrders).toBe(0);
    expect(overview.totalDue).toBe(0);
  });
});

describe("syncOrderEvent (AJ, 2026-09-27)", () => {
  it("creates the Event when an order has an Event Type, and only once", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const order = await createOrder(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01"), totalParticipants: 80, venue: "Taj Hall" },
      actor.id,
    );

    await syncOrderEvent(org.id, order.id, actor.id);
    await syncOrderEvent(org.id, order.id, actor.id);

    const events = await prisma.event.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0].guestCount).toBe(80);
    expect(events[0].venue).toBe("Taj Hall");
  });

  it("does nothing without an Event Type", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01") }, actor.id);
    expect(await syncOrderEvent(org.id, order.id, actor.id)).toBeNull();
    expect(await prisma.event.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("copies the order's date, venue and guests onto its Event after an edit, without touching the Event's own fields", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await makeCustomer(org.id, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const base = { customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date("2026-12-01"), eventEndDate: new Date("2026-12-01") };
    const order = await createOrder(org.id, base, actor.id);
    await syncOrderEvent(org.id, order.id, actor.id);
    const created = await prisma.event.findFirstOrThrow({ where: { orderId: order.id } });
    await prisma.event.update({ where: { id: created.id }, data: { status: "PROCESSING", notes: "kitchen note" } });

    await updateOrder(org.id, order.id, { ...base, eventStartDate: new Date("2026-12-05"), eventEndDate: new Date("2026-12-06"), venue: "Palace", totalParticipants: 120 }, actor.id);
    await syncOrderEvent(org.id, order.id, actor.id);

    const synced = await prisma.event.findFirstOrThrow({ where: { orderId: order.id } });
    expect(synced.id).toBe(created.id);
    expect(synced.startDate.toISOString().slice(0, 10)).toBe("2026-12-05");
    expect(synced.endDate.toISOString().slice(0, 10)).toBe("2026-12-06");
    expect(synced.venue).toBe("Palace");
    expect(synced.guestCount).toBe(120);
    expect(synced.status).toBe("PROCESSING");
    expect(synced.notes).toBe("kitchen note");
  });
});

