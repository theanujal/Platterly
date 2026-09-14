import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { notify } from "@/lib/notifications/notify";
import { createEvent } from "@/modules/events/event";
import type { OrderStatus, OrderPaymentStatus, OrderItemType, MealType } from "@/generated/prisma/enums";

export interface OrderItemCatalogInput {
  itemType: OrderItemType;
  /** menuId, menuItemId, or addOnId, depending on itemType. */
  catalogId: string;
  quantity: number;
}

export interface MealPlanEntryInput {
  date: Date;
  mealType: MealType;
  /** Only meaningful when individualPricingEnabled. */
  price?: number;
}

export interface OrderInput {
  customerId: string;
  eventTypeId?: string | null;
  eventStartDate: Date;
  eventEndDate: Date;
  venue?: string;
  eventAddress?: string;
  adultCount?: number | null;
  childCount?: number | null;
  totalParticipants?: number | null;
  adultNonVegCount?: number | null;
  adultVegCount?: number | null;
  individualPricingEnabled?: boolean;
  discount?: number;
  taxes?: number;
  advance?: number;
  paymentStatus?: OrderPaymentStatus;
  status?: OrderStatus;
  notes?: string;
  /** Full replacement of this Order's Products & Menu Items (Group 10.5). */
  items?: OrderItemCatalogInput[];
  /** Full replacement of this Order's Meal Planning selections (Group 10.4). */
  mealPlanEntries?: MealPlanEntryInput[];
}

/**
 * Resolves a catalog reference (Menu/MenuItem/AddOn) to a name+price
 * snapshot server-side — never trusts a client-submitted price, so an
 * OrderItem's price can't be tampered with via the form payload.
 */
async function resolveCatalogItem(organizationId: string, itemType: OrderItemType, catalogId: string) {
  if (itemType === "MENU") {
    const menu = await prisma.menu.findFirstOrThrow({ where: { id: catalogId, organizationId } });
    return { name: menu.name, unitPrice: menu.pricePerPlate, menuId: catalogId, menuItemId: null, addOnId: null };
  }
  if (itemType === "MENU_ITEM") {
    const item = await prisma.menuItem.findFirstOrThrow({ where: { id: catalogId, organizationId } });
    return { name: item.name, unitPrice: item.price, menuId: null, menuItemId: catalogId, addOnId: null };
  }
  const addOn = await prisma.addOn.findFirstOrThrow({ where: { id: catalogId, organizationId } });
  return { name: addOn.name, unitPrice: addOn.price, menuId: null, menuItemId: null, addOnId: catalogId };
}

async function replaceOrderItems(organizationId: string, orderId: string, items: OrderItemCatalogInput[] | undefined) {
  if (items === undefined) return;
  await prisma.orderItem.deleteMany({ where: { orderId } });
  if (items.length === 0) return;
  const resolved = await Promise.all(
    items.map(async (item) => ({
      orderId,
      itemType: item.itemType,
      quantity: item.quantity,
      ...(await resolveCatalogItem(organizationId, item.itemType, item.catalogId)),
    })),
  );
  await prisma.orderItem.createMany({ data: resolved });
}

async function replaceMealPlanEntries(orderId: string, entries: MealPlanEntryInput[] | undefined) {
  if (entries === undefined) return;
  await prisma.mealPlanEntry.deleteMany({ where: { orderId } });
  if (entries.length === 0) return;
  await prisma.mealPlanEntry.createMany({
    data: entries.map((entry) => ({ orderId, date: entry.date, mealType: entry.mealType, price: entry.price })),
  });
}

/**
 * The one place `subtotal`/`total`/`balance` get computed — never left to
 * driftable ad-hoc math at each call site. `subtotal` = sum(items) plus,
 * only when `individualPricingEnabled`, sum(mealPlanEntries.price); `total`
 * = subtotal - discount + taxes; `balance` = total - advance.
 */
export async function recalculateOrderTotals(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, mealPlanEntries: true },
  });

  const itemsSubtotal = order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const mealsSubtotal = order.individualPricingEnabled
    ? order.mealPlanEntries.reduce((sum, entry) => sum + Number(entry.price ?? 0), 0)
    : 0;
  const subtotal = itemsSubtotal + mealsSubtotal;
  const total = subtotal - Number(order.discount) + Number(order.taxes);
  const balance = total - Number(order.advance);

  return prisma.order.update({ where: { id: orderId }, data: { subtotal, total, balance } });
}

export async function createOrder(organizationId: string, input: OrderInput, actorUserId: string) {
  const order = await prisma.order.create({
    data: {
      organizationId,
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      venue: input.venue,
      eventAddress: input.eventAddress,
      adultCount: input.adultCount,
      childCount: input.childCount,
      totalParticipants: input.totalParticipants,
      adultNonVegCount: input.adultNonVegCount,
      adultVegCount: input.adultVegCount,
      individualPricingEnabled: input.individualPricingEnabled ?? false,
      discount: input.discount ?? 0,
      taxes: input.taxes ?? 0,
      advance: input.advance ?? 0,
      paymentStatus: input.paymentStatus ?? "UNPAID",
      status: input.status ?? "DRAFT",
      notes: input.notes,
    },
  });
  await replaceOrderItems(organizationId, order.id, input.items);
  await replaceMealPlanEntries(order.id, input.mealPlanEntries);
  const withTotals = await recalculateOrderTotals(order.id);

  await audit({
    organizationId,
    actorUserId,
    action: "order.create",
    recordType: "Order",
    recordId: order.id,
    after: JSON.parse(JSON.stringify(withTotals)),
  });

  return withTotals;
}

export async function updateOrder(organizationId: string, id: string, input: OrderInput, actorUserId: string) {
  const before = await prisma.order.findFirstOrThrow({ where: { id, organizationId } });

  await prisma.order.update({
    where: { id },
    data: {
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      venue: input.venue,
      eventAddress: input.eventAddress,
      adultCount: input.adultCount,
      childCount: input.childCount,
      totalParticipants: input.totalParticipants,
      adultNonVegCount: input.adultNonVegCount,
      adultVegCount: input.adultVegCount,
      individualPricingEnabled: input.individualPricingEnabled ?? before.individualPricingEnabled,
      discount: input.discount ?? before.discount,
      taxes: input.taxes ?? before.taxes,
      advance: input.advance ?? before.advance,
      paymentStatus: input.paymentStatus ?? before.paymentStatus,
      status: input.status ?? before.status,
      notes: input.notes,
    },
  });
  await replaceOrderItems(organizationId, id, input.items);
  await replaceMealPlanEntries(id, input.mealPlanEntries);
  const withTotals = await recalculateOrderTotals(id);

  await audit({
    organizationId,
    actorUserId,
    action: "order.update",
    recordType: "Order",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(withTotals)),
  });

  return withTotals;
}

/** Hard delete — items/mealPlanEntries cascade; any linked Event just gets orderId unset (SetNull), not deleted. */
export async function deleteOrder(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.order.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.order.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "order.delete",
    recordType: "Order",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export interface OrderListFilter {
  status?: OrderStatus;
  search?: string;
}

export async function listOrders(organizationId: string, filter?: OrderListFilter) {
  return prisma.order.findMany({
    where: {
      organizationId,
      status: filter?.status,
      customer: filter?.search ? { name: { contains: filter.search, mode: "insensitive" } } : undefined,
    },
    include: { customer: { select: { id: true, name: true, phone: true } }, eventType: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrder(organizationId: string, id: string) {
  return prisma.order.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      eventType: true,
      items: { orderBy: { createdAt: "asc" } },
      mealPlanEntries: { orderBy: [{ date: "asc" }, { mealType: "asc" }] },
      events: { include: { assignedKitchen: true, eventType: true } },
    },
  });
}

/** Group 10.5's "Create & Send WhatsApp" action — reuses Chunk 2.1's log-only notify() driver; a real send lands in Chunk 16. */
export async function sendOrderWhatsApp(organizationId: string, orderId: string, actorUserId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, organizationId },
    include: { customer: true },
  });

  await notify({
    organizationId,
    channel: "WHATSAPP",
    event: "order.create_and_notify",
    recipient: { phone: order.customer.phone },
    payload: { orderId: order.id, customerName: order.customer.name, total: order.total.toString() },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "order.whatsapp_sent",
    recordType: "Order",
    recordId: orderId,
    after: { toPhone: order.customer.phone },
  });
}

export class OrderEventTypeRequiredError extends Error {}

/**
 * Group 10.6 — Event Creation Prompt. Creates a real Event from this
 * Order's own fields (customer/eventType/date range/venue), sets its
 * `orderId`, matching the Order/Event judgment call (dev plans/index.md
 * #14): Order and Event stay separate rows, but this is the one place an
 * Order's own snapshot fields seed a real operational Event.
 */
export async function createEventForOrder(organizationId: string, orderId: string, actorUserId: string) {
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, include: { customer: true } });
  if (!order.eventTypeId) {
    throw new OrderEventTypeRequiredError("Set an Event Type on this Order before creating an Event for it.");
  }

  const event = await createEvent(
    organizationId,
    {
      customerId: order.customerId,
      eventTypeId: order.eventTypeId,
      name: `${order.customer.name}'s Event`,
      startDate: order.eventStartDate,
      endDate: order.eventEndDate,
      venue: order.venue ?? undefined,
      guestCount: order.totalParticipants ?? undefined,
    },
    actorUserId,
  );

  const linked = await prisma.event.update({ where: { id: event.id }, data: { orderId } });

  await audit({
    organizationId,
    actorUserId,
    action: "order.event_created",
    recordType: "Order",
    recordId: orderId,
    after: { eventId: event.id },
  });

  return linked;
}
