import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { recordStatusChange } from "@/modules/menu-approvals/status-history";
import { runDueNotifications } from "@/modules/notifications/triggers";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.statusChange.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function makeTeam() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Spice Route", slug: `trg-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const member = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: role, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return user;
  };
  return { org, sales: await member("salesEvents"), kitchen: await member("kitchen"), accounts: await member("accounts"), owner: await member("owner") };
}

async function makeOrder(orgId: string, actorId: string, eventStartDate: Date) {
  const customer = await createCustomer(orgId, { name: "Asha Rao", phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`, email: "asha@example.test" }, actorId);
  return createOrder(orgId, { customerId: customer.id, eventStartDate, eventEndDate: eventStartDate, totalParticipants: 50, individualPricingEnabled: true, mealPlanEntries: [{ date: eventStartDate, mealType: "DINNER", price: 400 }] }, actorId);
}

const rows = (orgId: string, event: string) => prisma.notification.findMany({ where: { organizationId: orgId, event }, include: { logs: true } });

describe("notification triggers (Chunk 16)", () => {
  it("a new order alerts Sales and Owner in-app and emails the customer (skipped while email is off)", async () => {
    const t = await makeTeam();
    const order = await makeOrder(t.org.id, t.sales.id, new Date("2026-12-05"));

    const alerts = await rows(t.org.id, "order.new_alert");
    const inApp = alerts.filter((n) => n.channel === "IN_APP");
    expect(inApp.map((n) => n.recipientUserId).sort()).toEqual([t.owner.id, t.sales.id].sort());
    expect(JSON.stringify(inApp[0].payload)).toContain("New order");
    expect(alerts.some((n) => n.recipientUserId === t.kitchen.id)).toBe(false);

    const customerEmail = (await rows(t.org.id, "order.created")).find((n) => n.channel === "EMAIL");
    expect(customerEmail?.recipientEmail).toBe("asha@example.test");
    expect(customerEmail?.logs[0].status).toBe("skipped");
    expect(JSON.stringify(customerEmail?.payload)).toContain(order.orderNumber!);
  });

  it("'sent to kitchen' tells the Kitchen team and the customer", async () => {
    const t = await makeTeam();
    const order = await makeOrder(t.org.id, t.sales.id, new Date("2026-12-05"));
    await recordStatusChange({ organizationId: t.org.id, orderId: order.id, subject: "ORDER", fromStatus: "APPROVED", toStatus: "SENT_TO_KITCHEN", source: "AUTOMATIC" });

    const kitchen = (await rows(t.org.id, "order.sent_to_kitchen")).map((n) => n.recipientUserId);
    expect(kitchen).toContain(t.kitchen.id);
    expect((await rows(t.org.id, "order.status_changed")).some((n) => n.channel === "EMAIL")).toBe(true);
  });

  it("a menu-approval step alone does not message the customer", async () => {
    const t = await makeTeam();
    const order = await makeOrder(t.org.id, t.sales.id, new Date("2026-12-05"));
    await recordStatusChange({ organizationId: t.org.id, orderId: order.id, subject: "MENU_APPROVAL", toStatus: "SENT_TO_CUSTOMER", source: "AUTOMATIC" });
    expect(await rows(t.org.id, "order.status_changed")).toHaveLength(0);
  });

  it("reminders go out once: 1 day before reaches the customer and the kitchen, a second run adds nothing", async () => {
    const t = await makeTeam();
    await makeOrder(t.org.id, t.sales.id, new Date("2026-12-05"));
    const now = new Date("2026-12-04T06:00:00Z"); // 11:30 in India, the day before

    const first = await runDueNotifications(now);
    expect(first.eventReminders).toBe(1);
    const reminders = await rows(t.org.id, "event.reminder");
    expect(reminders.some((n) => n.channel === "EMAIL" && n.recipientEmail === "asha@example.test")).toBe(true);
    expect(reminders.some((n) => n.channel === "IN_APP" && n.recipientUserId === t.kitchen.id)).toBe(true);

    const count = reminders.length;
    expect((await runDueNotifications(now)).eventReminders).toBe(0);
    expect(await rows(t.org.id, "event.reminder")).toHaveLength(count);
  });

  it("2 days before reminds the customer only; an unpaid balance 3 days out sends one payment notice", async () => {
    const t = await makeTeam();
    await makeOrder(t.org.id, t.sales.id, new Date("2026-12-06"));
    const result = await runDueNotifications(new Date("2026-12-04T06:00:00Z"));
    expect(result.eventReminders).toBe(1);
    expect((await rows(t.org.id, "event.reminder")).some((n) => n.channel === "IN_APP")).toBe(false);

    await makeOrder(t.org.id, t.sales.id, new Date("2026-12-07"));
    expect((await runDueNotifications(new Date("2026-12-04T06:00:00Z"))).paymentDue).toBe(1);
    expect(await rows(t.org.id, "payment.due")).not.toHaveLength(0);
  });
});
