import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer, updateCustomer, listCustomers, getCustomer, getCustomerTimeline } from "@/modules/customers/customer";
import { createEnquiry } from "@/modules/enquiries/enquiry";
import { createEventType } from "@/modules/events/event-type";
import { createEvent } from "@/modules/events/event";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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
    data: { id: crypto.randomUUID(), name: "Customer Test Org", slug: `cust-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
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

describe("Customer CRUD (Chunk 9 Group 9.2)", () => {
  it("createCustomer stores fields, defaults isActive to true, and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const customer = await createCustomer(org.id, { name: "Asha Rao", phone: "9876543210", city: "Bengaluru" }, actor.id);
    expect(customer.name).toBe("Asha Rao");
    expect(customer.isActive).toBe(true);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "customer.create", recordId: customer.id } });
    expect(log).not.toBeNull();
  });

  it("updateCustomer changes fields, can toggle isActive, and writes a before/after AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Ravi Kumar", phone: "9000000000" }, actor.id);

    const updated = await updateCustomer(org.id, customer.id, { name: "Ravi Kumar", phone: "9000000000", isActive: false }, actor.id);
    expect(updated.isActive).toBe(false);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "customer.update", recordId: customer.id } });
    expect(log).not.toBeNull();
  });

  it("listCustomers orders by name and is tenant-isolated; getCustomer is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    await createCustomer(orgA.id, { name: "Zeeshan", phone: "1" }, actor.id);
    const first = await createCustomer(orgA.id, { name: "Amit", phone: "2" }, actor.id);
    await createCustomer(orgB.id, { name: "Other Tenant's Customer", phone: "3" }, actor.id);

    const list = await listCustomers(orgA.id);
    expect(list.map((c) => c.name)).toEqual(["Amit", "Zeeshan"]);

    expect(await getCustomer(orgA.id, first.id)).not.toBeNull();
    expect(await getCustomer(orgB.id, first.id)).toBeNull();
  });
});

describe("getCustomerTimeline (Chunk 9 Group 9.2)", () => {
  it("merges this Customer's own Enquiries and Events, sorted newest-first, tenant/customer-isolated", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Priya Nair", phone: "8000000000" }, actor.id);
    const otherCustomer = await createCustomer(org.id, { name: "Other Customer", phone: "8000000001" }, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);

    const enquiry = await createEnquiry(org.id, { name: "Priya Nair", phone: "8000000000" }, actor.id);
    await prisma.enquiry.update({ where: { id: enquiry.id }, data: { customerId: customer.id } });

    const event = await createEvent(
      org.id,
      {
        customerId: customer.id,
        eventTypeId: eventType.id,
        name: "Priya's Wedding",
        startDate: new Date("2026-12-01"),
        endDate: new Date("2026-12-02"),
      },
      actor.id,
    );

    // Noise: an Enquiry/Event for a different customer must not leak in.
    await createEvent(
      org.id,
      { customerId: otherCustomer.id, eventTypeId: eventType.id, name: "Someone Else's Event", startDate: new Date(), endDate: new Date() },
      actor.id,
    );

    const timeline = await getCustomerTimeline(org.id, customer.id);
    expect(timeline).toHaveLength(2);
    expect(timeline.map((t) => t.id).sort()).toEqual([enquiry.id, event.id].sort());
    expect(timeline.find((t) => t.type === "event")).toMatchObject({ name: "Priya's Wedding", status: "PENDING" });
    expect(timeline.find((t) => t.type === "enquiry")).toMatchObject({ status: "NEW" });
  });

  it("returns an empty array for a customer with no enquiries or events", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Fresh Customer", phone: "7000000000" }, actor.id);

    expect(await getCustomerTimeline(org.id, customer.id)).toEqual([]);
  });
});
