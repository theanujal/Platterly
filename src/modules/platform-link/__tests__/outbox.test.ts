import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { verifyPlatformRequest } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import { rememberCentralSubject } from "@/lib/platform/central-subject";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import { MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, attemptDelivery, enqueueBusinessCreated, runDuePlatformOutbox } from "../outbox";

const ANSWER = "plsec_answer_outbox_test";
const saved: Record<string, string | undefined> = {};
const businessIds: string[] = [];
const userIds: string[] = [];

beforeAll(() => {
  saved.PLATFORM_ANSWER_SECRET = process.env.PLATFORM_ANSWER_SECRET;
});
beforeEach(() => {
  process.env.PLATFORM_ANSWER_SECRET = ANSWER;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.platformOutbox.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.auditLog.deleteMany({ where: { organization: { businessId: { in: businessIds } } } });
  await prisma.subscription.deleteMany({ where: { organization: { businessId: { in: businessIds } } } });
  await prisma.organization.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});
afterAll(() => {
  if (saved.PLATFORM_ANSWER_SECRET === undefined) delete process.env.PLATFORM_ANSWER_SECRET;
  else process.env.PLATFORM_ANSWER_SECRET = saved.PLATFORM_ANSWER_SECRET;
});

const input = () => {
  const businessId = newId("business");
  businessIds.push(businessId);
  return { businessId, businessName: "Outbox Kitchen", subject: `sub-${crypto.randomUUID()}` };
};
const reply = (status: number, body: unknown, secret: string | null = ANSWER) => {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: secret ? signedHeaders(secret, newId("command"), text) : {} });
};
const row = (messageId: string) => prisma.platformOutbox.findUniqueOrThrow({ where: { messageId } });

describe("platform outbox: business.created", () => {
  it("queues once per business, with the message the Platform expects", async () => {
    const i = input();
    const id = await enqueueBusinessCreated(i);
    expect(id).toMatch(/^cmd_[0-9a-f]{32}$/);
    expect(await enqueueBusinessCreated(i)).toBeNull();
    expect((await row(id!)).payload).toEqual({ version: 1, messageId: id, type: "business.created", productKey: "caterly", businessId: i.businessId, businessName: "Outbox Kitchen", owner: { subject: i.subject } });
  });

  it("queues nothing when the link is off", async () => {
    delete process.env.PLATFORM_ANSWER_SECRET;
    expect(await enqueueBusinessCreated(input())).toBeNull();
  });

  it("sends a signed, route-bound request and marks it sent on a signed 200", async () => {
    const i = input();
    const id = (await enqueueBusinessCreated(i))!;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => reply(200, { businessId: i.businessId, created: true }));
    expect(await attemptDelivery(id, new Date(), fetchMock as never)).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://auth.localhost:3300/api/products/business-created");
    expect(verifyPlatformRequest([ANSWER], new Headers(init.headers), init.body as string, "POST", url).ok).toBe(true); // signed for THIS route
    expect(verifyPlatformRequest([ANSWER], new Headers(init.headers), init.body as string, "POST", "http://auth.localhost:3300/api/other").ok).toBe(false);
    const r = await row(id);
    expect([r.status, r.attempts, r.lastError]).toEqual(["SENT", 1, null]);
    expect(await attemptDelivery(id, new Date(), fetchMock as never)).toBe("skipped"); // already sent
  });

  it("retries on 500, a network error, an unsigned answer and product_not_current, on the stated schedule", async () => {
    for (const make of [() => reply(500, {}, null), () => { throw new Error("connect ECONNREFUSED"); }, () => reply(200, { businessId: "x", created: true }, null), () => reply(409, { error: "product_not_current" })]) {
      const id = (await enqueueBusinessCreated(input()))!;
      const before = Date.now();
      expect(await attemptDelivery(id, new Date(), (async () => make()) as never)).toBe("retry");
      const r = await row(id);
      expect(r.status).toBe("PENDING");
      expect(r.attempts).toBe(1);
      expect(r.lastError).toBeTruthy();
      expect(r.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before + RETRY_DELAYS_SECONDS[0] * 1000 - 50);
    }
  });

  it("fails at once on a signed refusal such as already_admin_elsewhere", async () => {
    const id = (await enqueueBusinessCreated(input()))!;
    expect(await attemptDelivery(id, new Date(), (async () => reply(409, { error: "already_admin_elsewhere" })) as never)).toBe("failed");
    const r = await row(id);
    expect([r.status, r.lastError]).toEqual(["FAILED", "The Platform refused: already_admin_elsewhere."]);
  });

  it("gives up after the last retry", async () => {
    const id = (await enqueueBusinessCreated(input()))!;
    const down = (async () => reply(503, {}, null)) as never;
    let now = new Date();
    for (let n = 1; n < MAX_ATTEMPTS; n++) {
      expect(await attemptDelivery(id, now, down)).toBe("retry");
      now = new Date(now.getTime() + 13 * 3600_000);
    }
    expect(await attemptDelivery(id, now, down)).toBe("failed");
    const r = await row(id);
    expect(r.status).toBe("FAILED");
    expect(r.attempts).toBe(MAX_ATTEMPTS);
    expect(r.lastError).toContain("Gave up after 6 tries");
  });

  it("the scheduled run sends what is due and leaves what is not", async () => {
    const due = (await enqueueBusinessCreated(input()))!;
    const later = (await enqueueBusinessCreated(input()))!;
    await prisma.platformOutbox.update({ where: { messageId: later }, data: { nextAttemptAt: new Date(Date.now() + 3600_000) } });
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { businessId: (await row(due)).businessId, created: true })));
    await runDuePlatformOutbox();
    expect((await row(due)).status).toBe("SENT");
    expect((await row(later)).status).toBe("PENDING");
  });
});

describe("sign-up queues the message", () => {
  it("a person who came through central sign-in gets one queued for their new business, and sign-up still succeeds while the Platform is down", async () => {
    const id = crypto.randomUUID();
    userIds.push(id);
    const email = `ob-${id}@example.com`;
    const subject = `sub-${id}`;
    await prisma.user.create({ data: { id, name: "Ob", email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
    rememberCentralSubject(email, subject);
    const { organizationId } = await provisionTenantForNewUser(id);
    expect(organizationId).toBeTruthy();
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId! } });
    businessIds.push(org.businessId);
    const queued = await prisma.platformOutbox.findFirstOrThrow({ where: { businessId: org.businessId } });
    expect(queued.payload).toMatchObject({ type: "business.created", productKey: "caterly", businessId: org.businessId, owner: { subject } });
    for (let n = 0; n < 40 && (await row(queued.messageId)).attempts === 0; n++) await new Promise((r) => setTimeout(r, 50)); // the immediate attempt
    expect((await row(queued.messageId)).status).toBe("PENDING"); // Platform down: waiting for the retry, not lost
  });

  it("a person with no central sign-in queues nothing", async () => {
    const id = crypto.randomUUID();
    userIds.push(id);
    await prisma.user.create({ data: { id, name: "Ob", email: `ob-${id}@example.com`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
    const { organizationId } = await provisionTenantForNewUser(id);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId! } });
    businessIds.push(org.businessId);
    expect(await prisma.platformOutbox.count({ where: { businessId: org.businessId } })).toBe(0);
  });
});
