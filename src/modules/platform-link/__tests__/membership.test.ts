import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId } from "@platterly/contract";
import { signPlatformRequest } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import { POST as eventsPOST } from "@/app/api/platform/events/route";
import { rememberCentralSubject, takeCentralSubject } from "@/lib/platform/central-subject";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import { consumePendingMembership } from "../pending";

const SECRET = "plsec_membership_test";
const BASE = "http://catering.localhost:3000";
const saved: Record<string, string | undefined> = {};
const businessIds: string[] = [];
const userIds: string[] = [];
const subjects: string[] = [];

beforeAll(() => {
  for (const k of ["PLATFORM_COMMAND_SECRETS", "PLATFORM_ANSWER_SECRET"]) saved[k] = process.env[k];
});
beforeEach(() => {
  process.env.PLATFORM_COMMAND_SECRETS = SECRET;
  process.env.PLATFORM_ANSWER_SECRET = "plsec_answer_membership_test";
});
afterEach(async () => {
  await prisma.platformEvent.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.platformEventState.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.platformPendingMember.deleteMany({ where: { subject: { in: subjects } } });
  await prisma.auditLog.deleteMany({ where: { organization: { businessId: { in: businessIds } } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({ where: { businessId: { in: businessIds } } });
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const org = async () => {
  const businessId = newId("business");
  businessIds.push(businessId);
  const row = await prisma.organization.create({ data: { id: crypto.randomUUID(), businessId, createdAt: new Date(), name: "Membership Test", slug: `mt-${crypto.randomUUID().slice(0, 8)}` } });
  return { id: row.id, businessId };
};
const person = async (linked = true) => {
  const id = crypto.randomUUID();
  const subject = `sub-${id}`;
  userIds.push(id);
  subjects.push(subject);
  await prisma.user.create({ data: { id, name: "P", email: `p-${id}@example.com`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
  if (linked) await prisma.account.create({ data: { id: crypto.randomUUID(), accountId: subject, providerId: "platterly", userId: id, createdAt: new Date(), updatedAt: new Date() } });
  return { id, subject };
};
const join = (organizationId: string, userId: string, role: string, disabledAt: Date | null = null) =>
  prisma.member.create({ data: { id: crypto.randomUUID(), organizationId, userId, role, createdAt: new Date(), disabledAt } });

let seq = 0;
const event = (businessId: string, data: { subject?: string; role?: string; status?: string }, sequence = ++seq) => ({
  version: 1, eventId: newId("event"), businessId, sequence, occurredAt: new Date().toISOString(), type: "membership.changed",
  data: { userId: "plat-user", role: "admin", status: "active", membershipVersion: 1, ...data },
});
const send = (e: ReturnType<typeof event>) => {
  const raw = JSON.stringify(e);
  const url = `${BASE}/api/platform/events`;
  return eventsPOST(new Request(url, { method: "POST", body: raw, headers: { "content-type": "application/json", ...signPlatformRequest(SECRET, e.eventId, raw, "POST", url) } }));
};
const roleOf = async (organizationId: string, userId: string) => (await prisma.member.findFirst({ where: { organizationId, userId } }))?.role ?? null;

describe("membership.changed: active", () => {
  it("adds a new member as staff, and the central admin as owner", async () => {
    const o = await org();
    const staff = await person();
    const admin = await person();
    expect(await (await send(event(o.businessId, { subject: staff.subject, role: "member" }))).json()).toEqual({ status: "ok", applied: true });
    await send(event(o.businessId, { subject: admin.subject, role: "admin" }));
    expect(await roleOf(o.id, staff.id)).toBe("staff");
    expect(await roleOf(o.id, admin.id)).toBe("owner");
  });

  it("leaves an existing member's role alone and re-enables a disabled member", async () => {
    const o = await org();
    const p = await person();
    await join(o.id, p.id, "kitchen", new Date());
    await send(event(o.businessId, { subject: p.subject, role: "member" }));
    const m = await prisma.member.findFirstOrThrow({ where: { organizationId: o.id, userId: p.id } });
    expect(m.role).toBe("kitchen");
    expect(m.disabledAt).toBeNull();
  });

  it("makes an existing member the owner when they are the central admin, and demotes the previous owner to manager", async () => {
    const o = await org();
    const oldOwner = await person();
    const next = await person();
    await join(o.id, oldOwner.id, "owner");
    await join(o.id, next.id, "manager");
    await send(event(o.businessId, { subject: next.subject, role: "admin" }));
    expect(await roleOf(o.id, next.id)).toBe("owner");
    expect(await roleOf(o.id, oldOwner.id)).toBe("manager");
  });

  it("refuses with 409 when the business is not linked, nothing recorded, and accepts the same event once it is", async () => {
    const p = await person();
    const businessId = newId("business");
    businessIds.push(businessId);
    const e = event(businessId, { subject: p.subject });
    const refused = await send(e);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "business_not_linked" });
    expect(await prisma.platformEvent.count({ where: { businessId } })).toBe(0);
    expect(await prisma.platformEventState.count({ where: { businessId } })).toBe(0);
    await prisma.organization.create({ data: { id: crypto.randomUUID(), businessId, createdAt: new Date(), name: "Later", slug: `later-${crypto.randomUUID().slice(0, 8)}` } });
    expect(await (await send(e)).json()).toEqual({ status: "ok", applied: true });
  });

  it("refuses with 409 when the event does not say who the person is", async () => {
    const o = await org();
    const res = await send(event(o.businessId, {}));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "subject_missing" });
  });

  it("refuses with 409 when the person already belongs to a different business here, and changes nothing", async () => {
    const mine = await org();
    const other = await org();
    const p = await person();
    await join(mine.id, p.id, "owner");
    const res = await send(event(other.businessId, { subject: p.subject }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "person_in_another_business" });
    expect(await roleOf(other.id, p.id)).toBeNull();
    expect(await roleOf(mine.id, p.id)).toBe("owner");
    expect(await prisma.platformEvent.count({ where: { businessId: other.businessId } })).toBe(0);
  });
});

describe("membership.changed: disabled and removed", () => {
  it("disabled keeps the seat and sets the disabled flag", async () => {
    const o = await org();
    const p = await person();
    await join(o.id, p.id, "manager");
    await send(event(o.businessId, { subject: p.subject, status: "disabled" }));
    const m = await prisma.member.findFirstOrThrow({ where: { organizationId: o.id, userId: p.id } });
    expect(m.role).toBe("manager");
    expect(m.disabledAt).not.toBeNull();
  });

  it("removed deletes the member and ends their sessions, and touches nobody else", async () => {
    const o = await org();
    const p = await person();
    const q = await person();
    await join(o.id, p.id, "staff");
    await join(o.id, q.id, "staff");
    await prisma.session.create({ data: { id: crypto.randomUUID(), token: `t-${p.id}`, userId: p.id, expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date(), updatedAt: new Date() } });
    await send(event(o.businessId, { subject: p.subject, status: "removed" }));
    expect(await roleOf(o.id, p.id)).toBeNull();
    expect(await prisma.session.count({ where: { userId: p.id } })).toBe(0);
    expect(await roleOf(o.id, q.id)).toBe("staff");
    expect(await prisma.user.count({ where: { id: p.id } })).toBe(1);
  });

  it("a duplicate or older event does not apply again", async () => {
    const o = await org();
    const p = await person();
    await join(o.id, p.id, "staff");
    await send(event(o.businessId, { subject: p.subject, status: "removed" }, 10));
    const stale = await send(event(o.businessId, { subject: p.subject, status: "active" }, 9));
    expect(await stale.json()).toEqual({ status: "ok", applied: false });
    expect(await roleOf(o.id, p.id)).toBeNull();
  });
});

describe("pending members (a person with no Caterly user yet)", () => {
  it("is stored, updated and removed by the events, and creates no user or member", async () => {
    const o = await org();
    const subject = `sub-pending-${crypto.randomUUID()}`;
    subjects.push(subject);
    const users = await prisma.user.count();
    await send(event(o.businessId, { subject, role: "admin" }));
    expect(await prisma.platformPendingMember.findUnique({ where: { subject } })).toMatchObject({ businessId: o.businessId, role: "owner", disabled: false });
    await send(event(o.businessId, { subject, role: "member", status: "disabled" }));
    expect(await prisma.platformPendingMember.findUnique({ where: { subject } })).toMatchObject({ role: "staff", disabled: true });
    await send(event(o.businessId, { subject, status: "removed" }));
    expect(await prisma.platformPendingMember.findUnique({ where: { subject } })).toBeNull();
    expect(await prisma.user.count()).toBe(users);
  });

  it("joins the business at the first sign-in, then the pending row is gone", async () => {
    const o = await org();
    const p = await person(false);
    await send(event(o.businessId, { subject: p.subject, role: "member" }));
    expect(await consumePendingMembership(p.id, p.subject)).toBe(true);
    expect(await roleOf(o.id, p.id)).toBe("staff");
    expect(await prisma.platformPendingMember.findUnique({ where: { subject: p.subject } })).toBeNull();
    expect(await consumePendingMembership(p.id, p.subject)).toBe(false);
  });

  it("does nothing when the person already belongs to a business here, or the business is not linked", async () => {
    const o = await org();
    const mine = await org();
    const p = await person(false);
    await join(mine.id, p.id, "owner");
    await send(event(o.businessId, { subject: p.subject }));
    expect(await consumePendingMembership(p.id, p.subject)).toBe(false);
    expect(await roleOf(o.id, p.id)).toBeNull();
    expect(await prisma.platformPendingMember.findUnique({ where: { subject: p.subject } })).not.toBeNull();
    await prisma.platformPendingMember.update({ where: { subject: p.subject }, data: { businessId: newId("business") } });
    expect(await consumePendingMembership(p.id, p.subject)).toBe(false);
  });

  it("a brand-new central person who is already a pending member gets no tenant of their own", async () => {
    const o = await org();
    const p = await person(false);
    await send(event(o.businessId, { subject: p.subject }));
    const orgs = await prisma.organization.count();
    rememberCentralSubject(`p-${p.id}@example.com`, p.subject);
    expect(await provisionTenantForNewUser(p.id)).toEqual({ organizationId: null });
    expect(await prisma.organization.count()).toBe(orgs);
  });
});

describe("remembered central subject", () => {
  it("is returned once, by email in any case, and forgotten after two minutes", () => {
    const t = 1_000_000;
    rememberCentralSubject("A@Example.com", "sub-1", t);
    expect(takeCentralSubject("a@example.com", t + 1000)).toBe("sub-1");
    expect(takeCentralSubject("a@example.com", t + 1000)).toBeNull();
    rememberCentralSubject("b@example.com", "sub-2", t);
    expect(takeCentralSubject("b@example.com", t + 121_000)).toBeNull();
  });
});
