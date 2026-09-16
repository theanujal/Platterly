import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { notify } from "@/lib/notifications/notify";
import { createEvent } from "@/modules/events/event";
import type { OrderStatus, OrderPaymentStatus, OrderItemType, MealType, OrderKind } from "@/generated/prisma/enums";

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
  /** Multi Order only (orderKind) — stripped server-side otherwise. */
  menuId?: string | null;
  /** Multi Order only — items chosen from that slot's own Menu. Stripped server-side otherwise. */
  items?: OrderItemCatalogInput[];
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
  /** Single = one Menu for the whole Order; Multi = a Menu per meal slot. Explicit, not inferred. */
  orderKind?: OrderKind;
  individualPricingEnabled?: boolean;
  discount?: number;
  taxes?: number;
  advance?: number;
  paymentStatus?: OrderPaymentStatus;
  status?: OrderStatus;
  notes?: string;
  /** Full replacement of this Order's whole-order Products & Menu Items (Group 10.5). */
  items?: OrderItemCatalogInput[];
  /** Sync (not blind replace — see replaceMealPlanEntries) of this Order's Meal Planning selections (Group 10.4). */
  mealPlanEntries?: MealPlanEntryInput[];
}

/**
 * Resolves a catalog reference (Menu/MenuItem/AddOn) to a name+price
 * snapshot server-side — never trusts a client-submitted price, so an
 * OrderItem's price can't be tampered with via the form payload. Exported
 * for `quotations/quotation.ts`'s own `QuotationItem` add-flow, which needs
 * the identical snapshot behavior.
 */
export async function resolveCatalogItem(organizationId: string, itemType: OrderItemType, catalogId: string) {
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

/**
 * Replaces this entry's own scoped items (Multi Order's per-meal-slot Menu
 * items) — a narrow, slot-scoped version of `replaceOrderItems`'s
 * delete-then-recreate pattern, never touching whole-order items
 * (mealPlanEntryId: null).
 */
async function replaceMealPlanEntryItems(organizationId: string, orderId: string, mealPlanEntryId: string, items: OrderItemCatalogInput[]) {
  await prisma.orderItem.deleteMany({ where: { mealPlanEntryId } });
  if (items.length === 0) return;
  const resolved = await Promise.all(
    items.map(async (item) => ({
      orderId,
      mealPlanEntryId,
      itemType: item.itemType,
      quantity: item.quantity,
      ...(await resolveCatalogItem(organizationId, item.itemType, item.catalogId)),
    })),
  );
  await prisma.orderItem.createMany({ data: resolved });
}

/**
 * Upsert-by-(date,mealType) sync, NOT a blind delete+recreate — unlike
 * `replaceOrderItems`, a MealPlanEntry can now own child OrderItems (Multi
 * Order's per-slot items via `mealPlanEntryId`), and recreating a row would
 * hand it a new id, cascade-deleting those items on every unrelated save.
 * Existing (date, mealType) rows are updated in place (id preserved); only
 * genuinely removed slots are deleted (their items cascade with them).
 * `menuId`/per-slot `items` are silently stripped unless `orderKind ===
 * "MULTI"`, so a Single Order can never end up with stray Menu/item data.
 */
async function replaceMealPlanEntries(organizationId: string, orderId: string, orderKind: OrderKind, entries: MealPlanEntryInput[] | undefined) {
  if (entries === undefined) return;
  const existing = await prisma.mealPlanEntry.findMany({ where: { orderId } });
  const existingByKey = new Map(existing.map((e) => [`${e.date.toISOString()}|${e.mealType}`, e]));
  const keepIds = new Set<string>();

  for (const entry of entries) {
    const menuId = orderKind === "MULTI" ? (entry.menuId ?? null) : null;
    if (menuId) {
      await prisma.menu.findFirstOrThrow({ where: { id: menuId, organizationId } });
    }
    const key = `${entry.date.toISOString()}|${entry.mealType}`;
    const match = existingByKey.get(key);
    const entryId = match
      ? (await prisma.mealPlanEntry.update({ where: { id: match.id }, data: { price: entry.price, menuId } })).id
      : (await prisma.mealPlanEntry.create({ data: { orderId, date: entry.date, mealType: entry.mealType, price: entry.price, menuId } })).id;
    keepIds.add(entryId);

    const scopedItems = orderKind === "MULTI" ? (entry.items ?? []) : [];
    await replaceMealPlanEntryItems(organizationId, orderId, entryId, scopedItems);
  }

  const toDelete = existing.filter((e) => !keepIds.has(e.id));
  if (toDelete.length > 0) {
    await prisma.mealPlanEntry.deleteMany({ where: { id: { in: toDelete.map((e) => e.id) } } });
  }
}

/**
 * Assigns this Order's human-readable, per-tenant Order Number (e.g.
 * "AJ-0001") from Organization's configurable prefix/counter/padding.
 * Prisma's `increment` compiles to an atomic SQL UPDATE, so two concurrent
 * createOrder calls for the same tenant can never collide. Called only from
 * createOrder — immutable afterward, like OrderItem's price snapshot.
 */
async function nextOrderNumber(organizationId: string): Promise<string> {
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: { orderNumberNextValue: { increment: 1 } },
    select: { orderNumberPrefix: true, orderNumberNextValue: true, orderNumberPadding: true },
  });
  const assigned = org.orderNumberNextValue - 1;
  return `${org.orderNumberPrefix}-${String(assigned).padStart(org.orderNumberPadding, "0")}`;
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
  const orderKind = input.orderKind ?? "SINGLE";
  const orderNumber = await nextOrderNumber(organizationId);
  const order = await prisma.order.create({
    data: {
      organizationId,
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      orderKind,
      orderNumber,
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
  await replaceMealPlanEntries(organizationId, order.id, orderKind, input.mealPlanEntries);
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
  // orderNumber is intentionally absent here — assigned once at createOrder, never reassigned.
  const orderKind = input.orderKind ?? before.orderKind;

  await prisma.order.update({
    where: { id },
    data: {
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      orderKind,
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
  await replaceMealPlanEntries(organizationId, id, orderKind, input.mealPlanEntries);
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
  orderKind?: OrderKind;
  search?: string;
  /** Caps the result count (e.g. the Dashboard's global search bar) — omitted for the full Orders list. */
  take?: number;
}

export async function listOrders(organizationId: string, filter?: OrderListFilter) {
  return prisma.order.findMany({
    where: {
      organizationId,
      status: filter?.status,
      orderKind: filter?.orderKind,
      ...(filter?.search
        ? {
            OR: [
              { customer: { name: { contains: filter.search, mode: "insensitive" } } },
              { customer: { phone: { contains: filter.search, mode: "insensitive" } } },
              { orderNumber: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { customer: { select: { id: true, name: true, phone: true } }, eventType: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: filter?.take,
  });
}

/** Feeds the Dashboard's Partial Payments card — mirrors getInventoryOverviewStats' shape/purpose for its own domain. */
export async function getPartialPaymentsOverview(organizationId: string) {
  const orders = await prisma.order.findMany({
    where: { organizationId, status: { not: "CANCELLED" }, paymentStatus: { in: ["PARTIALLY_PAID", "UNPAID"] }, balance: { gt: 0 } },
    orderBy: { balance: "desc" },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      balance: true,
      advance: true,
      total: true,
      eventStartDate: true,
      customer: { select: { name: true } },
    },
  });

  const now = new Date();
  const totalDue = orders.reduce((sum, o) => sum + Number(o.balance), 0);
  const totalCollected = orders.reduce((sum, o) => sum + Number(o.advance), 0);
  const partialCount = orders.filter((o) => o.paymentStatus === "PARTIALLY_PAID").length;
  const overdueCount = orders.filter((o) => o.eventStartDate < now).length;

  return {
    totalOrders: orders.length,
    partialCount,
    overdueCount,
    totalDue,
    totalCollected,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      balance: Number(o.balance),
      paymentStatus: o.paymentStatus,
    })),
  };
}

export async function getOrder(organizationId: string, id: string) {
  return prisma.order.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      eventType: true,
      // Whole-order items only (Products & Menu Items) — a Multi Order's
      // per-slot items live under mealPlanEntries.items below instead, so
      // they aren't double-represented in both places.
      items: { where: { mealPlanEntryId: null }, orderBy: { createdAt: "asc" } },
      mealPlanEntries: {
        orderBy: [{ date: "asc" }, { mealType: "asc" }],
        include: { menu: { select: { id: true, name: true } }, items: { orderBy: { createdAt: "asc" } } },
      },
      events: {
        include: {
          assignedKitchen: true,
          eventType: true,
          requiredInventory: { select: { inventoryId: true, quantity: true } },
        },
      },
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
