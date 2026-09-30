import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { normalizePhone } from "@/lib/phone";
import type { EnquiryLeadSource } from "@/generated/prisma/enums";

export type CustomerStatus = "LEAD" | "CUSTOMER";

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  isActive?: boolean;
  isEnquiry?: boolean;
  leadSource?: EnquiryLeadSource | null;
}

export async function createCustomer(organizationId: string, input: CustomerInput, actorUserId?: string) {
  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name: input.name,
      phone: normalizePhone(input.phone),
      email: input.email,
      notes: input.notes,
      isActive: input.isActive ?? true,
      isEnquiry: input.isEnquiry ?? false,
      leadSource: input.isEnquiry ? (input.leadSource ?? "MANUAL_ENTRY") : null,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "customer.create",
    recordType: "Customer",
    recordId: customer.id,
    after: JSON.parse(JSON.stringify(customer)),
  });

  return customer;
}

export async function updateCustomer(organizationId: string, id: string, input: CustomerInput, actorUserId: string) {
  const before = await prisma.customer.findFirstOrThrow({ where: { id, organizationId } });
  const isEnquiry = input.isEnquiry ?? before.isEnquiry;

  const after = await prisma.customer.update({
    where: { id },
    data: {
      name: input.name,
      phone: normalizePhone(input.phone),
      email: input.email,
      notes: input.notes,
      isActive: input.isActive ?? before.isActive,
      isEnquiry,
      leadSource: isEnquiry ? (input.leadSource ?? before.leadSource ?? "MANUAL_ENTRY") : null,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "customer.update",
    recordType: "Customer",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/** Notes only, for the profile page's Notes box — leaves every other field untouched. Blank clears the notes. */
export async function updateCustomerNotes(organizationId: string, id: string, notes: string, actorUserId: string) {
  const before = await prisma.customer.findFirstOrThrow({ where: { id, organizationId } });
  const after = await prisma.customer.update({ where: { id }, data: { notes: notes.trim() === "" ? null : notes.trim() } });

  await audit({
    organizationId,
    actorUserId,
    action: "customer.update",
    recordType: "Customer",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/**
 * Hard delete, only for a customer with no history (AJ, 2026-09-30). Orders,
 * Quotations and Events reference Customer with `onDelete: Restrict`, and a
 * CRM record with real history shouldn't disappear outright (PRD §54's
 * audit-trail principle), so anyone with orders/quotations/events is refused
 * with a message pointing at the Inactive switch instead. Abandoned-order
 * drafts cascade with the customer.
 */
export async function deleteCustomer(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.customer.findFirstOrThrow({ where: { id, organizationId } });
  const [orders, quotations, events] = await Promise.all([
    prisma.order.count({ where: { organizationId, customerId: id } }),
    prisma.quotation.count({ where: { organizationId, customerId: id } }),
    prisma.event.count({ where: { organizationId, customerId: id } }),
  ]);
  const parts = [
    orders > 0 && `${orders} order${orders === 1 ? "" : "s"}`,
    quotations > 0 && `${quotations} quotation${quotations === 1 ? "" : "s"}`,
    events > 0 && `${events} event${events === 1 ? "" : "s"}`,
  ].filter(Boolean);
  if (parts.length > 0) {
    throw new Error(`${before.name} has ${parts.join(", ")}, so they can't be deleted. Mark them Inactive instead.`);
  }

  await prisma.customer.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "customer.delete",
    recordType: "Customer",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

/**
 * Lead vs Customer is derived from Order ownership, not a stored/synced
 * column — "at least one Order" is the one source of truth the merged Lead/
 * Customer workflow asks for, and deriving it at read time means it can
 * never drift out of sync with the Order table the way a persisted flag
 * updated only at order-creation time could.
 */
function statusOf(orderCount: number): CustomerStatus {
  return orderCount > 0 ? "CUSTOMER" : "LEAD";
}

export interface CustomerListFilter {
  status?: CustomerStatus;
  /** Name/phone substring match (Create Order's customer autocomplete). */
  search?: string;
  /** Caps the result count — used by the autocomplete, omitted for the full Customers list. */
  take?: number;
}

export async function listCustomers(organizationId: string, filter?: CustomerListFilter) {
  const customers = await prisma.customer.findMany({
    where: {
      organizationId,
      ...(filter?.status === "CUSTOMER" ? { orders: { some: {} } } : {}),
      ...(filter?.status === "LEAD" ? { orders: { none: {} } } : {}),
      ...(filter?.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: "insensitive" } },
              { phone: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { orders: true } },
      orders: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
    take: filter?.take,
  });

  return customers.map(({ _count, orders, ...customer }) => ({
    ...customer,
    status: statusOf(_count.orders),
    orderCount: _count.orders,
    lastOrderAt: orders[0]?.createdAt ?? null,
  }));
}

/**
 * Chunk 11 Group 11.2 — the anonymous public intake form's customer
 * identification step (no login, phone number only; see
 * `Customer.@@unique([organizationId, phone])`). Not exclusive to that flow,
 * but that's the reason it exists.
 */
export async function findCustomerByPhone(organizationId: string, phone: string) {
  return prisma.customer.findUnique({ where: { organizationId_phone: { organizationId, phone: normalizePhone(phone) } } });
}

export async function getCustomer(organizationId: string, id: string) {
  const customer = await prisma.customer.findFirst({ where: { id, organizationId }, include: { _count: { select: { orders: true } } } });
  if (!customer) return null;
  const { _count, ...rest } = customer;
  return { ...rest, status: statusOf(_count.orders) };
}

export type CustomerTimelineEntry =
  | { type: "order"; id: string; date: Date; status: string; orderNumber: string | null }
  | { type: "event"; id: string; date: Date; status: string; name: string };

/**
 * This Customer's own Orders and Events, merged and sorted newest-first, for
 * the profile page's timeline view — Order is what drives this Customer's
 * status (Lead -> Customer); Event was already shown here pre-merge and
 * still has real history worth showing (Invoice/Payment are later chunks).
 */
export async function getCustomerTimeline(organizationId: string, customerId: string): Promise<CustomerTimelineEntry[]> {
  const [orders, events] = await Promise.all([
    prisma.order.findMany({ where: { organizationId, customerId }, orderBy: { createdAt: "desc" } }),
    prisma.event.findMany({ where: { organizationId, customerId }, orderBy: { startDate: "desc" } }),
  ]);

  const entries: CustomerTimelineEntry[] = [
    ...orders.map((o) => ({ type: "order" as const, id: o.id, date: o.createdAt, status: o.status, orderNumber: o.orderNumber })),
    ...events.map((e) => ({ type: "event" as const, id: e.id, date: e.startDate, status: e.status, name: e.name })),
  ];

  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}
