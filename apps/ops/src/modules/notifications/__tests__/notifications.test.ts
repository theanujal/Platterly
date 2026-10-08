import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { countUnread, listNotifications, markAllRead, markRead, notify, notifySafely } from "../notifications";

const A = "notifa";
const B = "notifb";

async function clean() {
  await prisma.notification.deleteMany({ where: { OR: [{ productKey: { in: [A, B] } }, { kind: { startsWith: "ntest." } }] } });
  await prisma.product.deleteMany({ where: { key: { in: [A, B] } } });
}
beforeEach(async () => {
  await clean();
  for (const key of [A, B]) await prisma.product.create({ data: { key, name: `Notif ${key}`, baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x" } });
});
afterAll(clean);

describe("notifications", () => {
  it("writes one row per dedupe key and reports whether it was new", async () => {
    const base = { productKey: A, kind: "ntest.once", title: "Once", body: "b", dedupeKey: "ntest:once" };
    expect(await notify(base)).toBe(true);
    expect(await notify(base)).toBe(false);
    expect(await prisma.notification.count({ where: { dedupeKey: "ntest:once" } })).toBe(1);
    expect(await notify({ productKey: A, kind: "ntest.free", title: "Free", body: "b" })).toBe(true);
    expect(await notify({ productKey: A, kind: "ntest.free", title: "Free", body: "b" })).toBe(true);
  });

  it("scopes the list and the unread count to a product, and platform-wide ones only show under all products", async () => {
    await notify({ productKey: A, kind: "ntest.a", title: "A1", body: "b" });
    await notify({ productKey: A, kind: "ntest.a", title: "A2", body: "b", severity: "WARNING" });
    await notify({ productKey: B, kind: "ntest.b", title: "B1", body: "b" });
    await notify({ kind: "ntest.platform", title: "Site", body: "b" });
    expect((await listNotifications({ productKey: A })).map((n) => n.title).sort()).toEqual(["A1", "A2"]);
    expect(await countUnread(B)).toBe(1);
    expect((await listNotifications({ severity: "WARNING" })).filter((n) => n.kind.startsWith("ntest.")).map((n) => n.title)).toEqual(["A2"]);
    expect((await listNotifications({})).some((n) => n.title === "Site")).toBe(true);
    expect((await listNotifications({ productKey: B })).some((n) => n.title === "Site")).toBe(false);
  });

  it("marks one, or every one in scope, as read, and writes an audit row", async () => {
    await notify({ productKey: A, kind: "ntest.a", title: "A1", body: "b" });
    await notify({ productKey: A, kind: "ntest.a", title: "A2", body: "b" });
    await notify({ productKey: B, kind: "ntest.b", title: "B1", body: "b" });
    const [first] = await listNotifications({ productKey: A });
    await markRead(first.id, null);
    expect(await countUnread(A)).toBe(1);
    expect(await markAllRead(null, A)).toBe(1);
    expect(await countUnread(A)).toBe(0);
    expect(await countUnread(B)).toBe(1);
    expect((await listNotifications({ productKey: A, unreadOnly: true })).length).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "notification.read_all", subject: A } })).toBeGreaterThanOrEqual(1);
  });

  it("never throws when it cannot write (a bad product key), and sends no email without STAFF_NOTIFY_EMAILS", async () => {
    delete process.env.STAFF_NOTIFY_EMAILS;
    await expect(notifySafely({ productKey: "no-such-product", kind: "ntest.bad", severity: "CRITICAL", title: "x", body: "y" })).resolves.toBeUndefined();
    await expect(notifySafely({ productKey: A, kind: "ntest.warn", severity: "WARNING", title: "x", body: "y" })).resolves.toBeUndefined();
    expect(await prisma.notification.count({ where: { kind: "ntest.warn" } })).toBe(1);
  });
});
