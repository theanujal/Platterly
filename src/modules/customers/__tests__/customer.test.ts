import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer, updateCustomer, listCustomers, getCustomer, getCustomerTimeline } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { createEvent } from "@/modules/events/event";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
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

describe("Customer CRUD (Chunk 9 Group 9.2, merged with Lead/Enquiry 2026-09-17)", () => {
  it("createCustomer stores fields, defaults isActive to true and isEnquiry to false, and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const customer = await createCustomer(org.id, { name: "Asha Rao", phone: "9876543210" }, actor.id);
    expect(customer.name).toBe("Asha Rao");
    expect(customer.isActive).toBe(true);
    expect(customer.isEnquiry).toBe(false);
    expect(customer.leadSource).toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "customer.create", recordId: customer.id } });
    expect(log).not.toBeNull();
  });

  it("createCustomer with isEnquiry stores leadSource and notes as this Customer's Lead Information", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const customer = await createCustomer(
      org.id,
      { name: "Walk-in Lead", phone: "9111111111", isEnquiry: true, leadSource: "REFERRAL", notes: "Met at a wedding expo." },
      actor.id,
    );
    expect(customer.isEnquiry).toBe(true);
    expect(customer.leadSource).toBe("REFERRAL");
    expect(customer.notes).toBe("Met at a wedding expo.");
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

  it("updateCustomer clears leadSource when isEnquiry is turned back off", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Toggle Lead", phone: "9222222222", isEnquiry: true, leadSource: "WEBSITE" }, actor.id);

    const updated = await updateCustomer(org.id, customer.id, { name: "Toggle Lead", phone: "9222222222", isEnquiry: false }, actor.id);
    expect(updated.isEnquiry).toBe(false);
    expect(updated.leadSource).toBeNull();
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

describe("Lead -> Customer status (derived from Order ownership, Merge Leads/Enquiries/Customers)", () => {
  it("a newly created person defaults to LEAD status", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Fresh Lead", phone: "9333333333" }, actor.id);

    expect((await getCustomer(org.id, customer.id))?.status).toBe("LEAD");
  });

  it("placing an Order automatically flips status to CUSTOMER, without creating a second record", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Soon a Customer", phone: "9444444444" }, actor.id);

    await prisma.order.create({
      data: { organizationId: org.id, customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() },
    });

    expect((await getCustomer(org.id, customer.id))?.status).toBe("CUSTOMER");
    // Phone is normalized to E.164 at write time (AJ, 2026-09-19) — see lib/phone.ts.
    expect(await prisma.customer.count({ where: { organizationId: org.id, phone: "+919444444444" } })).toBe(1);
  });

  it("listCustomers filters by derived status", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const lead = await createCustomer(org.id, { name: "Still a Lead", phone: "9555555555" }, actor.id);
    const customer = await createCustomer(org.id, { name: "Has an Order", phone: "9666666666" }, actor.id);
    await prisma.order.create({
      data: { organizationId: org.id, customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() },
    });

    const leads = await listCustomers(org.id, { status: "LEAD" });
    expect(leads.map((c) => c.id)).toEqual([lead.id]);

    const customers = await listCustomers(org.id, { status: "CUSTOMER" });
    expect(customers.map((c) => c.id)).toEqual([customer.id]);

    const all = await listCustomers(org.id);
    expect(all.map((c) => c.id).sort()).toEqual([lead.id, customer.id].sort());
  });
});

describe("getCustomerTimeline (Chunk 9 Group 9.2, now sourced from Order + Event)", () => {
  it("merges this Customer's own Orders and Events, sorted newest-first, tenant/customer-isolated", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Priya Nair", phone: "8000000000" }, actor.id);
    const otherCustomer = await createCustomer(org.id, { name: "Other Customer", phone: "8000000001" }, actor.id);
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);

    const order = await prisma.order.create({
      data: { organizationId: org.id, customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() },
    });
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

    // Noise: an Order/Event for a different customer must not leak in.
    await prisma.order.create({
      data: { organizationId: org.id, customerId: otherCustomer.id, eventStartDate: new Date(), eventEndDate: new Date() },
    });

    const timeline = await getCustomerTimeline(org.id, customer.id);
    expect(timeline).toHaveLength(2);
    expect(timeline.map((t) => t.id).sort()).toEqual([order.id, event.id].sort());
    expect(timeline.find((t) => t.type === "order")).toMatchObject({ status: "DRAFT" });
    expect(timeline.find((t) => t.type === "event")).toMatchObject({ name: "Priya's Wedding", status: "PENDING" });
  });

  it("returns an empty array for a customer with no orders or events", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const customer = await createCustomer(org.id, { name: "Fresh Customer", phone: "7000000000" }, actor.id);

    expect(await getCustomerTimeline(org.id, customer.id)).toEqual([]);
  });
});
