import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId } from "@platterly/contract";
import { signPlatformRequest } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import { POST as eventsPOST } from "@/app/api/platform/events/route";
import { activateTenant } from "@/modules/tenants/tenant";

const SECRET = "plsec_status_test";
const BASE = "http://catering.localhost:3000";
const saved: Record<string, string | undefined> = {};
const businessIds: string[] = [];

beforeAll(() => {
  for (const k of ["PLATFORM_COMMAND_SECRETS", "PLATFORM_ANSWER_SECRET"]) saved[k] = process.env[k];
});
beforeEach(() => {
  process.env.PLATFORM_COMMAND_SECRETS = SECRET;
  process.env.PLATFORM_ANSWER_SECRET = "plsec_answer_status_test";
});
afterEach(async () => {
  await prisma.platformEvent.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.platformEventState.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.notification.deleteMany({ where: { organization: { businessId: { in: businessIds } } } });
  await prisma.auditLog.deleteMany({ where: { organization: { businessId: { in: businessIds } } } });
  await prisma.organization.deleteMany({ where: { businessId: { in: businessIds } } });
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const org = async (data: { status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"; suspendedBy?: string | null } = {}) => {
  const businessId = newId("business");
  businessIds.push(businessId);
  const row = await prisma.organization.create({ data: { id: crypto.randomUUID(), businessId, createdAt: new Date(), name: "Status Test", slug: `st-${crypto.randomUUID().slice(0, 8)}`, ...data } });
  return { id: row.id, businessId };
};
let seq = 0;
const send = (businessId: string, status: string) => {
  const body = { version: 1, eventId: newId("event"), businessId, sequence: ++seq, occurredAt: new Date().toISOString(), type: "organisation.status", data: { status } };
  const raw = JSON.stringify(body);
  const url = `${BASE}/api/platform/events`;
  return eventsPOST(new Request(url, { method: "POST", body: raw, headers: { "content-type": "application/json", ...signPlatformRequest(SECRET, body.eventId, raw, "POST", url) } }));
};
const state = (id: string) => prisma.organization.findUniqueOrThrow({ where: { id }, select: { status: true, suspendedBy: true } });
const actions = async (id: string) => (await prisma.auditLog.findMany({ where: { organizationId: id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);

describe("organisation.status applied to Caterly", () => {
  it("suspended suspends an active business and marks the Platform as the one who did it; active lifts it again", async () => {
    const { id, businessId } = await org();
    expect((await send(businessId, "suspended")).status).toBe(200);
    expect(await state(id)).toEqual({ status: "SUSPENDED", suspendedBy: "platform" });
    expect((await send(businessId, "active")).status).toBe(200);
    expect(await state(id)).toEqual({ status: "ACTIVE", suspendedBy: null });
    expect(await actions(id)).toEqual(["tenant.suspend", "tenant.activate"]);
  });

  it("closed suspends and never deactivates", async () => {
    const { id, businessId } = await org();
    await send(businessId, "closed");
    expect(await state(id)).toEqual({ status: "SUSPENDED", suspendedBy: "platform" });
  });

  it("active never lifts a suspension Ops placed", async () => {
    const { id, businessId } = await org({ status: "SUSPENDED", suspendedBy: null });
    expect((await send(businessId, "active")).status).toBe(200);
    expect((await state(id)).status).toBe("SUSPENDED");
    expect(await actions(id)).toEqual([]);
  });

  it("suspended leaves an existing Ops suspension as it is", async () => {
    const { id, businessId } = await org({ status: "SUSPENDED", suspendedBy: null });
    await send(businessId, "suspended");
    expect(await state(id)).toEqual({ status: "SUSPENDED", suspendedBy: null });
    expect(await actions(id)).toEqual([]);
  });

  it("never touches a deactivated business", async () => {
    const { id, businessId } = await org({ status: "DEACTIVATED" });
    await send(businessId, "suspended");
    await send(businessId, "active");
    expect((await state(id)).status).toBe("DEACTIVATED");
  });

  it("answers 409 for a business Caterly has no row for, recording nothing", async () => {
    const businessId = newId("business");
    businessIds.push(businessId);
    expect((await send(businessId, "suspended")).status).toBe(409);
    expect(await prisma.platformEvent.count({ where: { businessId } })).toBe(0);
    expect(await prisma.platformEventState.count({ where: { businessId } })).toBe(0);
  });

  it("an Ops suspend takes over a Platform suspension, so a later Platform active cannot lift it", async () => {
    const { id, businessId } = await org({ status: "SUSPENDED", suspendedBy: "platform" });
    await prisma.organization.update({ where: { id }, data: { suspendedBy: null } }); // what claimSuspensionForOps does
    await send(businessId, "active");
    expect((await state(id)).status).toBe("SUSPENDED");
  });

  it("an Ops reactivation clears the marker", async () => {
    const { id } = await org({ status: "SUSPENDED", suspendedBy: "platform" });
    await activateTenant(id);
    expect(await state(id)).toEqual({ status: "ACTIVE", suspendedBy: null });
  });
});
