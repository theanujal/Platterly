import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { purgeTenantData, ConfirmationMismatchError } from "../purge";
import { ensureTrialPlan } from "@/modules/subscriptions/trial-plan";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  // Deliberately NOT relying on the purge itself for cleanup — some tests
  // assert it did nothing. Cascade from Organization handles everything
  // except the exempt models, which are cleaned up explicitly.
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function seedFullTenant() {
  const owner = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: "Purge Test Owner",
      email: `purge-owner-${crypto.randomUUID()}@example.test`,
      emailVerified: true,
    },
  });
  cleanupUserIds.push(owner.id);

  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: "Purge Test Co",
      slug: `purge-${crypto.randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
      createdAt: new Date(),
    },
  });
  cleanupOrgIds.push(org.id);

  const member = await prisma.member.create({
    data: { id: crypto.randomUUID(), organizationId: org.id, userId: owner.id, role: "owner", createdAt: new Date() },
  });

  const trialPlan = await ensureTrialPlan();
  const subscription = await prisma.subscription.create({
    data: { organizationId: org.id, subscriptionPlanId: trialPlan.id, status: "TRIALING" },
  });

  await prisma.invitation.create({
    data: {
      id: crypto.randomUUID(),
      organizationId: org.id,
      email: "invitee@example.test",
      role: "staff",
      expiresAt: new Date(Date.now() + 86400000),
      inviterId: owner.id,
    },
  });
  const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "Main Branch" } });
  await prisma.kitchen.create({ data: { organizationId: org.id, branchId: branch.id, name: "Main Kitchen" } });
  await prisma.store.create({ data: { organizationId: org.id, branchId: branch.id, name: "Main Store" } });
  await prisma.notification.create({
    data: { organizationId: org.id, channel: "EMAIL", event: "test.event", payload: {} },
  });
  await prisma.whatsAppMessage.create({
    data: { organizationId: org.id, toPhone: "+911234567890", body: "test" },
  });
  await prisma.secureAccessToken.create({
    data: { organizationId: org.id, resourceType: "QUOTATION", resourceId: "q1", token: crypto.randomUUID() },
  });
  await prisma.tenantSetting.create({ data: { organizationId: org.id, key: "test.key", value: "test-value" } });

  return { org, owner, member, subscription };
}

async function countRowsByOrg(organizationId: string) {
  return {
    invitation: await prisma.invitation.count({ where: { organizationId } }),
    branch: await prisma.branch.count({ where: { organizationId } }),
    kitchen: await prisma.kitchen.count({ where: { organizationId } }),
    store: await prisma.store.count({ where: { organizationId } }),
    notification: await prisma.notification.count({ where: { organizationId } }),
    whatsAppMessage: await prisma.whatsAppMessage.count({ where: { organizationId } }),
    secureAccessToken: await prisma.secureAccessToken.count({ where: { organizationId } }),
    tenantSetting: await prisma.tenantSetting.count({ where: { organizationId } }),
    member: await prisma.member.count({ where: { organizationId } }),
    subscription: await prisma.subscription.count({ where: { organizationId } }),
    auditLog: await prisma.auditLog.count({ where: { organizationId } }),
  };
}

describe("purgeTenantData (Chunk 5 Group 5.4 Danger Zone)", () => {
  it("wipes every purged model, keeps the Organization and exempt models, and writes one audit entry that survives", async () => {
    const { org, owner } = await seedFullTenant();
    const before = await countRowsByOrg(org.id);
    expect(before.invitation).toBe(1);
    expect(before.branch).toBe(1);
    expect(before.member).toBe(1);
    expect(before.subscription).toBe(1);

    await purgeTenantData(org.id, owner.id, "DELETE");

    const stillExists = await prisma.organization.findUnique({ where: { id: org.id } });
    expect(stillExists).not.toBeNull();

    const after = await countRowsByOrg(org.id);
    expect(after.invitation).toBe(0);
    expect(after.branch).toBe(0);
    expect(after.kitchen).toBe(0);
    expect(after.store).toBe(0);
    expect(after.notification).toBe(0);
    expect(after.whatsAppMessage).toBe(0);
    expect(after.secureAccessToken).toBe(0);
    expect(after.tenantSetting).toBe(0);

    // Exempt models survive.
    expect(after.member).toBe(1);
    expect(after.subscription).toBe(1);
    expect(after.auditLog).toBe(1);

    const purgeLog = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "tenant.data_purge" } });
    expect(purgeLog).not.toBeNull();
    expect(purgeLog!.actorUserId).toBe(owner.id);
  });

  it("a wrong confirmation string throws and deletes nothing", async () => {
    const { org, owner } = await seedFullTenant();
    const before = await countRowsByOrg(org.id);

    await expect(purgeTenantData(org.id, owner.id, "delete")).rejects.toThrow(ConfirmationMismatchError);
    await expect(purgeTenantData(org.id, owner.id, "")).rejects.toThrow(ConfirmationMismatchError);

    const after = await countRowsByOrg(org.id);
    expect(after).toEqual(before);

    const purgeLog = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "tenant.data_purge" } });
    expect(purgeLog).toBeNull();
  });

  it("purges Event/EventType/Customer/Inventory together with no FK-order failure (Chunk 9's Restrict relations)", async () => {
    const { org, owner } = await seedFullTenant();

    const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
    const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Asha Rao", phone: "9876543210" } });
    const inventory = await prisma.inventory.create({ data: { organizationId: org.id, name: "Rice", category: "Grains", unit: "kg" } });
    const event = await prisma.event.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        eventTypeId: eventType.id,
        name: "Asha's Wedding",
        startDate: new Date(),
        endDate: new Date(),
      },
    });
    await prisma.eventRequiredInventory.create({ data: { eventId: event.id, inventoryId: inventory.id, quantity: 10 } });
    await prisma.enquiry.create({ data: { organizationId: org.id, name: "Asha Rao", phone: "9876543210", customerId: customer.id } });
    // Chunk 10 — Order.customerId is also onDelete: Restrict; "order" must
    // precede "customer" in TENANT_SCOPED_DELEGATES the same way "event" does.
    const order = await prisma.order.create({
      data: { organizationId: org.id, customerId: customer.id, eventStartDate: new Date(), eventEndDate: new Date() },
    });

    await purgeTenantData(org.id, owner.id, "DELETE");

    expect(await prisma.event.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.eventType.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.inventory.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.enquiry.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.order.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.eventRequiredInventory.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(0);
  });
});
