import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId } from "@platterly/contract";
import { signPullResponse, verifyPlatformRequest, type BusinessStateSnapshot } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import { PULL_EVERY_MS, applySnapshot, fetchBusinessState, reconcileBusiness, runDuePlatformPull } from "../pull";

const ANSWER = "plsec_answer_pull_test";
const saved: Record<string, string | undefined> = {};
const businessIds: string[] = [];
const userIds: string[] = [];

beforeAll(() => { saved.PLATFORM_ANSWER_SECRET = process.env.PLATFORM_ANSWER_SECRET; });
beforeEach(() => { process.env.PLATFORM_ANSWER_SECRET = ANSWER; });
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.platformEvent.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.platformEventState.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.auditLog.deleteMany({ where: { organization: { businessId: { in: businessIds } } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({ where: { businessId: { in: businessIds } } });
});
afterAll(() => {
  if (saved.PLATFORM_ANSWER_SECRET === undefined) delete process.env.PLATFORM_ANSWER_SECRET;
  else process.env.PLATFORM_ANSWER_SECRET = saved.PLATFORM_ANSWER_SECRET;
});

const org = async () => {
  const businessId = newId("business");
  businessIds.push(businessId);
  const row = await prisma.organization.create({ data: { id: crypto.randomUUID(), businessId, createdAt: new Date(), name: "Pull Test", slug: `pt-${crypto.randomUUID().slice(0, 8)}` } });
  return { id: row.id, businessId };
};
const person = async () => {
  const id = crypto.randomUUID();
  const subject = `sub-${id}`;
  userIds.push(id);
  await prisma.user.create({ data: { id, name: "P", email: `p-${id}@example.com`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
  await prisma.account.create({ data: { id: crypto.randomUUID(), accountId: subject, providerId: "platterly", userId: id, createdAt: new Date(), updatedAt: new Date() } });
  return { id, subject };
};
const join = (organizationId: string, userId: string, role: string) => prisma.member.create({ data: { id: crypto.randomUUID(), organizationId, userId, role, createdAt: new Date() } });
const snapshot = (businessId: string, over: Partial<BusinessStateSnapshot> = {}): BusinessStateSnapshot => ({ businessId, status: "active", sequence: 5, membershipVersion: 3, members: [], ...over });
const memberOf = (organizationId: string, userId: string) => prisma.member.findFirst({ where: { organizationId, userId } });
const stateOf = (businessId: string) => prisma.platformEventState.findUnique({ where: { businessId } });

/** A Platform that answers with `body`, signed with the id of the request it got (so it is a good answer unless the test says otherwise). */
const platform = (body: unknown, { status = 200, secret = ANSWER, sameId = true }: { status?: number; secret?: string | null; sameId?: boolean } = {}) =>
  vi.fn(async (url: string, init: RequestInit) => {
    const id = new Headers(init.headers).get("x-platterly-event-id")!;
    const text = JSON.stringify(body);
    return new Response(text, { status, headers: secret ? signPullResponse(secret, sameId ? id : newId("command"), text) : {} });
  });

describe("platform pull: applying a snapshot", () => {
  it("repairs a missed removal, a missed status change and a missed new member", async () => {
    const o = await org();
    const leaver = await person();
    const joiner = await person();
    await join(o.id, leaver.id, "staff");
    const out = await applySnapshot(snapshot(o.businessId, { status: "suspended", sequence: 9, members: [
      { userId: "p1", subject: leaver.subject, role: "member", status: "removed" },
      { userId: "p2", subject: joiner.subject, role: "member", status: "active" },
    ] }));
    expect(out.repaired).toBe(true);
    expect(await memberOf(o.id, leaver.id)).toBeNull();
    expect((await memberOf(o.id, joiner.id))?.role).toBe("staff");
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("SUSPENDED");
    expect((await stateOf(o.businessId))?.lastSequence).toBe(9);
  });

  it("changes nothing when Caterly has already seen that sequence, and an older event arriving later cannot undo the repair", async () => {
    const o = await org();
    const p = await person();
    await join(o.id, p.id, "staff");
    await prisma.platformEventState.create({ data: { businessId: o.businessId, lastSequence: 7 } });
    expect((await applySnapshot(snapshot(o.businessId, { sequence: 7, members: [{ userId: "p", subject: p.subject, role: "member", status: "removed" }] }))).repaired).toBe(false);
    expect(await memberOf(o.id, p.id)).not.toBeNull();
    expect((await stateOf(o.businessId))?.lastPulledAt).not.toBeNull();
  });

  it("rolls everything back (sequence too) when a person is already in another business", async () => {
    const a = await org();
    const b = await org();
    const p = await person();
    await join(b.id, p.id, "staff");
    await expect(applySnapshot(snapshot(a.businessId, { sequence: 4, members: [{ userId: "p", subject: p.subject, role: "member", status: "active" }] }))).rejects.toThrow("person_in_another_business");
    expect(await stateOf(a.businessId)).toBeNull();
  });
});

describe("platform pull: fetching and trusting the answer", () => {
  it("sends a signed, route-bound GET that names the business and the product", async () => {
    const o = await org();
    const fetchMock = platform(snapshot(o.businessId));
    const got = await fetchBusinessState(o.businessId, fetchMock as never);
    expect(got.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://auth.localhost:3300/api/products/state?businessId=${o.businessId}&productKey=caterly`);
    expect(init.method).toBe("GET");
    expect(verifyPlatformRequest([ANSWER], new Headers(init.headers), "", "GET", url).ok).toBe(true);
    expect(verifyPlatformRequest([ANSWER], new Headers(init.headers), "", "GET", url.replace(o.businessId, newId("business"))).ok).toBe(false); // the business id cannot be swapped
  });

  it("changes nothing for an unsigned answer, one signed with another secret, one for another request, or one about another business", async () => {
    const o = await org();
    const p = await person();
    await join(o.id, p.id, "staff");
    const body = snapshot(o.businessId, { members: [{ userId: "p", subject: p.subject, role: "member", status: "removed" }] });
    for (const f of [platform(body, { secret: null }), platform(body, { secret: "plsec_other" }), platform(body, { sameId: false }), platform(snapshot(newId("business")))]) {
      expect(await reconcileBusiness(o.businessId, new Date(), f as never)).toBe("failed");
    }
    expect(await memberOf(o.id, p.id)).not.toBeNull();
    expect(await stateOf(o.businessId)).toBeNull();
  });

  it("a business the Platform does not know is skipped, and asked about once a day", async () => {
    const o = await org();
    const f = platform({ error: "business_unknown" }, { status: 404 });
    expect(await reconcileBusiness(o.businessId, new Date(), f as never)).toBe("skipped");
    const now = new Date();
    expect((await runDuePlatformPull(now, 100, f as never, [o.businessId])).checked).toBe(0);
    expect(f.mock.calls.filter(([u]) => u.includes(o.businessId))).toHaveLength(1);
  });

  it("the daily run pulls a business once, repairs it, and does not pull it again within 23 hours", async () => {
    const o = await org();
    const p = await person();
    await join(o.id, p.id, "staff");
    const f = platform(snapshot(o.businessId, { sequence: 2, members: [{ userId: "p", subject: p.subject, role: "member", status: "removed" }] }));
    const first = await runDuePlatformPull(new Date(), 1000, f as never, [o.businessId]);
    expect(first).toEqual({ checked: 1, repaired: 1, failed: 0 });
    expect(await memberOf(o.id, p.id)).toBeNull();
    const calls = () => f.mock.calls.filter(([u]) => u.includes(o.businessId)).length;
    expect(calls()).toBe(1);
    await runDuePlatformPull(new Date(), 1000, f as never, [o.businessId]);
    expect(calls()).toBe(1);
    await runDuePlatformPull(new Date(Date.now() + PULL_EVERY_MS + 60_000), 1000, f as never, [o.businessId]);
    expect(calls()).toBe(2);
  });

  it("does nothing when the Platform link is off", async () => {
    delete process.env.PLATFORM_ANSWER_SECRET;
    expect(await runDuePlatformPull(new Date(), 100, fetch, [])).toEqual({ checked: 0, repaired: 0, failed: 0 });
  });
});
