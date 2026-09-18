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

/**
 * No hard-delete UI/action — a CRM record with a real Event/Order history
 * shouldn't disappear outright (PRD §54's audit-trail principle, same
 * rationale as Organization's own soft-only lifecycle). The Active checkbox
 * on `updateCustomer` is the only lifecycle control this chunk ships; a real
 * "merge duplicate customers" tool is out of scope here.
 */

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
}

export async function listCustomers(organizationId: string, filter?: CustomerListFilter) {
  const customers = await prisma.customer.findMany({
    where: {
      organizationId,
      ...(filter?.status === "CUSTOMER" ? { orders: { some: {} } } : {}),
      ...(filter?.status === "LEAD" ? { orders: { none: {} } } : {}),
    },
    include: { _count: { select: { orders: true } } },
    orderBy: { name: "asc" },
  });

  return customers.map(({ _count, ...customer }) => ({ ...customer, status: statusOf(_count.orders) }));
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
