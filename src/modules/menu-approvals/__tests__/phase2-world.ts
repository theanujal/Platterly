import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { ensureOrderMenuSelection } from "@/modules/menu-approvals/approval-link";

// Shared setup for the Phase 2 tests of the Menu Approvals + Orders merge: a business with an owner, an order with one priced meal and
// its menu approval (Needs Review), and a way to clean everything up. Real database, nothing mocked.

export const orgIds: string[] = [];
export const userIds: string[] = [];

export async function cleanupWorlds() {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.statusChange.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.secureAccessToken.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuVersionItem.deleteMany({ where: { menuVersion: { menuSelection: { organizationId: { in: orgIds } } } } });
  await prisma.menuVersion.deleteMany({ where: { menuSelection: { organizationId: { in: orgIds } } } });
  await prisma.menuSelectionItem.deleteMany({ where: { menuSelection: { organizationId: { in: orgIds } } } });
  await prisma.menuApprovalNote.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuSelection.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.rolePermissionOverride.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
}

export async function newBusiness(name = "P2 Org") {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name, slug: `p2-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const person = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: role, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return { user, member };
  };
  const owner = await person("owner");
  const customer = await createCustomer(org.id, { name: "Anoop", phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`, email: `a-${crypto.randomUUID()}@example.test` }, owner.user.id);
  const eventType = await createEventType(org.id, { name: "Wedding" }, owner.user.id);
  const makeOrder = async (options: { individualPricing?: boolean } = {}) => {
    const order = await createOrder(
      org.id,
      {
        customerId: customer.id,
        eventTypeId: eventType.id,
        eventStartDate: new Date("2026-12-05"),
        eventEndDate: new Date("2026-12-05"),
        totalParticipants: 120,
        adultCount: 100,
        individualPricingEnabled: options.individualPricing ?? true,
        mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: 400 }],
      },
      owner.user.id,
    );
    const selection = (await ensureOrderMenuSelection(org.id, order.id, owner.user.id))!;
    return { order, selection };
  };
  return { org, owner, person, customer, eventType, makeOrder };
}
