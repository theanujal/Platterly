import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, verifyRequest } from "@platterly/contract";
import { signPlatformRequest } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import { POST as commandsPOST } from "@/app/api/platform/commands/route";
import { POST as eventsPOST } from "@/app/api/platform/events/route";

const SECRET = "plsec_command_test";
const OLD_SECRET = "plsec_command_old";
const ANSWER = "plsec_answer_test";
const BASE = "http://catering.localhost:3000";
const saved: Record<string, string | undefined> = {};
const startedAt = new Date();
const businessIds: string[] = [];
const userIds: string[] = [];

const bizId = () => {
  const id = newId("business");
  businessIds.push(id);
  return id;
};

function signed(path: string, body: unknown, secret = SECRET, id = newId("command")) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const url = `${BASE}${path}`;
  return new Request(url, { method: "POST", body: raw, headers: { "content-type": "application/json", ...signPlatformRequest(secret, id, raw, "POST", url) } });
}
const linkBody = (businessId: string, commandId = newId("command")) => ({ version: 1, commandId, type: "organisation.link", businessId, businessName: "Linked Kitchen" });
const eventBody = (businessId: string, sequence: number, eventId = newId("event")) => ({ version: 1, eventId, businessId, sequence, occurredAt: new Date().toISOString(), type: "organisation.status", data: { status: "suspended" } });
const eventRequest = (body: ReturnType<typeof eventBody>, secret = SECRET) => signed("/api/platform/events", body, secret, body.eventId);

beforeAll(() => {
  for (const k of ["PLATFORM_COMMAND_SECRETS", "PLATFORM_ANSWER_SECRET"]) saved[k] = process.env[k];
});
beforeEach(() => {
  process.env.PLATFORM_COMMAND_SECRETS = `${SECRET},${OLD_SECRET}`;
  process.env.PLATFORM_ANSWER_SECRET = ANSWER;
});
afterEach(async () => {
  await prisma.platformCommand.deleteMany({ where: { receivedAt: { gte: startedAt } } });
  await prisma.platformEvent.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.platformEventState.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.auditLog.deleteMany({ where: { organization: { businessId: { in: businessIds } } } });
  await prisma.organization.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("platform link: organisation.link", () => {
  it("creates the kitchen under the Platform's business id, then answers a repeat without creating another", async () => {
    const businessId = bizId();
    const body = linkBody(businessId);
    const first = await commandsPOST(signed("/api/platform/commands", body));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ businessId, created: true });
    const again = await commandsPOST(signed("/api/platform/commands", body));
    expect(await again.json()).toEqual({ businessId, created: true }); // same command id: the stored answer
    const fresh = await commandsPOST(signed("/api/platform/commands", linkBody(businessId)));
    expect(await fresh.json()).toEqual({ businessId, created: false }); // new command id, kitchen already there
    expect(await prisma.organization.count({ where: { businessId } })).toBe(1);
    expect((await prisma.organization.findUniqueOrThrow({ where: { businessId } })).name).toBe("Linked Kitchen");
  });

  it("adopts a kitchen that already has that business id without changing it", async () => {
    const businessId = bizId();
    await prisma.organization.create({ data: { id: crypto.randomUUID(), businessId, createdAt: new Date(), name: "Existing", slug: `existing-${Date.now()}` } });
    const reply = await commandsPOST(signed("/api/platform/commands", linkBody(businessId)));
    expect(await reply.json()).toEqual({ businessId, created: false });
    expect((await prisma.organization.findUniqueOrThrow({ where: { businessId } })).name).toBe("Existing");
  });

  it("creates no users", async () => {
    const before = await prisma.user.count();
    await commandsPOST(signed("/api/platform/commands", linkBody(bizId())));
    expect(await prisma.user.count()).toBe(before);
  });

  it("signs its answer so the Platform can check it", async () => {
    const res = await commandsPOST(signed("/api/platform/commands", linkBody(bizId())));
    const text = await res.text();
    expect(verifyRequest([ANSWER], res.headers, text).ok).toBe(true);
    expect(verifyRequest(["wrong"], res.headers, text).ok).toBe(false);
  });

  it("rejects bad input with 400 and creates nothing", async () => {
    expect((await commandsPOST(signed("/api/platform/commands", "not json"))).status).toBe(400);
    expect((await commandsPOST(signed("/api/platform/commands", { ...linkBody(bizId()), businessId: "x" }))).status).toBe(400);
    expect((await commandsPOST(signed("/api/platform/commands", { ...linkBody(bizId()), type: "organisation.delete" }))).status).toBe(400);
  });
});

describe("platform link: signature and switch", () => {
  it("answers 404 when the link is not configured", async () => {
    delete process.env.PLATFORM_COMMAND_SECRETS;
    expect((await commandsPOST(signed("/api/platform/commands", linkBody(bizId())))).status).toBe(404);
    expect((await eventsPOST(eventRequest(eventBody(bizId(), 1)))).status).toBe(404);
  });

  it("answers 401 for a wrong secret, an unsigned request and a request signed for the other route", async () => {
    const businessId = bizId();
    expect((await commandsPOST(signed("/api/platform/commands", linkBody(businessId), "plsec_wrong"))).status).toBe(401);
    const raw = JSON.stringify(linkBody(businessId));
    expect((await commandsPOST(new Request(`${BASE}/api/platform/commands`, { method: "POST", body: raw }))).status).toBe(401);
    const forEvents = signed("/api/platform/events", linkBody(businessId));
    const replayed = new Request(`${BASE}/api/platform/commands`, { method: "POST", body: await forEvents.clone().text(), headers: forEvents.headers });
    expect((await commandsPOST(replayed)).status).toBe(401);
    expect(await prisma.organization.count({ where: { businessId } })).toBe(0);
  });

  it("accepts the previous secret during a rotation", async () => {
    expect((await commandsPOST(signed("/api/platform/commands", linkBody(bizId()), OLD_SECRET))).status).toBe(200);
  });
});

describe("platform link: events", () => {
  it("records an event and moves the sequence up", async () => {
    const businessId = bizId();
    const body = eventBody(businessId, 1);
    const res = await eventsPOST(eventRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", applied: true });
    expect((await prisma.platformEventState.findUniqueOrThrow({ where: { businessId } })).lastSequence).toBe(1);
    expect((await prisma.platformEvent.findUniqueOrThrow({ where: { eventId: body.eventId } })).data).toEqual({ status: "suspended" });
  });

  it("acknowledges a duplicate and an older event with 200 and changes nothing", async () => {
    const businessId = bizId();
    const two = eventBody(businessId, 2);
    await eventsPOST(eventRequest(two));
    const dup = await eventsPOST(eventRequest(two));
    expect(await dup.json()).toEqual({ status: "ok", applied: false });
    const older = await eventsPOST(eventRequest(eventBody(businessId, 1)));
    expect(await older.json()).toEqual({ status: "ok", applied: false });
    expect(await prisma.platformEvent.count({ where: { businessId } })).toBe(1);
    expect((await prisma.platformEventState.findUniqueOrThrow({ where: { businessId } })).lastSequence).toBe(2);
  });

  it("records only one of two deliveries of the same event that arrive together", async () => {
    const businessId = bizId();
    const body = eventBody(businessId, 1);
    const results = await Promise.all([eventsPOST(eventRequest(body)), eventsPOST(eventRequest(body))]);
    const applied = await Promise.all(results.map(async (r) => (await r.json()).applied));
    expect(applied.filter(Boolean)).toHaveLength(1);
    expect(await prisma.platformEvent.count({ where: { businessId } })).toBe(1);
  });

  it("rejects a bad signature, a body whose event id differs from the signed one, and an invalid event", async () => {
    const businessId = bizId();
    expect((await eventsPOST(eventRequest(eventBody(businessId, 1), "plsec_wrong"))).status).toBe(401);
    const body = eventBody(businessId, 1);
    expect((await eventsPOST(signed("/api/platform/events", body, SECRET, newId("event")))).status).toBe(400);
    const bad = { ...eventBody(businessId, 1), data: { status: "exploded" } };
    expect((await eventsPOST(eventRequest(bad))).status).toBe(400);
    expect(await prisma.platformEvent.count({ where: { businessId } })).toBe(0);
  });
});

describe("platform link: person.profile is applied", () => {
  const profileEvent = (businessId: string, sequence: number, subject: string, data: Partial<{ firstName: string; lastName: string; phone: string; email: string }> = {}) => ({
    version: 1, eventId: newId("event"), businessId, sequence, occurredAt: new Date().toISOString(), type: "person.profile",
    data: { userId: "plat-user", subject, firstName: "Asha", lastName: "Rao", phone: "+919876543210", email: "new@example.com", ...data },
  });
  const linkedUser = async (over: { email?: string; phone?: string | null } = {}) => {
    const id = crypto.randomUUID();
    userIds.push(id);
    const subject = `sub-${id}`;
    const email = over.email ?? `old-${id}@example.com`;
    await prisma.user.create({ data: { id, name: "Old Name", firstName: "Old", lastName: "Name", email, emailVerified: true, phone: over.phone === undefined ? "+911111111111" : over.phone, createdAt: new Date(), updatedAt: new Date() } });
    await prisma.account.create({ data: { id: crypto.randomUUID(), accountId: subject, providerId: "platterly", userId: id, createdAt: new Date(), updatedAt: new Date() } });
    return { id, subject, email };
  };
  const send = (e: ReturnType<typeof profileEvent>) => eventsPOST(signed("/api/platform/events", e, SECRET, e.eventId));

  it("updates name, phone and email of the linked Caterly user, found by the account row, and records the event", async () => {
    const u = await linkedUser();
    const businessId = bizId();
    const e = profileEvent(businessId, 1, u.subject, { email: `new-${u.id}@example.com` });
    expect(await (await send(e)).json()).toEqual({ status: "ok", applied: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user).toMatchObject({ firstName: "Asha", lastName: "Rao", name: "Asha Rao", phone: "+919876543210", email: `new-${u.id}@example.com`, emailVerified: true });
    expect(await prisma.platformEvent.count({ where: { eventId: e.eventId } })).toBe(1);
  });

  it("never erases: an empty phone keeps the phone Caterly has", async () => {
    const u = await linkedUser({ phone: "+912222222222" });
    await send(profileEvent(bizId(), 1, u.subject, { phone: "", email: u.email }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).phone).toBe("+912222222222");
  });

  it("keeps the current Caterly email when another Caterly user already holds the new one, but still updates the rest", async () => {
    const holder = await linkedUser();
    const u = await linkedUser();
    await send(profileEvent(bizId(), 1, u.subject, { email: holder.email.toUpperCase() }));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.email).toBe(u.email);
    expect(user.firstName).toBe("Asha");
  });

  it("changes nobody for a person with no Caterly user, and still records the event", async () => {
    const before = await prisma.user.count();
    const e = profileEvent(bizId(), 1, "sub-nobody");
    expect(await (await send(e)).json()).toEqual({ status: "ok", applied: true });
    expect(await prisma.user.count()).toBe(before);
    expect(await prisma.platformEvent.count({ where: { eventId: e.eventId } })).toBe(1);
  });

  it("does not apply a duplicate or older event again", async () => {
    const u = await linkedUser();
    const businessId = bizId();
    await send(profileEvent(businessId, 2, u.subject, { firstName: "Newest", email: u.email }));
    await send(profileEvent(businessId, 1, u.subject, { firstName: "Stale", email: u.email }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).firstName).toBe("Newest");
  });

  it("does not touch members, tenants or any other event type's targets", async () => {
    const u = await linkedUser();
    const orgs = await prisma.organization.count();
    const members = await prisma.member.count();
    await eventsPOST(eventRequest(eventBody(bizId(), 1)));
    await send(profileEvent(bizId(), 1, u.subject, { email: u.email }));
    expect(await prisma.organization.count()).toBe(orgs);
    expect(await prisma.member.count()).toBe(members);
  });
});
