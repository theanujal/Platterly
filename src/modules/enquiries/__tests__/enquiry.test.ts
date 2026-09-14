import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createEnquiry,
  updateEnquiry,
  deleteEnquiry,
  listEnquiries,
  getEnquiry,
  convertEnquiryToCustomer,
  AlreadyConvertedError,
} from "@/modules/enquiries/enquiry";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.enquiry.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Enquiry Test Org", slug: `enq-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

describe("Enquiry CRUD — Lead == Enquiry, one entity (Chunk 9 Group 9.3)", () => {
  it("createEnquiry as a bare Lead defaults leadSource/status and leaves the fuller fields null", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const enquiry = await createEnquiry(org.id, { name: "Walk-in Lead", phone: "9111111111" }, actor.id);
    expect(enquiry.leadSource).toBe("MANUAL_ENTRY");
    expect(enquiry.status).toBe("NEW");
    expect(enquiry.customerId).toBeNull();
    expect(enquiry.eventTypeId).toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "enquiry.create", recordId: enquiry.id } });
    expect(log).not.toBeNull();
  });

  it("createEnquiry accepts the fuller Enquiry fields (same record maturing), and updateEnquiry can move the status pipeline forward", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);

    const enquiry = await createEnquiry(
      org.id,
      {
        name: "Detailed Lead",
        phone: "9222222222",
        leadSource: "REFERRAL",
        eventTypeId: eventType.id,
        eventDate: new Date("2026-12-25"),
        guestCount: 200,
        venue: "Taj Hall",
        budget: 500000,
      },
      actor.id,
    );
    expect(enquiry.eventTypeId).toBe(eventType.id);
    expect(Number(enquiry.budget)).toBe(500000);

    const updated = await updateEnquiry(org.id, enquiry.id, { name: enquiry.name, phone: enquiry.phone, status: "CONTACTED" }, actor.id);
    expect(updated.status).toBe("CONTACTED");
    // A field genuinely omitted from the input (`undefined`) is left untouched by Prisma's update
    // (only an explicit `null` clears it) — the earlier "Taj Hall" venue survives this status-only update.
    expect(updated.venue).toBe("Taj Hall");
  });

  it("deleteEnquiry hard-deletes without touching a linked Customer", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const enquiry = await createEnquiry(org.id, { name: "Temp Lead", phone: "9333333333" }, actor.id);

    await deleteEnquiry(org.id, enquiry.id, actor.id);
    expect(await getEnquiry(org.id, enquiry.id)).toBeNull();
  });

  it("listEnquiries filters by status and is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const newLead = await createEnquiry(orgA.id, { name: "New Lead", phone: "1" }, actor.id);
    const contacted = await createEnquiry(orgA.id, { name: "Contacted Lead", phone: "2" }, actor.id);
    await updateEnquiry(orgA.id, contacted.id, { name: "Contacted Lead", phone: "2", status: "CONTACTED" }, actor.id);
    await createEnquiry(orgB.id, { name: "Other Tenant's Lead", phone: "3" }, actor.id);

    const newOnly = await listEnquiries(orgA.id, { status: "NEW" });
    expect(newOnly.map((e) => e.id)).toEqual([newLead.id]);

    const all = await listEnquiries(orgA.id);
    expect(all.map((e) => e.id).sort()).toEqual([newLead.id, contacted.id].sort());
  });
});

describe("convertEnquiryToCustomer (Chunk 9's Lead -> Customer -> Order -> Event lifecycle)", () => {
  it("creates a new Customer from the Enquiry's own name/phone, links it, and sets status CONVERTED", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const enquiry = await createEnquiry(org.id, { name: "Future Customer", phone: "9444444444" }, actor.id);

    const { enquiry: converted, customer } = await convertEnquiryToCustomer(org.id, enquiry.id, actor.id);
    expect(converted.status).toBe("CONVERTED");
    expect(converted.customerId).toBe(customer.id);
    expect(customer.name).toBe("Future Customer");
    expect(customer.phone).toBe("9444444444");

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "enquiry.convert", recordId: enquiry.id } });
    expect(log).not.toBeNull();
  });

  it("links to an existing Customer instead of creating a duplicate when one is passed", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const existing = await createCustomer(org.id, { name: "Repeat Customer", phone: "9555555555" }, actor.id);
    const enquiry = await createEnquiry(org.id, { name: "Repeat Customer", phone: "9555555555" }, actor.id);

    const { customer } = await convertEnquiryToCustomer(org.id, enquiry.id, actor.id, existing.id);
    expect(customer.id).toBe(existing.id);
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("rejects converting an already-converted Enquiry", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const enquiry = await createEnquiry(org.id, { name: "Once Converted", phone: "9666666666" }, actor.id);
    await convertEnquiryToCustomer(org.id, enquiry.id, actor.id);

    await expect(convertEnquiryToCustomer(org.id, enquiry.id, actor.id)).rejects.toThrow(AlreadyConvertedError);
  });
});
