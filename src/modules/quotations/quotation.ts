import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { notify } from "@/lib/notifications/notify";
import { issueToken, resolveToken } from "@/lib/secure-access/token";
import { canonicalUrl } from "@/lib/seo/canonical";
import { resolveCatalogItem, createOrder, type OrderItemCatalogInput } from "@/modules/orders/order";
import type { QuotationStatus } from "@/generated/prisma/enums";

export class InvalidQuotationTransitionError extends Error {}
export class QuotationEventDatesRequiredError extends Error {}

export interface QuotationInput {
  customerId: string;
  eventTypeId?: string | null;
  eventStartDate?: Date | null;
  eventEndDate?: Date | null;
  venue?: string;
  eventAddress?: string;
  validUntil?: Date | null;
  terms?: string;
  notes?: string;
  discount?: number;
  taxes?: number;
  additionalCharges?: number;
  deliveryCharges?: number;
  /** Full replacement of this Quotation's line items. */
  items?: OrderItemCatalogInput[];
}

async function replaceQuotationItems(organizationId: string, quotationId: string, items: OrderItemCatalogInput[] | undefined) {
  if (items === undefined) return;
  await prisma.quotationItem.deleteMany({ where: { quotationId } });
  if (items.length === 0) return;
  const resolved = await Promise.all(
    items.map(async (item) => ({
      quotationId,
      itemType: item.itemType,
      quantity: item.quantity,
      ...(await resolveCatalogItem(organizationId, item.itemType, item.catalogId)),
    })),
  );
  await prisma.quotationItem.createMany({ data: resolved });
}

/** The one place `subtotal`/`total` get computed for a Quotation — mirrors order.ts's `recalculateOrderTotals`. */
export async function recalculateQuotationTotals(quotationId: string) {
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { items: true } });

  const subtotal = quotation.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const total = subtotal - Number(quotation.discount) + Number(quotation.taxes) + Number(quotation.additionalCharges) + Number(quotation.deliveryCharges);

  return prisma.quotation.update({ where: { id: quotationId }, data: { subtotal, total } });
}

export async function createQuotation(organizationId: string, input: QuotationInput, actorUserId: string) {
  const quotation = await prisma.quotation.create({
    data: {
      organizationId,
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      venue: input.venue,
      eventAddress: input.eventAddress,
      validUntil: input.validUntil,
      terms: input.terms,
      notes: input.notes,
      discount: input.discount ?? 0,
      taxes: input.taxes ?? 0,
      additionalCharges: input.additionalCharges ?? 0,
      deliveryCharges: input.deliveryCharges ?? 0,
    },
  });
  await replaceQuotationItems(organizationId, quotation.id, input.items);
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

  await prisma.quotation.update({
    where: { id },
    data: {
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      venue: input.venue,
      eventAddress: input.eventAddress,
      validUntil: input.validUntil,
      terms: input.terms,
      notes: input.notes,
      discount: input.discount ?? before.discount,
      taxes: input.taxes ?? before.taxes,
      additionalCharges: input.additionalCharges ?? before.additionalCharges,
      deliveryCharges: input.deliveryCharges ?? before.deliveryCharges,
    },
  });
  await replaceQuotationItems(organizationId, id, input.items);
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

/** Hard delete — items cascade; nothing else references a Quotation with Restrict (Order.quotationId is SetNull). */
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

export async function listQuotations(organizationId: string, filter?: { status?: QuotationStatus }) {
  return prisma.quotation.findMany({
    where: { organizationId, status: filter?.status },
    include: { customer: { select: { id: true, name: true, phone: true } }, eventType: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuotation(organizationId: string, id: string) {
  return prisma.quotation.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      eventType: true,
      items: { orderBy: { createdAt: "asc" } },
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

  await notify({
    organizationId,
    channel: "WHATSAPP",
    event: "quotation.sent",
    recipient: { phone: quotation.customer.phone },
    payload: { quotationId: id, customerName: quotation.customer.name, url },
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

  return after;
}

export const acceptQuotation = (organizationId: string, id: string) => customerTransition(organizationId, id, "ACCEPTED", "quotation.accept");
export const rejectQuotation = (organizationId: string, id: string, message?: string) =>
  customerTransition(organizationId, id, "REJECTED", "quotation.reject", message);
export const requestQuotationChanges = (organizationId: string, id: string, message?: string) =>
  customerTransition(organizationId, id, "CHANGES_REQUESTED", "quotation.request_changes", message);

/**
 * Converts an Accepted Quotation into a real Order (Group 10.2's "generated
 * from an Accepted Quotation **or** created directly"). Copies each
 * QuotationItem's own frozen snapshot onto the new OrderItem rows directly
 * (never re-resolved from the live catalog) — an accepted quotation's price
 * must never silently drift from a later catalog change. Quotation's
 * additionalCharges/deliveryCharges (no Order equivalent) are folded into
 * the new Order's `taxes` so the converted total still matches exactly.
 */
export async function convertQuotationToOrder(organizationId: string, quotationId: string, actorUserId: string) {
  const quotation = await prisma.quotation.findFirstOrThrow({
    where: { id: quotationId, organizationId },
    include: { items: true },
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
      eventStartDate: quotation.eventStartDate,
      eventEndDate: quotation.eventEndDate,
      venue: quotation.venue ?? undefined,
      eventAddress: quotation.eventAddress ?? undefined,
      discount: Number(quotation.discount),
      taxes: Number(quotation.taxes) + Number(quotation.additionalCharges) + Number(quotation.deliveryCharges),
      notes: quotation.notes ?? undefined,
    },
    actorUserId,
  );

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

  const linkedOrder = await prisma.order.update({
    where: { id: order.id },
    data: { quotationId },
    include: { items: true, mealPlanEntries: true },
  });
  const subtotal = linkedOrder.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const total = subtotal - Number(linkedOrder.discount) + Number(linkedOrder.taxes);
  const finalOrder = await prisma.order.update({ where: { id: order.id }, data: { subtotal, total, balance: total } });

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
