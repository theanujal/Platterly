import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { getInbox, markAllRead, markRead } from "@/modules/notifications/inbox";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Inbox Org", slug: `inb-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const user = async () => {
    const u = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "U", email: `u-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(u.id);
    return u;
  };
  return { org, a: await user(), b: await user() };
}

const alert = (orgId: string, userId: string, title: string, orderId?: string) =>
  notify({ organizationId: orgId, channel: "IN_APP", event: "order.new_alert", recipient: { userId }, payload: { title, message: "m", ...(orderId ? { orderId } : {}) } });

describe("notification inbox (Chunk 16.5)", () => {
  it("shows a person only their own alerts, newest first, linking to the order", async () => {
    const { org, a, b } = await setup();
    await alert(org.id, a.id, "First");
    await alert(org.id, a.id, "Second", "ord_1");
    await alert(org.id, b.id, "Not for A");

    const inbox = await getInbox(org.id, a.id);
    expect(inbox.items.map((i) => i.title)).toEqual(["Second", "First"]);
    expect(inbox.items[0].href).toBe("/orders/ord_1");
    expect(inbox.unread).toBe(2);
  });

  it("marks one or all as read, and never touches someone else's", async () => {
    const { org, a, b } = await setup();
    const first = await alert(org.id, a.id, "One");
    await alert(org.id, a.id, "Two");
    await alert(org.id, b.id, "Theirs");

    await markRead(org.id, b.id, first.id); // b can't clear a's alert
    expect((await getInbox(org.id, a.id)).unread).toBe(2);

    await markRead(org.id, a.id, first.id);
    expect((await getInbox(org.id, a.id)).unread).toBe(1);

    await markAllRead(org.id, a.id);
    expect((await getInbox(org.id, a.id)).unread).toBe(0);
    expect((await getInbox(org.id, b.id)).unread).toBe(1);
  });
});
