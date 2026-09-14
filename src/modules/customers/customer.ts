import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  notes?: string;
  isActive?: boolean;
}

export async function createCustomer(organizationId: string, input: CustomerInput, actorUserId: string) {
  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      addressLine1: input.addressLine1,
      city: input.city,
      state: input.state,
      notes: input.notes,
      isActive: input.isActive ?? true,
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

  const after = await prisma.customer.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      addressLine1: input.addressLine1,
      city: input.city,
      state: input.state,
      notes: input.notes,
      isActive: input.isActive ?? before.isActive,
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
 * No hard-delete UI/action — a CRM record with a real Enquiry/Event
 * history shouldn't disappear outright (PRD §54's audit-trail principle,
 * same rationale as Organization's own soft-only lifecycle). The Active
 * checkbox on `updateCustomer` is the only lifecycle control this chunk
 * ships; a real "merge duplicate customers" tool is out of scope here.
 */

export async function listCustomers(organizationId: string) {
  return prisma.customer.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getCustomer(organizationId: string, id: string) {
  return prisma.customer.findFirst({ where: { id, organizationId } });
}

export type CustomerTimelineEntry =
  | { type: "enquiry"; id: string; date: Date; status: string; eventTypeName: string | null }
  | { type: "event"; id: string; date: Date; status: string; name: string };

/**
 * Chunk 9 Group 9.2's "timeline view (populated as later chunks add data)"
 * — for now just this Customer's own Enquiries and Events, merged and
 * sorted newest-first. No separate Activity/log table: nothing else writes
 * customer-facing timeline entries yet, and inventing one ahead of a real
 * second source (Order/Invoice/Payment, Chunk 10/14) would be speculative.
 */
export async function getCustomerTimeline(organizationId: string, customerId: string): Promise<CustomerTimelineEntry[]> {
  const [enquiries, events] = await Promise.all([
    prisma.enquiry.findMany({
      where: { organizationId, customerId },
      include: { eventType: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.event.findMany({
      where: { organizationId, customerId },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const entries: CustomerTimelineEntry[] = [
    ...enquiries.map((e) => ({
      type: "enquiry" as const,
      id: e.id,
      date: e.createdAt,
      status: e.status,
      eventTypeName: e.eventType?.name ?? null,
    })),
    ...events.map((e) => ({
      type: "event" as const,
      id: e.id,
      date: e.startDate,
      status: e.status,
      name: e.name,
    })),
  ];

  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}
