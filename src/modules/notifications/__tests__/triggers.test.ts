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
  it("a new order alerts every team member in-app and emails the customer (skipped until the kitchen switches email on)", async () => {
    const t = await makeTeam();
    const order = await makeOrder(t.org.id, t.sales.id, new Date("2026-12-05"));

    const alerts = await rows(t.org.id, "order.new_alert");
    const inApp = alerts.filter((n) => n.channel === "IN_APP");
    expect(inApp.map((n) => n.recipientUserId).sort()).toEqual([t.owner.id, t.sales.id, t.kitchen.id, t.accounts.id].sort());
    expect(JSON.stringify(inApp[0].payload)).toContain("New order");

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

describe("system alerts, trial notices and opt-out (2026-10-04)", () => {
  it("a plan change tells the whole team", async () => {
    const t = await makeTeam();
    const { onPlanChanged } = await import("@/modules/notifications/triggers");
    await onPlanChanged(t.org.id, "Professional", "Trial");

    const alerts = (await rows(t.org.id, "system.alert")).filter((n) => n.channel === "IN_APP");
    expect(alerts.map((n) => n.recipientUserId).sort()).toEqual([t.owner.id, t.sales.id, t.kitchen.id, t.accounts.id].sort());
    expect(JSON.stringify(alerts[0].payload)).toContain("Trial to Professional");
    // Platform staff change plans in Ops, so no platform-side alert is created here any more.
    expect(await rows(t.org.id, "caterer.plan_changed")).toHaveLength(0);
  });

  it("suspending a kitchen tells its team", async () => {
    const t = await makeTeam();
    const { onTenantStatusChanged } = await import("@/modules/notifications/triggers");
    await onTenantStatusChanged(t.org.id, "SUSPENDED");
    expect((await rows(t.org.id, "system.alert")).some((n) => JSON.stringify(n.payload).includes("suspended"))).toBe(true);
    expect(await rows(t.org.id, "caterer.suspended")).toHaveLength(0);
  });

  it("trial notices go out 3 days and 1 day before the end, once each", async () => {
    const t = await makeTeam();
    const plan = await prisma.subscriptionPlan.create({ data: { code: `trial-${crypto.randomUUID().slice(0, 8)}`, name: "Trial test", isTrial: true, trialDurationDays: 7 } });
    await prisma.subscription.create({ data: { organizationId: t.org.id, subscriptionPlanId: plan.id, status: "TRIALING", startDate: new Date("2026-11-27"), trialEndsAt: new Date("2026-12-04T10:00:00Z") } });
    try {
      const now3 = new Date("2026-12-01T06:00:00Z");
      expect((await runDueNotifications(now3)).trialNotices).toBe(1);
      expect((await runDueNotifications(now3)).trialNotices).toBe(0);
      expect((await runDueNotifications(new Date("2026-12-03T06:00:00Z"))).trialNotices).toBe(1);
      expect((await rows(t.org.id, "system.alert")).some((n) => JSON.stringify(n.payload).includes("ends in 3 days"))).toBe(true);
    } finally {
      await prisma.subscription.deleteMany({ where: { organizationId: t.org.id } });
      await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
    }
  });

  it("with OPS_BILLING on, the local trial notices stop (ops sends them from its own subscription)", async () => {
    const t = await makeTeam();
    const plan = await prisma.subscriptionPlan.create({ data: { code: `trial-${crypto.randomUUID().slice(0, 8)}`, name: "Trial test", isTrial: true, trialDurationDays: 7 } });
    await prisma.subscription.create({ data: { organizationId: t.org.id, subscriptionPlanId: plan.id, status: "TRIALING", startDate: new Date("2026-11-27"), trialEndsAt: new Date("2026-12-04T10:00:00Z") } });
    const saved = { url: process.env.OPS_BASE_URL, event: process.env.OPS_EVENT_SECRET, cmd: process.env.OPS_COMMAND_SECRETS, billing: process.env.OPS_BILLING };
    Object.assign(process.env, { OPS_BASE_URL: "http://127.0.0.1:9", OPS_EVENT_SECRET: "e", OPS_COMMAND_SECRETS: "c", OPS_BILLING: "1" });
    try {
      expect((await runDueNotifications(new Date("2026-12-01T06:00:00Z"))).trialNotices).toBe(0);
      expect((await rows(t.org.id, "system.alert")).some((n) => JSON.stringify(n.payload).includes("ends in 3 days"))).toBe(false);
    } finally {
      for (const [k, v] of [["OPS_BASE_URL", saved.url], ["OPS_EVENT_SECRET", saved.event], ["OPS_COMMAND_SECRETS", saved.cmd], ["OPS_BILLING", saved.billing]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await prisma.subscription.deleteMany({ where: { organizationId: t.org.id } });
      await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
    }
  });

  it("customers who opted out get no promotional message, but still get the ones about their order", async () => {
    const t = await makeTeam();
    const order = await makeOrder(t.org.id, t.sales.id, new Date("2026-12-05"));
    const { notifyCustomer } = await import("@/modules/notifications/triggers");
    const { setMarketingOptOut } = await import("@/modules/notifications/opt-out");

    await setMarketingOptOut(order.customerId, false); // consented
    await notifyCustomer({ organizationId: t.org.id, customerId: order.customerId, event: "promotion.offer", email: "asha@example.test", payload: { title: "Offer" } });
    expect(await rows(t.org.id, "promotion.offer")).toHaveLength(1);

    await setMarketingOptOut(order.customerId, true);
    await notifyCustomer({ organizationId: t.org.id, customerId: order.customerId, event: "promotion.offer", email: "asha@example.test", payload: { title: "Offer" } });
    expect(await rows(t.org.id, "promotion.offer")).toHaveLength(1);

    await notifyCustomer({ organizationId: t.org.id, customerId: order.customerId, event: "event.reminder", email: "asha@example.test", payload: { daysBefore: 1 } });
    expect(await rows(t.org.id, "event.reminder")).not.toHaveLength(0);
  });
});
