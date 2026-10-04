import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { addLocation, deleteLocation, getLocationSettings, listLocations, makeDefaultLocation, renameLocation, setMultiLocationEnabled } from "../locations";
import { setMemberLocation } from "@/modules/team/team";
import { createInventoryItem, listInventoryItems, updateInventoryItem } from "@/modules/inventory/inventory";

const orgIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = 0;
  userIds.length = 0;
  planIds.length = 0;
});

async function seed(multiLocation: boolean) {
  const plan = await prisma.subscriptionPlan.create({ data: { code: `ml-${crypto.randomUUID()}`, name: "Multi Test", multiLocation } });
  planIds.push(plan.id);
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Loc Test Co", slug: `loc-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: plan.id, status: "ACTIVE", startDate: new Date() } });
  const makeUser = async (role: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: `${role} user`, email: `${role}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return { user, member };
  };
  return { org, plan, owner: await makeUser("owner"), staff: await makeUser("staff") };
}

const itemInput = (name: string, kitchenId?: string | null) => ({ name, category: "Spices", unit: "kg", kitchenId });

describe("Multiple locations (Chunk 23)", () => {
  it("cannot be switched on when the plan does not include it", async () => {
    const { org, owner } = await seed(false);
    await expect(setMultiLocationEnabled(org.id, true, owner.user.id)).rejects.toThrow(/plan/i);
    expect(await getLocationSettings(org.id)).toEqual({ planAllows: false, enabled: false });
  });

  it("switching on creates the default branch and a Main location, once", async () => {
    const { org, owner } = await seed(true);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const locations = await listLocations(org.id);
    expect(locations.map((l) => [l.name, l.isDefault])).toEqual([["Main", true]]);
    expect(await prisma.branch.count({ where: { organizationId: org.id } })).toBe(1);
    expect((await getLocationSettings(org.id)).enabled).toBe(true);
  });

  it("is off again when the plan loses the feature, even though the kitchen switched it on", async () => {
    const { org, owner, plan } = await seed(true);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    await prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { multiLocation: false } });
    expect((await getLocationSettings(org.id)).enabled).toBe(false);
  });

  it("adds, renames and re-defaults locations; names are unique and the default cannot be deleted", async () => {
    const { org, owner } = await seed(true);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "  North  ", owner.user.id);
    expect(north.name).toBe("North");
    await expect(addLocation(org.id, "north", owner.user.id)).rejects.toThrow(/already/i);
    await expect(addLocation(org.id, "   ", owner.user.id)).rejects.toThrow();
    await renameLocation(org.id, north.id, "North Branch", owner.user.id);
    const main = (await listLocations(org.id)).find((l) => l.isDefault)!;
    await expect(deleteLocation(org.id, main.id, owner.user.id)).rejects.toThrow(/default/i);
    await makeDefaultLocation(org.id, north.id, owner.user.id);
    expect((await listLocations(org.id))[0].name).toBe("North Branch");
    await deleteLocation(org.id, main.id, owner.user.id);
    expect(await prisma.kitchen.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("refuses every change while switched off", async () => {
    const { org, owner } = await seed(true);
    await expect(addLocation(org.id, "North", owner.user.id)).rejects.toThrow(/switch on/i);
  });

  it("deleting a location unassigns its members and items instead of deleting them", async () => {
    const { org, owner, staff } = await seed(true);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    await setMemberLocation(org.id, staff.member.id, north.id, owner.user.id);
    const item = await createInventoryItem(org.id, itemInput("Salt", north.id), owner.user.id);
    await deleteLocation(org.id, north.id, owner.user.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: staff.member.id } })).locationId).toBeNull();
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: item.id } })).kitchenId).toBeNull();
  });

  it("assigns a team member to a location and back to the whole kitchen; the owner cannot be assigned", async () => {
    const { org, owner, staff } = await seed(true);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    await setMemberLocation(org.id, staff.member.id, north.id, owner.user.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: staff.member.id } })).locationId).toBe(north.id);
    await setMemberLocation(org.id, staff.member.id, null, owner.user.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: staff.member.id } })).locationId).toBeNull();
    await expect(setMemberLocation(org.id, owner.member.id, north.id, owner.user.id)).rejects.toThrow(/owner/i);
  });

  it("inventory: an item at a location shows there and at 'all', shared items show everywhere", async () => {
    const { org, owner } = await seed(true);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    const south = await addLocation(org.id, "South", owner.user.id);
    await createInventoryItem(org.id, itemInput("Shared rice"), owner.user.id);
    await createInventoryItem(org.id, itemInput("North oil", north.id), owner.user.id);
    await createInventoryItem(org.id, itemInput("South flour", south.id), owner.user.id);
    const names = async (locationId?: string | null) => (await listInventoryItems(org.id, locationId)).map((i) => i.name).sort();
    expect(await names()).toEqual(["North oil", "Shared rice", "South flour"]);
    expect(await names(north.id)).toEqual(["North oil", "Shared rice"]);
    expect(await names(south.id)).toEqual(["Shared rice", "South flour"]);
  });

  it("inventory update leaves the location alone when none is sent, and clears it when null is sent", async () => {
    const { org, owner } = await seed(true);
    await setMultiLocationEnabled(org.id, true, owner.user.id);
    const north = await addLocation(org.id, "North", owner.user.id);
    const item = await createInventoryItem(org.id, itemInput("Oil", north.id), owner.user.id);
    await updateInventoryItem(org.id, item.id, itemInput("Oil 2"), owner.user.id);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: item.id } })).kitchenId).toBe(north.id);
    await updateInventoryItem(org.id, item.id, itemInput("Oil 3", null), owner.user.id);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: item.id } })).kitchenId).toBeNull();
  });

  it("never reaches another kitchen's locations", async () => {
    const a = await seed(true);
    const b = await seed(true);
    await setMultiLocationEnabled(a.org.id, true, a.owner.user.id);
    await setMultiLocationEnabled(b.org.id, true, b.owner.user.id);
    const aNorth = await addLocation(a.org.id, "North", a.owner.user.id);
    await expect(renameLocation(b.org.id, aNorth.id, "Hijacked", b.owner.user.id)).rejects.toThrow();
    await expect(deleteLocation(b.org.id, aNorth.id, b.owner.user.id)).rejects.toThrow();
    await expect(makeDefaultLocation(b.org.id, aNorth.id, b.owner.user.id)).rejects.toThrow();
    await expect(setMemberLocation(b.org.id, b.staff.member.id, aNorth.id, b.owner.user.id)).rejects.toThrow();
    await expect(createInventoryItem(b.org.id, itemInput("Stolen", aNorth.id), b.owner.user.id)).rejects.toThrow();
    await expect(setMemberLocation(b.org.id, a.staff.member.id, null, b.owner.user.id)).rejects.toThrow();
    expect((await listLocations(a.org.id)).map((l) => l.name).sort()).toEqual(["Main", "North"]);
  });
});
