import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

import webpush from "web-push";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { PROMPT_MAX_ASKS, nextPromptRecord, shouldShowPrompt } from "@/modules/notifications/push-prompt";
import { answerPrompt, getPushState, savePushSubscription, sendPushToUser, setPushEnabled } from "@/modules/notifications/push";
import { getInbox } from "@/modules/notifications/inbox";
import { onCatererSignedUp } from "@/modules/notifications/triggers";

const send = webpush.sendNotification as unknown as ReturnType<typeof vi.fn>;
const userIds: string[] = [];
const orgIds: string[] = [];

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  send.mockReset();
  send.mockResolvedValue({});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
  orgIds.length = 0;
});

async function makeUser(isSuperAdmin = false) {
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "P", email: `p-${crypto.randomUUID()}@example.test`, emailVerified: true, isSuperAdmin } });
  userIds.push(user.id);
  return user;
}
const sub = (n: string) => ({ endpoint: `https://push.example.test/${n}-${crypto.randomUUID()}`, keys: { p256dh: "k", auth: "a" } });

describe("push prompt schedule", () => {
  const day = 86_400_000;
  const base = { pushPromptState: "PENDING" as const, pushPromptCount: 0, pushPromptNextAt: null };

  it("asks straight away, then every 3 days after Maybe Later, and stops after 5 asks", () => {
    const now = new Date("2026-10-03T10:00:00Z");
    expect(shouldShowPrompt(base, now)).toBe(true);

    let record = nextPromptRecord(base, "later", now);
    expect(record.pushPromptState).toBe("LATER");
    expect(record.pushPromptNextAt!.getTime() - now.getTime()).toBe(3 * day);
    expect(shouldShowPrompt(record, new Date(now.getTime() + 2 * day))).toBe(false);
    expect(shouldShowPrompt(record, new Date(now.getTime() + 3 * day))).toBe(true);

    for (let i = 1; i < PROMPT_MAX_ASKS; i++) record = nextPromptRecord(record, "later", now);
    expect(record.pushPromptState).toBe("EXHAUSTED");
    expect(shouldShowPrompt(record, new Date(now.getTime() + 99 * day))).toBe(false);
  });

  it("'Don't Ask Again' and enabling both end the prompts", () => {
    expect(shouldShowPrompt(nextPromptRecord(base, "never"), new Date())).toBe(false);
    expect(shouldShowPrompt(nextPromptRecord(base, "enabled"), new Date())).toBe(false);
  });
});

describe("sending push", () => {
  it("sends to each enabled device, respects the master switch, and forgets dead devices", async () => {
    const user = await makeUser();
    await savePushSubscription(user.id, sub("a"));
    await savePushSubscription(user.id, sub("b"));
    expect((await getPushState(user.id)).devices).toBe(2);

    expect(await sendPushToUser(user.id, { title: "T", body: "B", url: "/orders/1" })).toEqual({ status: "sent", devices: 2 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: "T", body: "B", url: "/orders/1" });

    await setPushEnabled(user.id, false);
    send.mockClear();
    expect((await sendPushToUser(user.id, { title: "T", body: "B" })).status).toBe("skipped");
    expect(send).not.toHaveBeenCalled();

    await setPushEnabled(user.id, true);
    send.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect((await sendPushToUser(user.id, { title: "T", body: "B" })).status).toBe("sent");
    expect((await getPushState(user.id)).devices).toBe(1);
  });

  it("does nothing when push keys are not configured", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    const user = await makeUser();
    await savePushSubscription(user.id, sub("a"));
    expect((await sendPushToUser(user.id, { title: "T", body: "B" })).status).toBe("skipped");
    expect((await getPushState(user.id)).showPrompt).toBe(false);
  });

  it("enabling a device ends the prompt schedule; notify(PUSH) logs the result", async () => {
    const user = await makeUser();
    const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "O", slug: `push-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
    orgIds.push(org.id);
    expect((await getPushState(user.id)).showPrompt).toBe(true);
    await savePushSubscription(user.id, sub("a"));
    expect((await getPushState(user.id)).showPrompt).toBe(false);

    const result = await notify({ organizationId: org.id, channel: "PUSH", event: "order.new_alert", recipient: { userId: user.id }, payload: { title: "New order", message: "From Asha", orderId: "o1" } });
    expect(result.logs[0].status).toBe("sent");
    expect(JSON.parse(send.mock.calls[0][1]).url).toBe("/orders/o1");

    await answerPrompt(user.id, "later"); // re-asking is allowed to change state, never to throw
  });
});

describe("Super Admin alerts", () => {
  it("a new caterer sign-up reaches every Super Admin's bell, and only theirs", async () => {
    const admin = await makeUser(true);
    const other = await makeUser(false);
    const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "New Kitchen", slug: `sa-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
    orgIds.push(org.id);

    await onCatererSignedUp(org.id, "Asha Rao");
    const inbox = await getInbox(null, admin.id);
    expect(inbox.items[0]).toMatchObject({ title: "New caterer signed up", href: `/super/tenants/${org.id}`, read: false });
    expect(inbox.items[0].message).toContain("Asha Rao");
    expect((await getInbox(null, other.id)).items).toHaveLength(0);
  });
});
