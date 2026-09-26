import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { notify } from "@/lib/notifications/notify";
import { createEvent } from "@/modules/events/event";
import type { OrderStatus, OrderPaymentStatus, OrderItemType, MealType, OrderKind, ChildPricingType, PricingMethod, VenueType } from "@/generated/prisma/enums";

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
  /**
   * Create Order redesign (2026-09-20) — required before food items can be
   * picked (order-form.tsx's meal-card flow), for every Order kind. No
   * longer Multi-only: the removed "Products & Menu Items" section used to
   * be Single Order's one whole-order Menu, so every meal now carries its
   * own instead.
   */
  menuId?: string | null;
  /** Items chosen from that meal's own Menu. */
  items?: OrderItemCatalogInput[];
}

export interface OrderInput {
  customerId: string;
  eventTypeId?: string | null;
  eventStartDate: Date;
  eventEndDate: Date;
  venue?: string;
  eventAddress?: string;
  /** "Venue & Delivery Details" section, Create Order redesign (2026-09-19) — mirrors the customer-facing intake form's own fields of the same name on Order. */
  venueType?: VenueType | null;
  venueLandmark?: string;
  venueContactName?: string;
  venueContactPhone?: string;
  liveCounterAvailable?: boolean | null;
  gasElectricAvailable?: boolean | null;
  deliveryInstructions?: string;
  cookingInstructions?: string;
  adultCount?: number | null;
  childBelow5Count?: number | null;
  child5To10Count?: number | null;
  totalParticipants?: number | null;
  adultNonVegCount?: number | null;
  adultVegCount?: number | null;
  /** SINGLE renders Meal Planning as one continuous event; MULTI groups the same per-day data into "Event 1/Event 2…" blocks. Doesn't gate what a meal may store — see MealPlanEntryInput. */
  orderKind?: OrderKind;
  /**
   * "Pricing Information" section (2026-09-19), order-level (all order
   * kinds, since Create Order's 2026-09-20 redesign). STANDARD auto-derives
   * childPricingMenuId from the first Meal Planning entry's own assigned
   * Menu (by date — see deriveStandardChildPricingMenuId), never a
   * client-submitted value. INDIVIDUAL uses the flat-or-percentage
   * individualChild*Rate/individualChild*PricingType overrides instead.
   */
  pricingMethod?: PricingMethod;
  individualChildBelow5Rate?: number | null;
  individualChildBelow5PricingType?: ChildPricingType | null;
  individualChild5To10Rate?: number | null;
  individualChild5To10PricingType?: ChildPricingType | null;
  individualPricingEnabled?: boolean;
  discount?: number;
  /** "Order Details" section (2026-09-19) — folded into `total` by recalculateOrderTotals alongside discount. */
  transportationCost?: number;
  otherCharges?: number;
  advance?: number;
  paymentStatus?: OrderPaymentStatus;
  status?: OrderStatus;
  notes?: string;
  /** "Order Details" section — internal kitchen-facing notes, distinct from the customer-facing `notes` above. */
  kitchenNotes?: string;
  /** Sync (not blind replace — see replaceMealPlanEntries) of this Order's Meal Planning selections. */
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

/**
 * Replaces this entry's own scoped items (each meal's own Menu items) — a
 * narrow, slot-scoped delete-then-recreate, never touching another meal's
 * items.
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
 * Upsert-by-(date,mealType) sync, NOT a blind delete+recreate — a
 * MealPlanEntry owns child OrderItems via `mealPlanEntryId`, and recreating
 * a row would hand it a new id, cascade-deleting those items on every
 * unrelated save. Existing (date, mealType) rows are updated in place (id
 * preserved); only genuinely removed slots are deleted (their items cascade
 * with them). Every meal's `menuId`/`items` are stored regardless of
 * `orderKind` (2026-09-20 redesign) — see MealPlanEntryInput's own comment.
 */
async function replaceMealPlanEntries(organizationId: string, orderId: string, entries: MealPlanEntryInput[] | undefined) {
  if (entries === undefined) return;
  const existing = await prisma.mealPlanEntry.findMany({ where: { orderId } });
  const existingByKey = new Map(existing.map((e) => [`${e.date.toISOString()}|${e.mealType}`, e]));
  const keepIds = new Set<string>();

  for (const entry of entries) {
    const menuId = entry.menuId ?? null;
    if (menuId) {
      await prisma.menu.findFirstOrThrow({ where: { id: menuId, organizationId } });
    }
    const key = `${entry.date.toISOString()}|${entry.mealType}`;
    const match = existingByKey.get(key);
    const entryId = match
      ? (await prisma.mealPlanEntry.update({ where: { id: match.id }, data: { price: entry.price, menuId } })).id
      : (await prisma.mealPlanEntry.create({ data: { orderId, date: entry.date, mealType: entry.mealType, price: entry.price, menuId } })).id;
    keepIds.add(entryId);

    await replaceMealPlanEntryItems(organizationId, orderId, entryId, entry.items ?? []);
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

interface ChildPricingRates {
  childUnder5Chargeable: boolean;
  childUnder5Price: unknown;
  child5To10PricingType: ChildPricingType;
  child5To10PriceValue: unknown;
  pricePerPlate: unknown;
}

/**
 * Children Guests & Pricing charge (STANDARD) for one (Menu, below5Count,
 * 5-10Count) combination — under-5 is complimentary unless the Menu opted
 * into charging it; 5-10 always prices, either as a percentage of that
 * Menu's own pricePerPlate or a flat per-plate amount. `menu` is null when
 * no meal has an assigned Menu yet — degrades to 0, never throws.
 */
export function computeChildrenCharge(menu: ChildPricingRates | null, below5Count: number | null, child5To10Count: number | null): number {
  if (!menu) return 0;
  const below5 = below5Count ?? 0;
  const child5to10 = child5To10Count ?? 0;
  const under5Charge = menu.childUnder5Chargeable ? below5 * Number(menu.childUnder5Price ?? 0) : 0;
  const perChild5to10 =
    menu.child5To10PricingType === "PERCENTAGE"
      ? (Number(menu.pricePerPlate) * Number(menu.child5To10PriceValue ?? 0)) / 100
      : Number(menu.child5To10PriceValue ?? 0);
  return under5Charge + child5to10 * perChild5to10;
}

interface IndividualChildRates {
  individualChildBelow5Rate: unknown;
  individualChildBelow5PricingType: ChildPricingType | null;
  individualChild5To10Rate: unknown;
  individualChild5To10PricingType: ChildPricingType | null;
}

/**
 * Children Guests & Pricing charge (INDIVIDUAL) — Create Order redesign
 * (2026-09-20): each child band gets its own Per Plate/Percentage type, not
 * just a flat rate. Percentage is computed against `referenceMenuPrice`
 * (the same first-assigned-Menu `pricePerPlate` STANDARD derives — see
 * deriveStandardChildPricingMenuId); a FIXED rate ignores it entirely.
 */
function computeIndividualChildrenCharge(
  rates: IndividualChildRates | null,
  referenceMenuPrice: number,
  below5Count: number | null,
  child5To10Count: number | null,
): number {
  if (!rates) return 0;
  const below5 = below5Count ?? 0;
  const child5to10 = child5To10Count ?? 0;
  const perBelow5 =
    rates.individualChildBelow5PricingType === "PERCENTAGE"
      ? (referenceMenuPrice * Number(rates.individualChildBelow5Rate ?? 0)) / 100
      : Number(rates.individualChildBelow5Rate ?? 0);
  const per5to10 =
    rates.individualChild5To10PricingType === "PERCENTAGE"
      ? (referenceMenuPrice * Number(rates.individualChild5To10Rate ?? 0)) / 100
      : Number(rates.individualChild5To10Rate ?? 0);
  return below5 * perBelow5 + child5to10 * per5to10;
}

/**
 * The one place `subtotal`/`total`/`balance` get computed — never left to
 * driftable ad-hoc math at each call site. `subtotal` = sum of every meal's
 * own item picks, plus, only when `individualPricingEnabled`, sum of each
 * MealPlanEntry's own `price`, plus `childrenCharge` (order-level, all order
 * kinds since the 2026-09-20 redesign — STANDARD prices against
 * `childPricingMenu`+the order's own child counts, INDIVIDUAL uses the flat-
 * or-percentage `individualChild*` overrides); `total` = subtotal - discount
 * + transportationCost + otherCharges (taxes removed from Create Order
 * entirely, 2026-09-20); `balance` = total - advance.
 */
export async function recalculateOrderTotals(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { mealPlanEntries: { include: { items: true } }, childPricingMenu: true },
  });

  const itemsSubtotal = order.mealPlanEntries.reduce(
    (sum, entry) => sum + entry.items.reduce((s, item) => s + Number(item.unitPrice) * item.quantity, 0),
    0,
  );
  const mealsSubtotal = order.individualPricingEnabled
    ? order.mealPlanEntries.reduce((sum, entry) => sum + Number(entry.price ?? 0), 0)
    : 0;
  const referenceMenuPrice = order.childPricingMenu ? Number(order.childPricingMenu.pricePerPlate) : 0;
  const childrenCharge =
    order.pricingMethod === "INDIVIDUAL"
      ? computeIndividualChildrenCharge(order, referenceMenuPrice, order.childBelow5Count, order.child5To10Count)
      : computeChildrenCharge(order.childPricingMenu, order.childBelow5Count, order.child5To10Count);
  const subtotal = itemsSubtotal + mealsSubtotal + childrenCharge;
  const total = subtotal - Number(order.discount) + Number(order.transportationCost) + Number(order.otherCharges);
  const balance = total - Number(order.advance);

  return prisma.order.update({ where: { id: orderId }, data: { subtotal, childrenCharge, total, balance } });
}

/**
 * The Menu Children Guests & Pricing prices against — "the menu remains the
 * same for everyone," so this is always the first Meal Planning entry's own
 * assigned Menu (by date; a stable sort preserves original submission order
 * as the tiebreaker for same-date meals), never a separate selector. Used
 * both as STANDARD's actual rate source and as INDIVIDUAL Percentage's
 * reference price (computeIndividualChildrenCharge) — so this is derived
 * regardless of pricingMethod. Null if no meal has a Menu assigned yet.
 */
function deriveStandardChildPricingMenuId(entries: MealPlanEntryInput[] | undefined): string | null {
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  return sorted.find((e) => e.menuId)?.menuId ?? null;
}

export async function createOrder(organizationId: string, input: OrderInput, actorUserId?: string) {
  const orderKind = input.orderKind ?? "SINGLE";
  const pricingMethod = input.pricingMethod ?? "STANDARD";
  const childPricingMenuId = deriveStandardChildPricingMenuId(input.mealPlanEntries);
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
      venueType: input.venueType,
      venueLandmark: input.venueLandmark,
      venueContactName: input.venueContactName,
      venueContactPhone: input.venueContactPhone,
      liveCounterAvailable: input.liveCounterAvailable,
      gasElectricAvailable: input.gasElectricAvailable,
      deliveryInstructions: input.deliveryInstructions,
      cookingInstructions: input.cookingInstructions,
      adultCount: input.adultCount,
      childBelow5Count: input.childBelow5Count,
      child5To10Count: input.child5To10Count,
      childPricingMenuId,
      pricingMethod,
      individualChildBelow5Rate: input.individualChildBelow5Rate,
      individualChildBelow5PricingType: input.individualChildBelow5PricingType,
      individualChild5To10Rate: input.individualChild5To10Rate,
      individualChild5To10PricingType: input.individualChild5To10PricingType,
      totalParticipants: input.totalParticipants,
      adultNonVegCount: input.adultNonVegCount,
      adultVegCount: input.adultVegCount,
      individualPricingEnabled: input.individualPricingEnabled ?? false,
      discount: input.discount ?? 0,
      transportationCost: input.transportationCost ?? 0,
      otherCharges: input.otherCharges ?? 0,
      advance: input.advance ?? 0,
      paymentStatus: input.paymentStatus ?? "UNPAID",
      status: input.status ?? "PENDING_REVIEW",
      notes: input.notes,
      kitchenNotes: input.kitchenNotes,
    },
  });
  await replaceMealPlanEntries(organizationId, order.id, input.mealPlanEntries);
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
  const pricingMethod = input.pricingMethod ?? before.pricingMethod;
  const childPricingMenuId = deriveStandardChildPricingMenuId(input.mealPlanEntries);

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
      venueType: input.venueType,
      venueLandmark: input.venueLandmark,
      venueContactName: input.venueContactName,
      venueContactPhone: input.venueContactPhone,
      liveCounterAvailable: input.liveCounterAvailable,
      gasElectricAvailable: input.gasElectricAvailable,
      deliveryInstructions: input.deliveryInstructions,
      cookingInstructions: input.cookingInstructions,
      adultCount: input.adultCount,
      childBelow5Count: input.childBelow5Count,
      child5To10Count: input.child5To10Count,
      childPricingMenuId,
      pricingMethod,
      individualChildBelow5Rate: input.individualChildBelow5Rate ?? before.individualChildBelow5Rate,
      individualChildBelow5PricingType: input.individualChildBelow5PricingType ?? before.individualChildBelow5PricingType,
      individualChild5To10Rate: input.individualChild5To10Rate ?? before.individualChild5To10Rate,
      individualChild5To10PricingType: input.individualChild5To10PricingType ?? before.individualChild5To10PricingType,
      totalParticipants: input.totalParticipants,
      adultNonVegCount: input.adultNonVegCount,
      adultVegCount: input.adultVegCount,
      individualPricingEnabled: input.individualPricingEnabled ?? before.individualPricingEnabled,
      discount: input.discount ?? before.discount,
      transportationCost: input.transportationCost ?? before.transportationCost,
      otherCharges: input.otherCharges ?? before.otherCharges,
      advance: input.advance ?? before.advance,
      paymentStatus: input.paymentStatus ?? before.paymentStatus,
      status: input.status ?? before.status,
      notes: input.notes,
      kitchenNotes: input.kitchenNotes,
    },
  });
  await replaceMealPlanEntries(organizationId, id, input.mealPlanEntries);
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
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      eventType: { select: { id: true, name: true, icon: true } },
      // Feeds the Orders card's menu-approval callout (order-card.ts).
      events: { select: { menuSelection: { select: { status: true, currentVersion: true, kitchenProductionStatus: true } } } },
    },
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
      childPricingMenu: { select: { id: true, name: true } },
      // Whole-order items (mealPlanEntryId: null) only exist for Orders
      // converted from an accepted Quotation (quotations/quotation.ts's
      // convertQuotationToOrder writes them directly) — the Create Order
      // form itself no longer has a whole-order item picker as of the
      // 2026-09-20 redesign, so these aren't rendered by order-form.tsx.
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
export async function createEventForOrder(organizationId: string, orderId: string, actorUserId?: string) {
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
