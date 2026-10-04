import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { RULES, validateInput } from "@/lib/validation";
import type { StaffDuty } from "@/generated/prisma/enums";
import { isStaffDuty } from "./duty";
import { onStaffAssigned } from "@/modules/notifications/triggers";

export class StaffAssignmentError extends Error {}

export interface AssignInput {
  /** Exactly one of these. */
  staffMemberId?: string;
  memberId?: string;
  duty: StaffDuty;
  notes?: string;
}

const memberName = (user: { firstName: string | null; lastName: string | null; name: string }) => [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.name;

/** Team members with a login who can be scheduled (not disabled). */
export async function listAssignableMembers(organizationId: string) {
  const members = await prisma.member.findMany({ where: { organizationId, disabledAt: null }, include: { user: { select: { firstName: true, lastName: true, name: true } } }, orderBy: { createdAt: "asc" } });
  return members.map((m) => ({ id: m.id, name: memberName(m.user), role: m.role }));
}

/**
 * Who else is booked on an overlapping event. Only a heads-up for the kitchen team: nothing stops a double booking,
 * because only they know whether it is real (a split shift, two halls next door).
 */
async function findConflicts(organizationId: string, eventId: string, person: { staffMemberId?: string; memberId?: string }) {
  const event = await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { startDate: true, endDate: true } });
  const others = await prisma.staffAssignment.findMany({
    where: {
      organizationId,
      eventId: { not: eventId },
      ...(person.staffMemberId ? { staffMemberId: person.staffMemberId } : { memberId: person.memberId }),
      event: { startDate: { lte: event.endDate }, endDate: { gte: event.startDate } },
    },
    select: { event: { select: { id: true, name: true, orderId: true, order: { select: { orderNumber: true } } } } },
  });
  return others.map((o) => ({ eventId: o.event.id, orderId: o.event.orderId, label: o.event.order?.orderNumber ?? o.event.name }));
}

export async function assignStaff(organizationId: string, eventId: string, input: AssignInput, actorUserId: string) {
  validateInput(input, RULES.staffAssignment);
  if (!isStaffDuty(input.duty)) throw new StaffAssignmentError("Choose a duty.");
  if (Boolean(input.staffMemberId) === Boolean(input.memberId)) throw new StaffAssignmentError("Choose one person.");
  await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { id: true } });

  let label: string;
  if (input.staffMemberId) {
    const person = await prisma.staffMember.findFirst({ where: { id: input.staffMemberId, organizationId } });
    if (!person) throw new StaffAssignmentError("That person was not found.");
    if (!person.isActive) throw new StaffAssignmentError(`${person.name} is marked inactive.`);
    label = person.name;
  } else {
    const member = await prisma.member.findFirst({ where: { id: input.memberId, organizationId, disabledAt: null }, include: { user: { select: { firstName: true, lastName: true, name: true } } } });
    if (!member) throw new StaffAssignmentError("That team member was not found.");
    label = memberName(member.user);
  }

  const duplicate = await prisma.staffAssignment.findFirst({ where: { eventId, ...(input.staffMemberId ? { staffMemberId: input.staffMemberId } : { memberId: input.memberId }) }, select: { id: true } });
  if (duplicate) throw new StaffAssignmentError(`${label} is already on this event.`);

  const assignment = await prisma.staffAssignment.create({
    data: { organizationId, eventId, staffMemberId: input.staffMemberId ?? null, memberId: input.memberId ?? null, duty: input.duty, notes: input.notes?.trim() || null, createdByUserId: actorUserId },
  });
  await audit({ organizationId, actorUserId, action: "staff_assignment.create", recordType: "StaffAssignment", recordId: assignment.id, after: { eventId, person: label, duty: input.duty } });
  await onStaffAssigned(organizationId, eventId, input.memberId ?? null, input.duty, actorUserId);
  return { assignment, conflicts: await findConflicts(organizationId, eventId, input) };
}

export async function updateAssignment(organizationId: string, id: string, input: { duty: StaffDuty; notes?: string }, actorUserId: string) {
  validateInput(input, RULES.staffAssignment);
  if (!isStaffDuty(input.duty)) throw new StaffAssignmentError("Choose a duty.");
  const before = await prisma.staffAssignment.findFirstOrThrow({ where: { id, organizationId } });
  const after = await prisma.staffAssignment.update({ where: { id }, data: { duty: input.duty, notes: input.notes?.trim() || null } });
  await audit({ organizationId, actorUserId, action: "staff_assignment.update", recordType: "StaffAssignment", recordId: id, before: { duty: before.duty }, after: { duty: after.duty } });
  return after;
}

export async function removeAssignment(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.staffAssignment.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.staffAssignment.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "staff_assignment.delete", recordType: "StaffAssignment", recordId: id, before: { eventId: before.eventId, duty: before.duty } });
}

/** Everyone on one event, with names resolved, grouped by the order of duties. */
export async function listEventAssignments(organizationId: string, eventId: string) {
  const rows = await prisma.staffAssignment.findMany({ where: { organizationId, eventId }, orderBy: { createdAt: "asc" }, include: { staffMember: { select: { name: true, phone: true } } } });
  const memberIds = rows.flatMap((r) => (r.memberId ? [r.memberId] : []));
  const members = memberIds.length ? await prisma.member.findMany({ where: { id: { in: memberIds }, organizationId }, include: { user: { select: { firstName: true, lastName: true, name: true, phone: true } } } }) : [];
  const byId = new Map(members.map((m) => [m.id, m]));
  return rows.map((r) => {
    const member = r.memberId ? byId.get(r.memberId) : undefined;
    return {
      id: r.id,
      duty: r.duty,
      notes: r.notes,
      hasLogin: r.memberId !== null,
      name: r.staffMember?.name ?? (member ? memberName(member.user) : "Former team member"),
      phone: r.staffMember?.phone ?? member?.user.phone ?? null,
      staffMemberId: r.staffMemberId,
      memberId: r.memberId,
    };
  });
}

/** Events in the next `days` days with who is on them, so the kitchen team can see what still needs filling. */
export async function listUpcomingSchedule(organizationId: string, days = 14) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days + 1);
  const events = await prisma.event.findMany({
    where: { organizationId, endDate: { gte: start }, startDate: { lt: end }, OR: [{ orderId: null }, { order: { status: { notIn: ["CANCELLED", "COMPLETED"] } } }] },
    orderBy: { startDate: "asc" },
    include: { order: { select: { id: true, orderNumber: true } }, customer: { select: { name: true } }, staffAssignments: { select: { duty: true } }, tasks: { select: { done: true } }, logistics: { select: { dispatchStatus: true } } },
  });
  return events.map((e) => ({ id: e.id, orderId: e.order?.id ?? null, orderNumber: e.order?.orderNumber ?? null, name: e.name, customer: e.customer.name, startDate: e.startDate, guestCount: e.guestCount, assigned: e.staffAssignments.length, tasksOpen: e.tasks.filter((t) => !t.done).length, tasksTotal: e.tasks.length, dispatchStatus: e.logistics?.dispatchStatus ?? "NOT_DISPATCHED" }));
}
