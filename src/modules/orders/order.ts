import { isKitchenLocked, isOrderLocked, OrderLockedError } from "./order-lock";
import { lockAndReadOrder } from "./kitchen-lock";
import { approvalWhere, outstandingApprovalWhere, type ApprovalFilter } from "./approval-list";
import { DetailsFrozenError, PriceFrozenError, detailFieldChanges, priceFieldChanges } from "./price-freeze";
import { isPriceFrozenStatus } from "@/modules/menu-approvals/approval-stages";
import { runAfterCommit, type AfterCommit } from "@/lib/after-commit";
import { validateOrderLike } from "@/lib/validation";
import { assertOwnedRefs } from "@/lib/tenant-refs";
import { assertWithinPlanLimit } from "@/modules/subscriptions/limits";
import { deleteStoredFiles } from "@/modules/expenses/attachment";
import { derivePaymentState, tenantTodayStart } from "@/modules/payments/payment-math";
import "server-only";
import { parseCustomCharges, resolveCustomCharges, sumCustomCharges, type CustomCharge } from "./custom-charges";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { addOnOfferedOnMenu } from "@/modules/addons/addon";
import { audit } from "@/lib/audit/audit";
import { notify } from "@/lib/notifications/notify";
import { onOrderCreated } from "@/modules/notifications/triggers";
import { orderAt } from "@/modules/locations/scope";
import { createEvent, listKitchens } from "@/modules/events/event";
import { menuGuestCount, priceMeals } from "./meal-pricing";
import { getTenantTimeZone } from "@/lib/settings/timezone";
import { returnAllOrderItems, returnAllOrderItemsInTransaction } from "@/modules/production/production";
import type { Prisma } from "@/generated/prisma/client";
import { moveMealsWithEventDates } from "./meal-dates";
import { percentOf } from "./amount";
import { applyEventVenues, type EventVenueInput } from "./event-venues";
import type { MenuSelectionStatus, OrderStatus, OrderPaymentStatus, OrderItemType, MealType, OrderKind, AmountMode, ChildPricingType, PricingMethod, VenueType, VehicleAccessType, FoodType } from "@/generated/prisma/enums";

export interface OrderItemCatalogInput {
  itemType: OrderItemType;
  /** menuId, menuItemId, or addOnId, depending on itemType. */
  catalogId: string;
  quantity: number;
  /** An Extra dish (charged per guest). Only Extra dishes and add-ons move the price — see meal-pricing.ts. */
  isExtra?: boolean;
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
  /** Vegetarian / Non-Vegetarian, as on the public form (AJ, 2026-09-27). Filters which Menus and dishes are offered. */
  menuPreference?: FoodType | null;
  eventTypeId?: string | null;
  eventStartDate: Date;
  eventEndDate: Date;
  venue?: string;
  eventAddress?: string;
  /** "Venue & Delivery Details" section, Create Order redesign (2026-09-19) — mirrors the customer-facing intake form's own fields of the same name on Order. */
  venueType?: VenueType | null;
  vehicleAccess?: VehicleAccessType | null;
  /** The customer's "Catering Access / Loading Instructions" from the public form. */
  venueAccessInstructions?: string;
  venueDoorNumber?: string;
  venueTower?: string;
  venueFloor?: string;
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
  /** Discount and Extra / Service Cost as a percentage of the subtotal (AJ, 2026-10-16). In PERCENTAGE mode the amount is derived from the rate. */
  discountMode?: AmountMode;
  discountRate?: number;
  otherChargesMode?: AmountMode;
  otherChargesRate?: number;
  /** Transportation Cost as a percentage of the subtotal, like Discount. */
  transportationMode?: AmountMode;
  transportationRate?: number;
  /** Team-added label + amount lines, summed into `total`. */
  customCharges?: CustomCharge[];
  /** The venue differs by event: one venue per event (meal slot). Left out, the order's venue is not touched. */
  venuePerEvent?: boolean;
  eventVenues?: EventVenueInput[];
  advance?: number;
  paymentStatus?: OrderPaymentStatus;
  status?: OrderStatus;
  notes?: string;
  /** "Order Details" section — internal kitchen-facing notes, distinct from the customer-facing `notes` above. */
  kitchenNotes?: string;
  /** Staffing and logistics notes, shown under Additional Details. */
  staffingNotes?: string;
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
type Db = Prisma.TransactionClient | typeof prisma;

export async function resolveCatalogItem(organizationId: string, itemType: OrderItemType, catalogId: string, scope?: { menuId: string | null }, db: Db = prisma) {
  if (itemType === "MENU") {
    const menu = await db.menu.findFirstOrThrow({ where: { id: catalogId, organizationId } });
    return { name: menu.name, unitPrice: menu.pricePerPlate, menuId: catalogId, menuItemId: null, addOnId: null };
  }
  if (itemType === "MENU_ITEM") {
    const item = await db.menuItem.findFirstOrThrow({ where: { id: catalogId, organizationId } });
    return { name: item.name, unitPrice: item.price, menuId: null, menuItemId: catalogId, addOnId: null };
  }
  const addOn = await db.addOn.findFirstOrThrow({ where: { id: catalogId, organizationId }, include: { menus: { select: { menuId: true } } } });
  // The meal's Menu has to offer it (pass `scope` where the add-on is picked for a meal; a meal with no Menu only gets all-menus add-ons).
  if (scope && !addOnOfferedOnMenu(addOn, scope.menuId)) {
    const menu = scope.menuId ? await db.menu.findFirst({ where: { id: scope.menuId, organizationId }, select: { name: true } }) : null;
    throw new ValidationError(`${addOn.name} isn't offered with ${menu ? `the ${menu.name} menu` : "this meal's menu"}. Remove it or choose a menu that offers it.`);
  }
  // An add-on that is part of the package is on the order but costs nothing.
  return { name: addOn.name, unitPrice: addOn.includedInPackage ? 0 : addOn.price, menuId: null, menuItemId: null, addOnId: catalogId };
}

/**
 * Replaces this entry's own scoped items (each meal's own Menu items) — a
 * narrow, slot-scoped delete-then-recreate, never touching another meal's
 * items.
 */
async function replaceMealPlanEntryItems(organizationId: string, orderId: string, mealPlanEntryId: string, menuId: string | null, items: OrderItemCatalogInput[], db: Db) {
  // Resolved first, so an item the meal's menu doesn't offer fails before anything is deleted.
  const resolved = await Promise.all(
    items.map(async (item) => ({
      orderId,
      mealPlanEntryId,
      itemType: item.itemType,
      quantity: item.quantity,
      isExtra: item.isExtra === true,
      ...(await resolveCatalogItem(organizationId, item.itemType, item.catalogId, { menuId }, db)),
    })),
  );
  await db.orderItem.deleteMany({ where: { mealPlanEntryId } });
  if (items.length === 0) return;
  await db.orderItem.createMany({ data: resolved });
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
export async function replaceMealPlanEntries(organizationId: string, orderId: string, entries: MealPlanEntryInput[] | undefined, db: Db = prisma) {
  if (entries === undefined) return;
  const existing = await db.mealPlanEntry.findMany({ where: { orderId } });
  const existingByKey = new Map(existing.map((e) => [`${e.date.toISOString()}|${e.mealType}`, e]));
  const keepIds = new Set<string>();

  for (const entry of entries) {
    const menuId = entry.menuId ?? null;
    if (menuId) {
      await db.menu.findFirstOrThrow({ where: { id: menuId, organizationId } });
    }
    const key = `${entry.date.toISOString()}|${entry.mealType}`;
    const match = existingByKey.get(key);
    const entryId = match
      ? (await db.mealPlanEntry.update({ where: { id: match.id }, data: { price: entry.price, menuId } })).id
      : (await db.mealPlanEntry.create({ data: { orderId, date: entry.date, mealType: entry.mealType, price: entry.price, menuId } })).id;
    keepIds.add(entryId);

    await replaceMealPlanEntryItems(organizationId, orderId, entryId, menuId, entry.items ?? [], db);
  }

  const toDelete = existing.filter((e) => !keepIds.has(e.id));
  if (toDelete.length > 0) {
    await db.mealPlanEntry.deleteMany({ where: { id: { in: toDelete.map((e) => e.id) } } });
  }
}

/** Moves the order's saved meals with its event dates (see meal-dates.ts) and heals any meal already outside them. A no-op when every meal is on an event day. */
async function moveMealsToEventDates(tx: Db, orderId: string, oldStart: Date, newStart: Date, newEnd: Date) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const meals = await tx.mealPlanEntry.findMany({ where: { orderId }, include: { _count: { select: { items: true } } }, orderBy: { date: "asc" } });
  const { moved, dropped } = moveMealsWithEventDates(
    meals.map((m) => ({ id: m.id, date: iso(m.date), mealType: m.mealType as string, hasContent: m.menuId !== null || m._count.items > 0 })),
    iso(oldStart),
    iso(newStart),
    iso(newEnd),
    (m) => m.hasContent,
  );
  if (dropped.length > 0) await tx.mealPlanEntry.deleteMany({ where: { id: { in: dropped.map((m) => m.id) } } });
  // Furthest first in the direction of travel, so a meal never lands on a day another meal is still leaving.
  const later = iso(newStart) > iso(oldStart);
  const changes = moved.filter((m) => m.date !== m.fromDate).sort((a, b) => (later ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  for (const change of changes) await tx.mealPlanEntry.update({ where: { id: change.id }, data: { date: new Date(change.date) } });
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

export interface ChildPricingRates {
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
/**
 * Individual child rates apply when the method is Individual, or when the Individual Pricing switch is on and child rates were typed.
 * The form shows the child price boxes whenever the switch is on, so rates typed there count even if the method was left at Standard
 * (AJ, 2026-10-16). Orders from the storefront also have the switch on, but no typed child rates, so they keep pricing from the Menu.
 */
export function usesIndividualChildRates(order: { pricingMethod: PricingMethod; individualPricingEnabled: boolean; individualChildBelow5Rate: unknown; individualChild5To10Rate: unknown }): boolean {
  return order.pricingMethod === "INDIVIDUAL" || (order.individualPricingEnabled && (Number(order.individualChildBelow5Rate ?? 0) > 0 || Number(order.individualChild5To10Rate ?? 0) > 0));
}

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

export interface IndividualChildRates {
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
export function computeIndividualChildrenCharge(
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
export async function recalculateOrderTotals(orderId: string, db: Db = prisma) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { mealPlanEntries: { include: { items: true, menu: true } }, childPricingMenu: true },
  });

  // Meal amount (menu price x guests, or the typed price under Individual Pricing) plus Extra dishes and add-ons.
  const { mealsSubtotal } = priceMeals(
    order.mealPlanEntries.map((entry) => ({
      price: entry.price === null ? null : Number(entry.price),
      menuPricePerPlate: entry.menu ? Number(entry.menu.pricePerPlate) : null,
      items: entry.items.map((item) => ({ itemType: item.itemType, unitPrice: Number(item.unitPrice), quantity: item.quantity, isExtra: item.isExtra })),
    })),
    order.individualPricingEnabled,
    menuGuestCount(order),
  );
  const referenceMenuPrice = order.childPricingMenu ? Number(order.childPricingMenu.pricePerPlate) : 0;
  const childrenCharge =
    usesIndividualChildRates(order)
      ? computeIndividualChildrenCharge(order, referenceMenuPrice, order.childBelow5Count, order.child5To10Count)
      : computeChildrenCharge(order.childPricingMenu, order.childBelow5Count, order.child5To10Count);
  const subtotal = mealsSubtotal + childrenCharge;
  // A percentage is of the subtotal (meals + children); the rupee amount is stored so every other reader keeps using `discount` / `otherCharges`.
  const discount = order.discountMode === "PERCENTAGE" ? percentOf(subtotal, Number(order.discountRate)) : Number(order.discount);
  const otherCharges = order.otherChargesMode === "PERCENTAGE" ? percentOf(subtotal, Number(order.otherChargesRate)) : Number(order.otherCharges);
  const transportationCost = order.transportationMode === "PERCENTAGE" ? percentOf(subtotal, Number(order.transportationRate)) : Number(order.transportationCost);
  const customCharges = resolveCustomCharges(parseCustomCharges(order.customCharges), subtotal);
  const total = subtotal - discount + transportationCost + otherCharges + sumCustomCharges(customCharges);
  // Once an order has confirmed payments, they decide advance, balance and payment status (Chunk 14).
  const paid = await db.payment.aggregate({ where: { orderId, status: "CONFIRMED" }, _sum: { amount: true } });
  const confirmedPaid = Number(paid._sum.amount ?? 0);
  if (confirmedPaid > 0) {
    return db.order.update({
      where: { id: orderId },
      data: { subtotal, childrenCharge, discount, otherCharges, transportationCost, customCharges, total, advance: confirmedPaid, balance: total - confirmedPaid, paymentStatus: derivePaymentState(total, confirmedPaid) },
    });
  }
  const balance = total - Number(order.advance);

  return db.order.update({ where: { id: orderId }, data: { subtotal, childrenCharge, discount, otherCharges, transportationCost, customCharges, total, balance } });
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
export function deriveStandardChildPricingMenuId(entries: MealPlanEntryInput[] | undefined): string | null {
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  return sorted.find((e) => e.menuId)?.menuId ?? null;
}

export async function createOrder(organizationId: string, input: OrderInput, actorUserId?: string) {
  await assertWithinPlanLimit(organizationId, "maxOrders");
  validateOrderLike(input);
  await assertOwnedRefs(organizationId, { customerId: input.customerId, eventTypeId: input.eventTypeId });
  const orderKind = input.orderKind ?? "SINGLE";
  const pricingMethod = input.pricingMethod ?? "STANDARD";
  const childPricingMenuId = deriveStandardChildPricingMenuId(input.mealPlanEntries);
  const orderNumber = await nextOrderNumber(organizationId);
  const order = await prisma.order.create({
    data: {
      organizationId,
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      menuPreference: input.menuPreference,
      orderKind,
      orderNumber,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      venue: input.venue,
      eventAddress: input.eventAddress,
      venueType: input.venueType,
      vehicleAccess: input.vehicleAccess,
      venueAccessInstructions: input.venueAccessInstructions,
      venueDoorNumber: input.venueDoorNumber,
      venueTower: input.venueTower,
      venueFloor: input.venueFloor,
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
      individualPricingEnabled: input.individualPricingEnabled ?? false,
      discount: input.discount ?? 0,
      discountMode: input.discountMode ?? "FIXED",
      discountRate: input.discountRate ?? 0,
      otherChargesMode: input.otherChargesMode ?? "FIXED",
      otherChargesRate: input.otherChargesRate ?? 0,
      transportationCost: input.transportationCost ?? 0,
      transportationMode: input.transportationMode ?? "FIXED",
      transportationRate: input.transportationRate ?? 0,
      otherCharges: input.otherCharges ?? 0,
      customCharges: parseCustomCharges(input.customCharges),
      advance: input.advance ?? 0,
      paymentStatus: input.paymentStatus ?? "UNPAID",
      status: input.status ?? "PENDING_REVIEW",
      notes: input.notes,
      kitchenNotes: input.kitchenNotes,
      kitchenNotesUpdatedAt: input.kitchenNotes?.trim() ? new Date() : null,
      staffingNotes: input.staffingNotes,
    },
  });
  await replaceMealPlanEntries(organizationId, order.id, input.mealPlanEntries);
  if (input.venuePerEvent !== undefined) await applyEventVenues(prisma, order.id, { perEvent: input.venuePerEvent, events: input.eventVenues });
  const withTotals = await recalculateOrderTotals(order.id);

  await audit({
    organizationId,
    actorUserId,
    action: "order.create",
    recordType: "Order",
    recordId: order.id,
    after: JSON.parse(JSON.stringify(withTotals)),
  });
  await onOrderCreated(organizationId, order.id);

  return withTotals;
}

/**
 * Takes the row locks of the order's menu selections for the rest of the transaction and returns their statuses. Everything that
 * moves an approval (customer approves, team sends, recalls, hands off) takes the same lock first, so whoever comes second reads what
 * the first left behind. Empty for an order that has no menu selection yet.
 */
export async function lockOrderSelections(tx: Prisma.TransactionClient, organizationId: string, orderId: string) {
  return tx.$queryRaw<{ id: string; status: MenuSelectionStatus }[]>`
    SELECT ms."id", ms."status" FROM "menu_selection" ms JOIN "event" e ON e."id" = ms."eventId"
    WHERE e."orderId" = ${orderId} AND ms."organizationId" = ${organizationId} ORDER BY ms."id" FOR UPDATE OF ms`;
}

/**
 * The whole order save in the caller's transaction: the order fields, the meals (when given), the guest quantities, the totals and
 * the audit entry are written together or not at all. While the order's menu is with the customer, approved or with the kitchen a
 * real price-field change is refused (`PriceFrozenError`); the check happens after the menu's row lock is taken, in the same
 * transaction as the write, so an approval that lands a moment earlier is seen. An unchanged value is never a change.
 * Stock put back by a cancel waits in `afterCommit`.
 */
export async function updateOrderInTransaction(tx: Prisma.TransactionClient, afterCommit: AfterCommit, organizationId: string, id: string, input: OrderInput, actorUserId?: string) {
  validateOrderLike(input);
  await assertOwnedRefs(organizationId, { customerId: input.customerId, eventTypeId: input.eventTypeId });
  const selections = await lockOrderSelections(tx, organizationId, id);
  const before = await tx.order.findFirstOrThrow({ where: { id, organizationId } });
  // The authoritative kitchen lock: the order's status AND its menu approvals, read under the menu's row lock in this transaction.
  if (isKitchenLocked(before.status, selections.map((selection) => selection.status))) throw new OrderLockedError();
  // The kitchen hand-off and the kitchen's own progress are the only ways into Sent to Kitchen / Completed. A plain save can't write them.
  if (input.status !== undefined && input.status !== before.status && isOrderLocked(input.status)) throw new OrderLockedError();
  const priceFrozen = selections.some((selection) => isPriceFrozenStatus(selection.status));
  if (priceFrozen && priceFieldChanges(before, input).length > 0) throw new PriceFrozenError();
  // The customer, event and venue details are frozen with the price, so the page's read-only cards are enforced here too.
  if (priceFrozen) {
    const storedVenues = input.venuePerEvent && input.eventVenues ? await tx.orderEventVenue.findMany({ where: { orderId: id } }) : [];
    if (detailFieldChanges(before, input, storedVenues).length > 0) throw new DetailsFrozenError();
  }
  // orderNumber is intentionally absent here — assigned once at createOrder, never reassigned.
  const orderKind = input.orderKind ?? before.orderKind;
  const pricingMethod = input.pricingMethod ?? before.pricingMethod;
  // Meal plan left untouched (the order page shows it read-only; Menu Approvals edits it) keeps the derived child-pricing Menu.
  const childPricingMenuId = input.mealPlanEntries === undefined ? before.childPricingMenuId : deriveStandardChildPricingMenuId(input.mealPlanEntries);

  await tx.order.update({
    where: { id },
    data: {
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      menuPreference: input.menuPreference,
      orderKind,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      venue: input.venue,
      eventAddress: input.eventAddress,
      venueType: input.venueType,
      vehicleAccess: input.vehicleAccess,
      venueAccessInstructions: input.venueAccessInstructions,
      venueDoorNumber: input.venueDoorNumber,
      venueTower: input.venueTower,
      venueFloor: input.venueFloor,
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
      individualPricingEnabled: input.individualPricingEnabled ?? before.individualPricingEnabled,
      discount: input.discount ?? before.discount,
      discountMode: input.discountMode ?? before.discountMode,
      discountRate: input.discountRate ?? before.discountRate,
      otherChargesMode: input.otherChargesMode ?? before.otherChargesMode,
      otherChargesRate: input.otherChargesRate ?? before.otherChargesRate,
      transportationCost: input.transportationCost ?? before.transportationCost,
      transportationMode: input.transportationMode ?? before.transportationMode,
      transportationRate: input.transportationRate ?? before.transportationRate,
      otherCharges: input.otherCharges ?? before.otherCharges,
      ...(input.customCharges ? { customCharges: parseCustomCharges(input.customCharges) } : {}),
      advance: input.advance ?? before.advance,
      paymentStatus: input.paymentStatus ?? before.paymentStatus,
      status: input.status ?? before.status,
      notes: input.notes,
      kitchenNotes: input.kitchenNotes,
      staffingNotes: input.staffingNotes,
      // Only a real change moves the timestamp, so re-saving the order does not.
      ...(input.kitchenNotes !== undefined && (input.kitchenNotes.trim() || null) !== (before.kitchenNotes?.trim() || null) ? { kitchenNotesUpdatedAt: input.kitchenNotes.trim() ? new Date() : null } : {}),
    },
  });
  if (input.status === "CANCELLED" && before.status !== "CANCELLED") afterCommit.push(() => returnAllOrderItems(organizationId, id, actorUserId));
  await replaceMealPlanEntries(organizationId, id, input.mealPlanEntries, tx);
  // Meals the form did not send (the Menu Approval tab owns them) follow the event dates, so none is left on a day the event isn't on.
  if (input.mealPlanEntries === undefined) await moveMealsToEventDates(tx, id, before.eventStartDate, input.eventStartDate, input.eventEndDate);
  // One venue per event: checked against the meals the order has now (after they were saved or moved), and the order's own venue follows the first event.
  if (input.venuePerEvent !== undefined) await applyEventVenues(tx, id, { perEvent: input.venuePerEvent, events: input.eventVenues });
  const chargedGuests = input.adultCount ?? input.totalParticipants;
  const guestsChanged = input.adultCount !== undefined ? input.adultCount !== before.adultCount : input.totalParticipants !== before.totalParticipants;
  if (input.mealPlanEntries === undefined && chargedGuests !== undefined && (guestsChanged || !priceFrozen)) {
    // Extras and per-plate add-ons are charged for every adult (the Menu's guests), so a new adult count moves their quantity. While the price is still open any save
    // also brings the quantity into line with the guest count, so an order whose count changed by another route can't keep a stale total.
    await tx.orderItem.updateMany({
      where: { orderId: id, mealPlanEntryId: { not: null }, OR: [{ isExtra: true }, { itemType: "ADD_ON", quantity: { gt: 1 } }] },
      data: { quantity: Math.max(chargedGuests ?? 0, 1) },
    });
  }
  const withTotals = await recalculateOrderTotals(id, tx);

  await audit({
    organizationId,
    actorUserId,
    action: "order.update",
    recordType: "Order",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(withTotals)),
  }, tx);

  return withTotals;
}

export async function updateOrder(organizationId: string, id: string, input: OrderInput, actorUserId?: string) {
  const afterCommit: AfterCommit = [];
  const updated = await prisma.$transaction((tx) => updateOrderInTransaction(tx, afterCommit, organizationId, id, input, actorUserId), { timeout: 20_000 });
  await runAfterCommit(afterCommit);
  return updated;
}

/** Hard delete — items/mealPlanEntries cascade; any linked Event just gets orderId unset (SetNull), not deleted. */
export async function deleteOrder(organizationId: string, id: string, actorUserId: string) {
  // One transaction, locks in the strategy's order (menu approvals, then the order): the eligibility check, the stock coming back and
  // the delete stand or fall together. A hand-off that lands first makes the check refuse and nothing is touched; a delete that fails
  // part way (a later statement, a constraint) rolls the returned stock back with it. A Cancelled order that never reached the
  // kitchen can still be removed; anything with the kitchen can't.
  const before = await prisma.order.findFirstOrThrow({ where: { id, organizationId } });
  const expenseFiles = await prisma.expenseAttachment.findMany({ where: { expense: { orderId: id } }, select: { key: true } });
  await prisma.$transaction(
    async (tx) => {
      const state = await lockAndReadOrder(tx, organizationId, id, { alsoLockOrder: true });
      if (!state) throw new ValidationError("Order not found.");
      if (isOrderLocked(state.orderStatus) || state.selections.some((s) => s.status === "FINAL_LOCKED" && s.stage !== "CANCELLED")) throw new OrderLockedError();
      await returnAllOrderItemsInTransaction(tx, organizationId, id, actorUserId);
      await tx.order.delete({ where: { id } });
    },
    { timeout: 20_000 },
  );
  // The DB removed the order's expenses and their attachment rows; their stored files need removing by hand (after the commit).
  await deleteStoredFiles(expenseFiles.map((f) => f.key));

  await audit({
    organizationId,
    actorUserId,
    action: "order.delete",
    recordType: "Order",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export type OrderListWhen = "upcoming" | "past";

export interface OrderListFilter {
  /** Chunk 23: only orders with an event at this location. Null/omitted = all locations. */
  locationId?: string | null;
  status?: OrderStatus;
  orderKind?: OrderKind;
  eventTypeId?: string;
  search?: string;
  /** Menu approval status, or "NOT_STARTED" for an order with no approval (Phase 3 of the Menu Approvals + Orders merge). */
  approval?: ApprovalFilter;
  /** Event dates, "YYYY-MM-DD" both ends included: orders whose event overlaps these days (the Orders page's date range). */
  eventFrom?: string;
  eventTo?: string;
  /** Only open orders with approval work outstanding (Decision 9). Used with `when: "past"` for the Orders page's Past view. */
  outstandingApproval?: boolean;
  /**
   * "upcoming" = the event is not over yet, whatever the status (cancelled ones included); "past" =
   * the event is over. "Over" means the last day of the event (`eventEndDate`, so a multi-day order
   * counts by its last day) is before today (UTC, like the calendar and countdowns). AJ, 2026-09-30:
   * the Orders page shows upcoming only; past orders live in the customer's order history.
   * Omitted = all, so callers like the global search still see everything.
   */
  when?: OrderListWhen;
  /** Caps the result count (e.g. the Dashboard's global search bar) — omitted for the full Orders list. */
  take?: number;
}

function whenWhere(when: OrderListWhen | undefined): Prisma.OrderWhereInput {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (when === "upcoming") return { eventEndDate: { gte: today } };
  if (when === "past") return { eventEndDate: { lt: today } };
  return {};
}

export async function listOrders(organizationId: string, filter?: OrderListFilter) {
  return prisma.order.findMany({
    where: {
      organizationId,
      // In the AND list so these `events` fragments never collide with the location filter's own `events` key below.
      AND: [
        whenWhere(filter?.when),
        approvalWhere(filter?.approval),
        ...(filter?.outstandingApproval ? [outstandingApprovalWhere()] : []),
        // Event dates are stored as UTC midnight of their day, so a day compares as that instant.
        ...(filter?.eventFrom ? [{ eventEndDate: { gte: new Date(`${filter.eventFrom}T00:00:00.000Z`) } }] : []),
        ...(filter?.eventTo ? [{ eventStartDate: { lte: new Date(`${filter.eventTo}T00:00:00.000Z`) } }] : []),
      ],
      ...(filter?.locationId ? { events: { some: { assignedKitchenId: filter.locationId } } } : {}),
      status: filter?.status,
      orderKind: filter?.orderKind,
      eventTypeId: filter?.eventTypeId,
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

/**
 * Finance's Overdue Payments list (AJ, 2026-10-12): the same rule as `isPaymentOverdue` (Unpaid or Partially Paid,
 * event over by India's calendar, not cancelled), oldest event first so the longest-waiting money is on top.
 */
export async function listOverdueOrders(organizationId: string, locationId?: string | null, now = new Date()) {
  const timeZone = await getTenantTimeZone(organizationId);
  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      ...orderAt(locationId),
      status: { not: "CANCELLED" },
      paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
      eventEndDate: { lt: tenantTodayStart(now, timeZone) },
    },
    orderBy: { eventEndDate: "asc" },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      advance: true,
      eventStartDate: true,
      eventEndDate: true,
      venue: true,
      customer: { select: { name: true, phone: true } },
      eventType: { select: { name: true } },
    },
  });
  const today = tenantTodayStart(now, timeZone).getTime();
  return orders.map((o) => {
    const total = Number(o.total);
    const paid = Math.min(Number(o.advance), total);
    return { ...o, total, paid, balance: Math.max(total - paid, 0), daysOverdue: Math.round((today - o.eventEndDate.getTime()) / 86_400_000) };
  });
}

/** Feeds the Dashboard's Partial Payments card — mirrors getInventoryOverviewStats' shape/purpose for its own domain. */
export async function getPartialPaymentsOverview(organizationId: string, locationId?: string | null) {
  const orders = await prisma.order.findMany({
    where: { organizationId, ...orderAt(locationId), status: { not: "CANCELLED" }, paymentStatus: { in: ["PARTIALLY_PAID", "UNPAID"] }, balance: { gt: 0 } },
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
      eventVenues: true,
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
/**
 * Keeps an Order's Event in step with it (AJ, 2026-09-27): the Event is no
 * longer something to "create" by hand. Saving an Order with an Event Type
 * creates its Event if it has none; if it has one, the fields the Order
 * owns (type, dates, venue, guest count, customer) are copied across. The
 * Event's own operational fields (kitchen, status, required inventory) are
 * never touched here. No Event Type yet means no Event yet, which is fine.
 */
export async function syncOrderEvent(organizationId: string, orderId: string, actorUserId?: string, locationId?: string | null) {
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId } });
  if (!order.eventTypeId) return null;
  // The check and the create are one transaction under the order's row lock, so two saves at once make one Event, not two.
  const created = await prisma.$transaction(
    async (tx) => {
      await lockOrderRow(tx, organizationId, orderId);
      const linked = await tx.event.findMany({ where: { organizationId, orderId }, select: { id: true } });
      return linked.length === 0 ? createEventForOrder(organizationId, orderId, actorUserId, locationId, tx) : null;
    },
    { timeout: 20_000 },
  );
  if (created) return created;
  await prisma.event.updateMany({
    where: { organizationId, orderId },
    data: {
      customerId: order.customerId,
      eventTypeId: order.eventTypeId,
      startDate: order.eventStartDate,
      endDate: order.eventEndDate,
      venue: order.venue,
      guestCount: order.totalParticipants,
    },
  });
  return null;
}

/** `locationId` puts the event at that location (a person held to one); without it the default location is used. */
export async function createEventForOrder(organizationId: string, orderId: string, actorUserId?: string, locationId?: string | null, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const order = await db.order.findFirstOrThrow({ where: { id: orderId, organizationId }, include: { customer: true } });
  if (!order.eventTypeId) {
    throw new OrderEventTypeRequiredError("Set an Event Type on this Order before creating an Event for it.");
  }

  // Chunk 23: a new event lands in the default location; the team can move it on the order page.
  const [defaultLocation] = await listKitchens(organizationId);
  const event = await createEvent(
    organizationId,
    {
      assignedKitchenId: locationId ?? defaultLocation?.id,
      customerId: order.customerId,
      eventTypeId: order.eventTypeId,
      name: `${order.customer.name}'s Event`,
      startDate: order.eventStartDate,
      endDate: order.eventEndDate,
      venue: order.venue ?? undefined,
      guestCount: order.totalParticipants ?? undefined,
    },
    actorUserId,
    db,
  );

  const linked = await db.event.update({ where: { id: event.id }, data: { orderId } });

  await audit(
    {
      organizationId,
      actorUserId,
      action: "order.event_created",
      recordType: "Order",
      recordId: orderId,
      after: { eventId: event.id },
    },
    db,
  );

  return linked;
}

/**
 * Takes the order's row lock for the rest of the transaction. Whatever creates an order's Event or approval, or its invoice, does
 * so under this lock after checking again that it is still needed, so two requests at once cannot both create it.
 */
export async function lockOrderRow(tx: Prisma.TransactionClient, organizationId: string, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderId} AND "organizationId" = ${organizationId} FOR UPDATE`;
}
