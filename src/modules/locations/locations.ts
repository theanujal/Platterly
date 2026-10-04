import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ValidationError } from "@/lib/errors";
import { checkName } from "@/lib/validation";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { assertMultiLocationPlan, hasMultiLocationPlan } from "@/modules/subscriptions/limits";

/**
 * Chunk 23 — multiple locations. A location is a `Kitchen` row (name only) under one default Branch; the Store level
 * is not used yet. A kitchen opts in under Settings -> Kitchen Rules, and only if its plan includes the feature.
 */
export const MULTI_LOCATION_KEY = "multiLocationEnabled";

export interface LocationSettings {
  /** The plan includes multiple locations. */
  planAllows: boolean;
  /** The kitchen switched it on AND the plan still allows it. Everything location-related checks this one. */
  enabled: boolean;
}

export async function getLocationSettings(organizationId: string): Promise<LocationSettings> {
  const [planAllows, stored] = await Promise.all([hasMultiLocationPlan(organizationId), getSetting<boolean>(organizationId, MULTI_LOCATION_KEY)]);
  return { planAllows, enabled: planAllows && stored === true };
}

export async function isMultiLocationEnabled(organizationId: string): Promise<boolean> {
  return (await getLocationSettings(organizationId)).enabled;
}

/** The default branch and a default "Main" location, created once when a kitchen first switches locations on. */
export async function ensureDefaultLocation(organizationId: string) {
  return prisma.$transaction(async (tx) => {
    let branch = await tx.branch.findFirst({ where: { organizationId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
    if (!branch) branch = await tx.branch.create({ data: { organizationId, name: "Main branch", isDefault: true } });
    const existing = await tx.kitchen.findFirst({ where: { organizationId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
    if (existing) return existing;
    return tx.kitchen.create({ data: { organizationId, branchId: branch.id, name: "Main", isDefault: true } });
  });
}

export async function setMultiLocationEnabled(organizationId: string, enabled: boolean, actorUserId: string) {
  if (enabled) {
    await assertMultiLocationPlan(organizationId);
    await ensureDefaultLocation(organizationId);
  }
  await setSetting(organizationId, MULTI_LOCATION_KEY, enabled);
  await audit({ organizationId, actorUserId, action: "locations.toggle", recordType: "Organization", recordId: organizationId, after: { enabled } });
}

export async function listLocations(organizationId: string) {
  return prisma.kitchen.findMany({ where: { organizationId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
}

async function assertEnabled(organizationId: string) {
  if (!(await isMultiLocationEnabled(organizationId))) throw new ValidationError("Switch on multiple locations first.");
}

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.kitchen.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw new ValidationError("You already have a location with that name.");
}

export async function addLocation(organizationId: string, rawName: string, actorUserId: string) {
  await assertEnabled(organizationId);
  const name = checkName(rawName, "location name", 80);
  await assertNameFree(organizationId, name);
  const main = await ensureDefaultLocation(organizationId);
  const location = await prisma.kitchen.create({ data: { organizationId, branchId: main.branchId, name } });
  await audit({ organizationId, actorUserId, action: "locations.add", recordType: "Kitchen", recordId: location.id, after: { name } });
  return location;
}

export async function renameLocation(organizationId: string, id: string, rawName: string, actorUserId: string) {
  await assertEnabled(organizationId);
  const name = checkName(rawName, "location name", 80);
  const before = await prisma.kitchen.findFirst({ where: { id, organizationId } });
  if (!before) throw new ValidationError("That location doesn't exist.");
  await assertNameFree(organizationId, name, id);
  const location = await prisma.kitchen.update({ where: { id }, data: { name } });
  await audit({ organizationId, actorUserId, action: "locations.rename", recordType: "Kitchen", recordId: id, before: { name: before.name }, after: { name } });
  return location;
}

export async function makeDefaultLocation(organizationId: string, id: string, actorUserId: string) {
  await assertEnabled(organizationId);
  const target = await prisma.kitchen.findFirst({ where: { id, organizationId } });
  if (!target) throw new ValidationError("That location doesn't exist.");
  await prisma.$transaction([
    prisma.kitchen.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } }),
    prisma.kitchen.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await audit({ organizationId, actorUserId, action: "locations.make_default", recordType: "Kitchen", recordId: id });
}

/** Events, inventory items and team members at a deleted location are not deleted, they become unassigned (SetNull). */
export async function deleteLocation(organizationId: string, id: string, actorUserId: string) {
  await assertEnabled(organizationId);
  const target = await prisma.kitchen.findFirst({ where: { id, organizationId } });
  if (!target) throw new ValidationError("That location doesn't exist.");
  if (target.isDefault) throw new ValidationError("Make another location the default before deleting this one.");
  await prisma.kitchen.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "locations.delete", recordType: "Kitchen", recordId: id, before: { name: target.name } });
}
