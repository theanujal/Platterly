import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { notifyCustomer, onQuotationResponded } from "@/modules/notifications/triggers";
import { issueToken, resolveToken } from "@/lib/secure-access/token";
import { canonicalUrl } from "@/lib/seo/canonical";
import { menuGuestCount, priceMeals } from "@/modules/orders/meal-pricing";
import {
  resolveCatalogItem,
  createOrder,
  recalculateOrderTotals,
  computeChildrenCharge,
  computeIndividualChildrenCharge,
  deriveStandardChildPricingMenuId,
  type OrderItemCatalogInput,
  type MealPlanEntryInput,
} from "@/modules/orders/order";
import type { Prisma } from "@/generated/prisma/client";
import type { QuotationStatus, FoodType, OrderKind, PricingMethod, ChildPricingType } from "@/generated/prisma/enums";

export class InvalidQuotationTransitionError extends Error {}
export class QuotationEventDatesRequiredError extends Error {}

export interface QuotationInput {
  customerId: string;
  eventTypeId?: string | null;
  /** Vegetarian / Non-Vegetarian, same as Order's — filters which Menus and dishes are offered in the food-item drawer. */
  menuPreference?: FoodType | null;
  eventStartDate?: Date | null;
  eventEndDate?: Date | null;
  venue?: string;
  eventAddress?: string;
  /** SINGLE renders Meal Planning as one continuous event; MULTI groups the same per-day data into "Event 1/Event 2…" blocks — same meaning as Order's own. */
  orderKind?: OrderKind;
  adultCount?: number | null;
  childBelow5Count?: number | null;
  child5To10Count?: number | null;
  totalParticipants?: number | null;
  /**
   * STANDARD auto-derives childPricingMenuId from the first Meal Planning
   * entry's own assigned Menu (see deriveStandardChildPricingMenuId, shared
   * with Order); INDIVIDUAL uses the flat-or-percentage individualChild*
   * overrides below instead.
   */
  pricingMethod?: PricingMethod;
  individualChildBelow5Rate?: number | null;
  individualChildBelow5PricingType?: ChildPricingType | null;
  individualChild5To10Rate?: number | null;
  individualChild5To10PricingType?: ChildPricingType | null;
  /** When true, each MealPlanEntry's own `price` is added into `subtotal`; when false, meal selections are purely operational. */
  individualPricingEnabled?: boolean;
  validUntil?: Date | null;
  terms?: string;
  notes?: string;
  discount?: number;
  taxes?: number;
  additionalCharges?: number;
  deliveryCharges?: number;
  /** Sync (not blind replace — see replaceQuotationMealPlanEntries) of this Quotation's Meal Planning selections. */
  mealPlanEntries?: MealPlanEntryInput[];
}

/**
 * Replaces this entry's own scoped items (each meal's own Menu items) — a
 * narrow, slot-scoped delete-then-recreate, never touching another meal's
 * items. Mirrors order.ts's `replaceMealPlanEntryItems` exactly.
 */
async function replaceQuotationMealPlanEntryItems(organizationId: string, quotationId: string, mealPlanEntryId: string, items: OrderItemCatalogInput[]) {
  await prisma.quotationItem.deleteMany({ where: { mealPlanEntryId } });
  if (items.length === 0) return;
  const resolved = await Promise.all(
    items.map(async (item) => ({
      quotationId,
      mealPlanEntryId,
      itemType: item.itemType,
      quantity: item.quantity,
      isExtra: item.isExtra === true,
      ...(await resolveCatalogItem(organizationId, item.itemType, item.catalogId)),
    })),
  );
  await prisma.quotationItem.createMany({ data: resolved });
}

/**
 * Upsert-by-(date,mealType) sync, NOT a blind delete+recreate — mirrors
 * order.ts's `replaceMealPlanEntries` exactly, retargeted at
 * QuotationMealPlanEntry/QuotationItem. Existing (date, mealType) rows are
 * updated in place (id preserved) so their items don't cascade-delete on
 * every unrelated save; only genuinely removed slots are deleted.
 */
async function replaceQuotationMealPlanEntries(organizationId: string, quotationId: string, entries: MealPlanEntryInput[] | undefined) {
  if (entries === undefined) return;
  const existing = await prisma.quotationMealPlanEntry.findMany({ where: { quotationId } });
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
      ? (await prisma.quotationMealPlanEntry.update({ where: { id: match.id }, data: { price: entry.price, menuId } })).id
      : (await prisma.quotationMealPlanEntry.create({ data: { quotationId, date: entry.date, mealType: entry.mealType, price: entry.price, menuId } })).id;
    keepIds.add(entryId);

    await replaceQuotationMealPlanEntryItems(organizationId, quotationId, entryId, entry.items ?? []);
  }

  const toDelete = existing.filter((e) => !keepIds.has(e.id));
  if (toDelete.length > 0) {
    await prisma.quotationMealPlanEntry.deleteMany({ where: { id: { in: toDelete.map((e) => e.id) } } });
  }
}

/**
 * The one place `subtotal`/`total` get computed for a Quotation — mirrors
 * order.ts's `recalculateOrderTotals` formula exactly (itemsSubtotal +
 * mealsSubtotal-when-individualPricingEnabled + childrenCharge), except the
 * final charge line reuses Quotation's own 4 fields (discount/taxes/
 * additionalCharges/deliveryCharges) rather than Order's leaner set.
 */
export async function recalculateQuotationTotals(quotationId: string) {
  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { mealPlanEntries: { include: { items: true, menu: true } }, childPricingMenu: true },
  });

  const { mealsSubtotal } = priceMeals(
    quotation.mealPlanEntries.map((entry) => ({
      price: entry.price === null ? null : Number(entry.price),
      menuPricePerPlate: entry.menu ? Number(entry.menu.pricePerPlate) : null,
      items: entry.items.map((item) => ({ itemType: item.itemType, unitPrice: Number(item.unitPrice), quantity: item.quantity, isExtra: item.isExtra })),
    })),
    quotation.individualPricingEnabled,
    menuGuestCount(quotation),
  );
  const referenceMenuPrice = quotation.childPricingMenu ? Number(quotation.childPricingMenu.pricePerPlate) : 0;
  const childrenCharge =
    quotation.pricingMethod === "INDIVIDUAL"
      ? computeIndividualChildrenCharge(quotation, referenceMenuPrice, quotation.childBelow5Count, quotation.child5To10Count)
      : computeChildrenCharge(quotation.childPricingMenu, quotation.childBelow5Count, quotation.child5To10Count);
  const subtotal = mealsSubtotal + childrenCharge;
  const total = subtotal - Number(quotation.discount) + Number(quotation.taxes) + Number(quotation.additionalCharges) + Number(quotation.deliveryCharges);

  return prisma.quotation.update({ where: { id: quotationId }, data: { subtotal, childrenCharge, total } });
}

export async function createQuotation(organizationId: string, input: QuotationInput, actorUserId: string) {
  const orderKind = input.orderKind ?? "SINGLE";
  const pricingMethod = input.pricingMethod ?? "STANDARD";
  const childPricingMenuId = deriveStandardChildPricingMenuId(input.mealPlanEntries);

  const quotation = await prisma.quotation.create({
    data: {
      organizationId,
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      menuPreference: input.menuPreference,
      orderKind,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      venue: input.venue,
      eventAddress: input.eventAddress,
      adultCount: input.adultCount,
      childBelow5Count: input.childBelow5Count,
      child5To10Count: input.child5To10Count,
      totalParticipants: input.totalParticipants,
      childPricingMenuId,
      pricingMethod,
      individualChildBelow5Rate: input.individualChildBelow5Rate,
      individualChildBelow5PricingType: input.individualChildBelow5PricingType,
      individualChild5To10Rate: input.individualChild5To10Rate,
      individualChild5To10PricingType: input.individualChild5To10PricingType,
      individualPricingEnabled: input.individualPricingEnabled ?? false,
      validUntil: input.validUntil,
      terms: input.terms,
      notes: input.notes,
      discount: input.discount ?? 0,
      taxes: input.taxes ?? 0,
      additionalCharges: input.additionalCharges ?? 0,
      deliveryCharges: input.deliveryCharges ?? 0,
    },
  });
  await replaceQuotationMealPlanEntries(organizationId, quotation.id, input.mealPlanEntries);
  const withTotals = await recalculateQuotationTotals(quotation.id);

  await audit({
    organizationId,
    actorUserId,
    action: "quotation.create",
    recordType: "Quotation",
    recordId: quotation.id,
    after: JSON.parse(JSON.stringify(withTotals)),
  });

  return withTotals;
}

export async function updateQuotation(organizationId: string, id: string, input: QuotationInput, actorUserId: string) {
  const before = await prisma.quotation.findFirstOrThrow({ where: { id, organizationId } });
  const orderKind = input.orderKind ?? before.orderKind;
  const pricingMethod = input.pricingMethod ?? before.pricingMethod;
  const childPricingMenuId = deriveStandardChildPricingMenuId(input.mealPlanEntries);

  await prisma.quotation.update({
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
      adultCount: input.adultCount,
      childBelow5Count: input.childBelow5Count,
      child5To10Count: input.child5To10Count,
      totalParticipants: input.totalParticipants,
      childPricingMenuId,
      pricingMethod,
      individualChildBelow5Rate: input.individualChildBelow5Rate ?? before.individualChildBelow5Rate,
      individualChildBelow5PricingType: input.individualChildBelow5PricingType ?? before.individualChildBelow5PricingType,
      individualChild5To10Rate: input.individualChild5To10Rate ?? before.individualChild5To10Rate,
      individualChild5To10PricingType: input.individualChild5To10PricingType ?? before.individualChild5To10PricingType,
      individualPricingEnabled: input.individualPricingEnabled ?? before.individualPricingEnabled,
      validUntil: input.validUntil,
      terms: input.terms,
      notes: input.notes,
      discount: input.discount ?? before.discount,
      taxes: input.taxes ?? before.taxes,
      additionalCharges: input.additionalCharges ?? before.additionalCharges,
      deliveryCharges: input.deliveryCharges ?? before.deliveryCharges,
    },
  });
  await replaceQuotationMealPlanEntries(organizationId, id, input.mealPlanEntries);
  const withTotals = await recalculateQuotationTotals(id);

  await audit({
    organizationId,
    actorUserId,
    action: "quotation.update",
    recordType: "Quotation",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(withTotals)),
  });

  return withTotals;
}

/** Hard delete — items/mealPlanEntries cascade; nothing else references a Quotation with Restrict (Order.quotationId is SetNull). */
export async function deleteQuotation(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.quotation.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.quotation.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "quotation.delete",
    recordType: "Quotation",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

/**
 * "upcoming" hides quotations that are Expired or whose event is over (AJ, 2026-09-30): they live in
 * the customer's history only. Over = the event's last day (`eventEndDate`, else `eventStartDate`)
 * is before today (UTC); a quotation with no dates yet is never over. Omitted = all.
 */
/**
 * `excludeConverted` drops a Quotation once it has become an Order (AJ, 2026-09-30): from then on the Order is the
 * live record, so it shouldn't keep appearing in the Quotations list. The Quotation itself stays (the Order links back to it).
 */
export async function listQuotations(organizationId: string, filter?: { status?: QuotationStatus; when?: "upcoming"; excludeConverted?: boolean }) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const upcoming: Prisma.QuotationWhereInput[] =
    filter?.when === "upcoming"
      ? [
          { status: { not: "EXPIRED" } },
          { OR: [{ eventEndDate: { gte: today } }, { eventEndDate: null, eventStartDate: { gte: today } }, { eventEndDate: null, eventStartDate: null }] },
        ]
      : [];
  return prisma.quotation.findMany({
    where: { organizationId, status: filter?.status, ...(filter?.excludeConverted ? { order: null } : {}), AND: upcoming },
    include: { customer: { select: { id: true, name: true, phone: true } }, eventType: { select: { id: true, name: true, icon: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuotation(organizationId: string, id: string) {
  return prisma.quotation.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      eventType: true,
      mealPlanEntries: {
        orderBy: [{ date: "asc" }, { mealType: "asc" }],
        include: { menu: { select: { id: true, name: true } }, items: { orderBy: { createdAt: "asc" } } },
      },
      // Legacy/carried-over only (pre-parity artifacts) — mirrors getOrder's own split.
      items: { where: { mealPlanEntryId: null }, orderBy: { createdAt: "asc" } },
      childPricingMenu: { select: { id: true, name: true } },
      order: { select: { id: true } },
    },
  });
}

/**
 * Display-only past-validity check — never auto-mutates `status` to
 * EXPIRED (that stays an explicit admin action, `markQuotationExpired`).
 * Computed here rather than inline in a page's render body: `Date.now()`
 * is an impure call the React Compiler's purity rule flags inside a
 * component, even a Server Component re-evaluated fresh per request.
 */
export function isQuotationPastValidity(validUntil: Date | null): boolean {
  return validUntil !== null && validUntil.getTime() < Date.now();
}

const SENDABLE_STATUSES: QuotationStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

/**
 * Reuses a still-live (unexpired, unrevoked) `SecureAccessToken` for this
 * Quotation if one exists, rather than minting a new one on every call —
 * the admin detail page calls this on every render to *display* the link,
 * so a naive always-issue implementation would pile up an unbounded number
 * of live tokens for the same resource.
 */
export async function getOrIssueQuotationLink(organizationId: string, quotationId: string): Promise<string> {
  const existing = await prisma.secureAccessToken.findFirst({
    where: {
      organizationId,
      resourceType: "QUOTATION",
      resourceId: quotationId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  const token = existing ?? (await issueToken({ organizationId, resourceType: "QUOTATION", resourceId: quotationId }));
  // Public customer-facing path is `/quote/[token]`, deliberately distinct
  // from the admin `/quotations/[id]` route — Next.js App Router doesn't
  // allow two different dynamic-segment names ("id" vs "token") at the
  // same path depth, so this can't live at `/quotations/[token]`.
  return canonicalUrl(`/quote/${token.token}`);
}

/**
 * PRD §20's Draft -> Sent transition. Issues (or reuses, via a fresh
 * `SecureAccessToken`) the public approval link and sends it over the
 * Chunk 2.1 `notify()` driver — a real WhatsApp/email send lands in
 * Chunk 16. Also sendable again from CHANGES_REQUESTED, once the caterer
 * has edited the quotation in response.
 */
export async function sendQuotation(organizationId: string, id: string, actorUserId: string) {
  const quotation = await prisma.quotation.findFirstOrThrow({ where: { id, organizationId }, include: { customer: true } });
  if (!SENDABLE_STATUSES.includes(quotation.status)) {
    throw new InvalidQuotationTransitionError(`Cannot send a Quotation with status ${quotation.status}.`);
  }

  const url = await getOrIssueQuotationLink(organizationId, id);

  const after = await prisma.quotation.update({ where: { id }, data: { status: "SENT" } });

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  await notifyCustomer({
    organizationId,
    event: "quotation.sent",
    email: quotation.customer.email,
    phone: quotation.customer.phone,
    payload: {
      quotationId: id,
      kitchenName: org.name,
      customerName: quotation.customer.name,
      eventDate: quotation.eventStartDate?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
      amount: Number(after.total),
      url,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "quotation.send",
    recordType: "Quotation",
    recordId: id,
    before: { status: quotation.status },
    after: { status: after.status },
  });

  return { quotation: after, url };
}

/** Admin-only escalation, mirroring the codebase's existing owner-only-lifecycle convention (e.g. Organization's own status transitions). */
export async function markQuotationExpired(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.quotation.findFirstOrThrow({ where: { id, organizationId } });
  if (before.status === "ACCEPTED" || before.status === "REJECTED" || before.status === "EXPIRED") {
    throw new InvalidQuotationTransitionError(`Cannot mark a Quotation with status ${before.status} as Expired.`);
  }

  const after = await prisma.quotation.update({ where: { id }, data: { status: "EXPIRED" } });

  await audit({
    organizationId,
    actorUserId,
    action: "quotation.mark_expired",
    recordType: "Quotation",
    recordId: id,
    before: { status: before.status },
    after: { status: after.status },
  });

  return after;
}

// --- Public, token-based customer actions (PRD §20: "Customer can approve
// quotation digitally") — no session, no organizationId from the caller;
// both are resolved from the token itself, matching the public storefront's
// (Chunk 8) and every other secure-access consumer's own convention. ---

export interface ResolvedQuotationView {
  organizationId: string;
  quotationId: string;
}

export async function resolveQuotationToken(token: string): Promise<ResolvedQuotationView | null> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.resourceType !== "QUOTATION") return null;
  return { organizationId: resolved.organizationId, quotationId: resolved.resourceId };
}

/** Called on first customer view — Sent -> Viewed, idempotent past that point. */
export async function markQuotationViewed(organizationId: string, id: string) {
  const quotation = await prisma.quotation.findFirstOrThrow({ where: { id, organizationId } });
  if (quotation.status !== "SENT") return quotation;
  return prisma.quotation.update({ where: { id }, data: { status: "VIEWED" } });
}

const CUSTOMER_ACTIONABLE_STATUSES: QuotationStatus[] = ["SENT", "VIEWED"];

async function customerTransition(organizationId: string, id: string, status: QuotationStatus, action: string, customerMessage?: string) {
  const before = await prisma.quotation.findFirstOrThrow({ where: { id, organizationId } });
  if (!CUSTOMER_ACTIONABLE_STATUSES.includes(before.status)) {
    throw new InvalidQuotationTransitionError(`This Quotation can no longer be acted on (status: ${before.status}).`);
  }

  const after = await prisma.quotation.update({
    where: { id },
    data: { status, customerMessage: customerMessage ?? before.customerMessage },
  });

  // No `actorUserId` — these are customer-triggered, via the public token
  // page, never an authenticated app user.
  await audit({
    organizationId,
    action,
    recordType: "Quotation",
    recordId: id,
    before: { status: before.status },
    after: { status: after.status },
  });

  if (status === "ACCEPTED" || status === "REJECTED" || status === "CHANGES_REQUESTED") await onQuotationResponded(organizationId, id, status);

  return after;
}

export const acceptQuotation = (organizationId: string, id: string) => customerTransition(organizationId, id, "ACCEPTED", "quotation.accept");
export const rejectQuotation = (organizationId: string, id: string, message?: string) =>
  customerTransition(organizationId, id, "REJECTED", "quotation.reject", message);
export const requestQuotationChanges = (organizationId: string, id: string, message?: string) =>
  customerTransition(organizationId, id, "CHANGES_REQUESTED", "quotation.request_changes", message);

/**
 * Converts an Accepted Quotation into a real Order (Group 10.2's "generated
 * from an Accepted Quotation **or** created directly"). Item-picker parity
 * (2026-09-28) rewrote this to map each QuotationMealPlanEntry 1:1 onto a
 * real Order MealPlanEntry, instead of flattening everything into
 * whole-order items — a converted Order now has the identical per-day/
 * per-meal structure a natively-created one would. Every OrderItem copies
 * its QuotationItem's frozen snapshot directly (name/unitPrice/quantity),
 * never through `resolveCatalogItem` — an accepted quotation's price must
 * never silently drift from a later catalog change. Quotation's
 * taxes/additionalCharges/deliveryCharges (no direct Order equivalent since
 * Create Order's 2026-09-20 redesign dropped Order.taxes) are folded into
 * the new Order's `otherCharges` so the converted total still matches.
 */
export async function convertQuotationToOrder(organizationId: string, quotationId: string, actorUserId: string) {
  const quotation = await prisma.quotation.findFirstOrThrow({
    where: { id: quotationId, organizationId },
    include: {
      // Legacy/carried-over only — pre-parity artifacts left with no meal
      // slot. Dead weight for every Quotation created after this shipped.
      items: { where: { mealPlanEntryId: null }, orderBy: { createdAt: "asc" } },
      mealPlanEntries: {
        orderBy: [{ date: "asc" }, { mealType: "asc" }],
        include: { items: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (quotation.status !== "ACCEPTED") {
    throw new InvalidQuotationTransitionError("Only an Accepted Quotation can be converted to an Order.");
  }
  if (!quotation.eventStartDate || !quotation.eventEndDate) {
    throw new QuotationEventDatesRequiredError("Set this Quotation's Event Start/End Date before converting it to an Order.");
  }

  const order = await createOrder(
    organizationId,
    {
      customerId: quotation.customerId,
      eventTypeId: quotation.eventTypeId,
      menuPreference: quotation.menuPreference,
      orderKind: quotation.orderKind,
      eventStartDate: quotation.eventStartDate,
      eventEndDate: quotation.eventEndDate,
      venue: quotation.venue ?? undefined,
      eventAddress: quotation.eventAddress ?? undefined,
      adultCount: quotation.adultCount,
      childBelow5Count: quotation.childBelow5Count,
      child5To10Count: quotation.child5To10Count,
      totalParticipants: quotation.totalParticipants,
      pricingMethod: quotation.pricingMethod,
      individualChildBelow5Rate: quotation.individualChildBelow5Rate === null ? null : Number(quotation.individualChildBelow5Rate),
      individualChildBelow5PricingType: quotation.individualChildBelow5PricingType,
      individualChild5To10Rate: quotation.individualChild5To10Rate === null ? null : Number(quotation.individualChild5To10Rate),
      individualChild5To10PricingType: quotation.individualChild5To10PricingType,
      individualPricingEnabled: quotation.individualPricingEnabled,
      discount: Number(quotation.discount),
      otherCharges: Number(quotation.taxes) + Number(quotation.additionalCharges) + Number(quotation.deliveryCharges),
      notes: quotation.notes ?? undefined,
      // mealPlanEntries deliberately omitted — createOrder's own
      // replaceMealPlanEntries no-ops on undefined, so this just creates the
      // Order shell; the real structure is written directly below so each
      // OrderItem copies its QuotationItem snapshot untouched.
    },
    actorUserId,
  );

  for (const entry of quotation.mealPlanEntries) {
    const mealPlanEntry = await prisma.mealPlanEntry.create({
      data: { orderId: order.id, date: entry.date, mealType: entry.mealType, price: entry.price, menuId: entry.menuId },
    });
    if (entry.items.length > 0) {
      await prisma.orderItem.createMany({
        data: entry.items.map((item) => ({
          orderId: order.id,
          mealPlanEntryId: mealPlanEntry.id,
          itemType: item.itemType,
          menuId: item.menuId,
          menuItemId: item.menuItemId,
          addOnId: item.addOnId,
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          isExtra: item.isExtra,
        })),
      });
    }
  }

  if (quotation.items.length > 0) {
    await prisma.orderItem.createMany({
      data: quotation.items.map((item) => ({
        orderId: order.id,
        itemType: item.itemType,
        menuId: item.menuId,
        menuItemId: item.menuItemId,
        addOnId: item.addOnId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    });
  }

  // childPricingMenuId re-derived over the real written structure (createOrder's
  // own derivation saw `undefined` mealPlanEntries above and returned null).
  const childPricingMenuId = deriveStandardChildPricingMenuId(
    quotation.mealPlanEntries.map((entry) => ({ date: entry.date, mealType: entry.mealType, menuId: entry.menuId })),
  );
  await prisma.order.update({ where: { id: order.id }, data: { quotationId, childPricingMenuId } });
  const finalOrder = await recalculateOrderTotals(order.id);

  await audit({
    organizationId,
    actorUserId,
    action: "quotation.convert_to_order",
    recordType: "Quotation",
    recordId: quotationId,
    after: { orderId: order.id },
  });

  return finalOrder;
}
