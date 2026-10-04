import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ValidationError } from "@/lib/errors";
import type { StaffDuty } from "@/generated/prisma/enums";
import { STAFF_DUTIES, isStaffDuty } from "./duty";
import { MAX_STAFF_COUNT } from "./staff-count-limits";

export { MAX_STAFF_COUNT };

export type StaffCounts = Record<StaffDuty, number>;

const zero = (): StaffCounts => Object.fromEntries(STAFF_DUTIES.map((d) => [d, 0])) as StaffCounts;

/** Staffing as numbers (AJ, 2026-10-04): how many people per duty for one event. A duty with no row is zero. */
export async function getStaffCounts(organizationId: string, eventId: string): Promise<StaffCounts> {
  const rows = await prisma.eventStaffCount.findMany({ where: { organizationId, eventId }, select: { duty: true, count: true } });
  const counts = zero();
  for (const row of rows) counts[row.duty] = row.count;
  return counts;
}

/** Headcount per event for the Staffing page, one query for the whole list. */
export async function totalsByEvent(organizationId: string, eventIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.eventStaffCount.groupBy({ by: ["eventId"], where: { organizationId, eventId: { in: eventIds } }, _sum: { count: true } });
  return new Map(rows.map((r) => [r.eventId, r._sum.count ?? 0]));
}

/** Replaces the event's numbers. Zero removes the row; an unknown duty or a non-whole number is refused. */
export async function saveStaffCounts(organizationId: string, eventId: string, input: Record<string, number>, actorUserId: string) {
  const entries = Object.entries(input);
  for (const [duty, count] of entries) {
    if (!isStaffDuty(duty)) throw new ValidationError("Choose a duty from the list.");
    if (!Number.isInteger(count) || count < 0 || count > MAX_STAFF_COUNT) throw new ValidationError(`Enter a whole number from 0 to ${MAX_STAFF_COUNT}.`);
  }
  await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { id: true } });
  const before = await getStaffCounts(organizationId, eventId);
  await prisma.$transaction(
    entries.flatMap(([duty, count]) => {
      const key = { eventId_duty: { eventId, duty: duty as StaffDuty } };
      return count === 0
        ? [prisma.eventStaffCount.deleteMany({ where: { organizationId, eventId, duty: duty as StaffDuty } })]
        : [prisma.eventStaffCount.upsert({ where: key, create: { organizationId, eventId, duty: duty as StaffDuty, count }, update: { count } })];
    }),
  );
  const after = await getStaffCounts(organizationId, eventId);
  await audit({ organizationId, actorUserId, action: "event.staff_counts_updated", recordType: "Event", recordId: eventId, before, after });
  return after;
}
