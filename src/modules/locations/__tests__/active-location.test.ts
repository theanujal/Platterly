import { describe, it, expect, afterEach, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "active_location" && cookieValue ? { value: cookieValue } : undefined) }) }));

import { prisma } from "@/lib/db";
import { getActiveLocation } from "../active-location";
import { addLocation, setMultiLocationEnabled } from "../locations";
import { setMemberLocation } from "@/modules/team/team";

const orgIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];

afterEach(async () => {
  cookieValue = undefined;
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = planIds.length = userIds.length = 0;
});

async function seed() {
  const plan = await prisma.subscriptionPlan.create({ data: { code: `al-${crypto.randomUUID()}`, name: "AL", multiLocation: true } });
  planIds.push(plan.id);
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "AL Co", slug: `al-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: plan.id, status: "ACTIVE", startDate: new Date() } });
  const person = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: role, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return { user, member };
  };
  return { org, owner: await person("owner"), staff: await person("staff") };
}

describe("getActiveLocation (Chunk 23)", () => {
  it("does nothing while multiple locations are off", async () => {
    const { org, owner } = await seed();
    expect(await getActiveLocation(org.id, owner.user.id)).toEqual({ enabled: false, locationId: null, locked: false, canSwitch: false });
  });

  it("the owner follows the cookie, ignoring a location from another kitchen or a made-up one", async () => {
    const a = await seed();
    const b = await seed();
    await setMultiLocationEnabled(a.org.id, true, a.owner.user.id);
    await setMultiLocationEnabled(b.org.id, true, b.owner.user.id);
    const north = await addLocation(a.org.id, "North", a.owner.user.id);
    const foreign = await addLocation(b.org.id, "Foreign", b.owner.user.id);
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ enabled: true, locationId: null, canSwitch: true });
    cookieValue = north.id;
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ locationId: north.id, locked: false, canSwitch: true });
    cookieValue = foreign.id;
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ locationId: null });
    cookieValue = "made-up";
    expect(await getActiveLocation(a.org.id, a.owner.user.id)).toMatchObject({ locationId: null });
  });

  it("a member with a location is held to it whatever the cookie says; one without sees everything and cannot switch", async () => {
    const { org, owner, staff } = await seed();
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    const south = await addLocation(org.id, "South", owner.user.id);
    cookieValue = south.id;
    expect(await getActiveLocation(org.id, staff.user.id)).toEqual({ enabled: true, locationId: null, locked: false, canSwitch: false });
    await setMemberLocation(org.id, staff.member.id, north.id, owner.user.id);
    expect(await getActiveLocation(org.id, staff.user.id)).toEqual({ enabled: true, locationId: north.id, locked: true, canSwitch: false });
  });
});
