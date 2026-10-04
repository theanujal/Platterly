import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isMultiLocationEnabled } from "./locations";

export const ACTIVE_LOCATION_COOKIE = "active_location";

export interface ActiveLocation {
  /** Multiple locations are switched on (and the plan allows it). False means no location filtering anywhere. */
  enabled: boolean;
  /** The location every list is limited to, or null for all locations. */
  locationId: string | null;
  /** The person is assigned to a location, so they cannot switch away from it. */
  locked: boolean;
  /** The owner is the only one who sees the switcher. */
  canSwitch: boolean;
}

const OFF: ActiveLocation = { enabled: false, locationId: null, locked: false, canSwitch: false };

/**
 * Chunk 23 — which location the signed-in person is looking at. Someone assigned to a location is held to it; the
 * owner picks one in the header (a cookie, "all locations" by default); everyone else with no location sees the
 * whole kitchen. Always resolved on the server from the session's own organization.
 */
export const getActiveLocation = cache(async (organizationId: string, userId: string): Promise<ActiveLocation> => {
  if (!(await isMultiLocationEnabled(organizationId))) return OFF;
  const member = await prisma.member.findFirst({ where: { organizationId, userId }, select: { role: true, locationId: true } });
  if (member?.locationId) return { enabled: true, locationId: member.locationId, locked: true, canSwitch: false };
  const canSwitch = member?.role === "owner";
  if (!canSwitch) return { enabled: true, locationId: null, locked: false, canSwitch: false };
  const wanted = (await cookies()).get(ACTIVE_LOCATION_COOKIE)?.value;
  // A cookie from another kitchen (or a deleted location) is ignored, never trusted.
  const valid = wanted ? await prisma.kitchen.findFirst({ where: { id: wanted, organizationId }, select: { id: true } }) : null;
  return { enabled: true, locationId: valid?.id ?? null, locked: false, canSwitch };
});
