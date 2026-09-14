import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { EnquiryLeadSource, EnquiryStatus } from "@/generated/prisma/enums";
import { createCustomer } from "@/modules/customers/customer";

export class AlreadyConvertedError extends Error {}

export interface EnquiryInput {
  name: string;
  phone: string;
  leadSource?: EnquiryLeadSource;
  status?: EnquiryStatus;
  eventTypeId?: string | null;
  eventDate?: Date | null;
  guestCount?: number | null;
  venue?: string;
  requirements?: string;
  budget?: number | null;
  preferredMenuId?: string | null;
  notes?: string;
}

export async function createEnquiry(organizationId: string, input: EnquiryInput, actorUserId: string) {
  const enquiry = await prisma.enquiry.create({
    data: {
      organizationId,
      name: input.name,
      phone: input.phone,
      leadSource: input.leadSource ?? "MANUAL_ENTRY",
      status: input.status ?? "NEW",
      eventTypeId: input.eventTypeId,
      eventDate: input.eventDate,
      guestCount: input.guestCount,
      venue: input.venue,
      requirements: input.requirements,
      budget: input.budget,
      preferredMenuId: input.preferredMenuId,
      notes: input.notes,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "enquiry.create",
    recordType: "Enquiry",
    recordId: enquiry.id,
    after: JSON.parse(JSON.stringify(enquiry)),
  });

  return enquiry;
}

export async function updateEnquiry(organizationId: string, id: string, input: EnquiryInput, actorUserId: string) {
  const before = await prisma.enquiry.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.enquiry.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone,
      leadSource: input.leadSource ?? before.leadSource,
      status: input.status ?? before.status,
      eventTypeId: input.eventTypeId,
      eventDate: input.eventDate,
      guestCount: input.guestCount,
      venue: input.venue,
      requirements: input.requirements,
      budget: input.budget,
      preferredMenuId: input.preferredMenuId,
      notes: input.notes,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "enquiry.update",
    recordType: "Enquiry",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/** Hard delete — nothing references Enquiry (Customer.enquiries is the reverse of Enquiry's own FK, not the other way around). */
export async function deleteEnquiry(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.enquiry.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.enquiry.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "enquiry.delete",
    recordType: "Enquiry",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listEnquiries(organizationId: string, filter?: { status?: EnquiryStatus }) {
  return prisma.enquiry.findMany({
    where: { organizationId, status: filter?.status },
    include: { eventType: { select: { name: true } }, customer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEnquiry(organizationId: string, id: string) {
  return prisma.enquiry.findFirst({
    where: { id, organizationId },
    include: { eventType: true, customer: true, preferredMenu: { select: { id: true, name: true } } },
  });
}

/**
 * Chunk 9's "Lead -> Customer -> Order -> Event" lifecycle step. Links to
 * `existingCustomerId` when given (the same person enquiring again);
 * otherwise creates a fresh Customer from the Enquiry's own name/phone.
 * Sets status to CONVERTED either way. `customerId`, once set, is never
 * cleared — re-converting an already-converted Enquiry is a no-op error,
 * not a silent re-link.
 */
export async function convertEnquiryToCustomer(
  organizationId: string,
  enquiryId: string,
  actorUserId: string,
  existingCustomerId?: string,
) {
  const enquiry = await prisma.enquiry.findFirstOrThrow({ where: { id: enquiryId, organizationId } });
  if (enquiry.customerId) {
    throw new AlreadyConvertedError("This Enquiry has already been converted to a Customer.");
  }

  const customer = existingCustomerId
    ? await prisma.customer.findFirstOrThrow({ where: { id: existingCustomerId, organizationId } })
    : await createCustomer(organizationId, { name: enquiry.name, phone: enquiry.phone }, actorUserId);

  const after = await prisma.enquiry.update({
    where: { id: enquiryId },
    data: { customerId: customer.id, status: "CONVERTED" },
  });

  await audit({
    organizationId,
    actorUserId,
    action: "enquiry.convert",
    recordType: "Enquiry",
    recordId: enquiryId,
    before: { customerId: enquiry.customerId, status: enquiry.status },
    after: { customerId: after.customerId, status: after.status },
  });

  return { enquiry: after, customer };
}
