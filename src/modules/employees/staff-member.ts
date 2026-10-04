import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { RULES, validateInput, checkPhone } from "@/lib/validation";
import type { StaffDuty } from "@/generated/prisma/enums";
import { isStaffDuty } from "./duty";

export class StaffMemberError extends Error {}

export interface StaffMemberInput {
  name: string;
  phone?: string;
  defaultDuty: StaffDuty;
  notes?: string;
  isActive?: boolean;
}

function clean(input: StaffMemberInput) {
  validateInput(input, RULES.staffMember);
  if (input.phone?.trim()) checkPhone(input.phone);
  if (!isStaffDuty(input.defaultDuty)) throw new StaffMemberError("Choose a duty.");
  return { name: input.name.trim(), phone: input.phone?.trim() || null, defaultDuty: input.defaultDuty, notes: input.notes?.trim() || null };
}

/** A person with no Platterly login: floor staff the kitchen team schedules onto events. */
export async function createStaffMember(organizationId: string, input: StaffMemberInput, actorUserId: string) {
  const person = await prisma.staffMember.create({ data: { organizationId, ...clean(input), isActive: input.isActive ?? true } });
  await audit({ organizationId, actorUserId, action: "staff_member.create", recordType: "StaffMember", recordId: person.id, after: { name: person.name, defaultDuty: person.defaultDuty } });
  return person;
}

export async function updateStaffMember(organizationId: string, id: string, input: StaffMemberInput, actorUserId: string) {
  const before = await prisma.staffMember.findFirstOrThrow({ where: { id, organizationId } });
  const person = await prisma.staffMember.update({ where: { id }, data: { ...clean(input), isActive: input.isActive ?? before.isActive } });
  await audit({ organizationId, actorUserId, action: "staff_member.update", recordType: "StaffMember", recordId: id, before: { name: before.name, defaultDuty: before.defaultDuty, isActive: before.isActive }, after: { name: person.name, defaultDuty: person.defaultDuty, isActive: person.isActive } });
  return person;
}

export async function setStaffMemberActive(organizationId: string, id: string, isActive: boolean, actorUserId: string) {
  await prisma.staffMember.findFirstOrThrow({ where: { id, organizationId }, select: { id: true } });
  const person = await prisma.staffMember.update({ where: { id }, data: { isActive } });
  await audit({ organizationId, actorUserId, action: "staff_member.update", recordType: "StaffMember", recordId: id, after: { isActive } });
  return person;
}

/** Refused once they have been on an event (the history matters); mark them inactive instead. */
export async function deleteStaffMember(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.staffMember.findFirstOrThrow({ where: { id, organizationId } });
  const used = await prisma.staffAssignment.count({ where: { staffMemberId: id } });
  if (used > 0) throw new StaffMemberError(`"${before.name}" has been scheduled on ${used} event(s). Mark them inactive instead.`);
  await prisma.staffMember.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "staff_member.delete", recordType: "StaffMember", recordId: id, before: { name: before.name } });
}

export function listStaffMembers(organizationId: string) {
  return prisma.staffMember.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { assignments: true } } } });
}
