"use server";

import { assertEventAtMyLocationById, assertStaffAssignmentAtMyLocation } from "@/modules/locations/active-location";
import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createStaffMember, updateStaffMember, deleteStaffMember } from "@/modules/employees/staff-member";
import { assignStaff, updateAssignment, removeAssignment } from "@/modules/employees/assignment";
import { isStaffDuty } from "@/modules/employees/duty";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type AssignResult = { ok: true; conflicts: { label: string; orderId: string | null }[] } | { ok: false; error: string };

function refreshSchedule(orderId: string | null) {
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/staff");
  revalidatePath("/staff/events/[eventId]", "page");
}

const fail = (error: unknown): { ok: false; error: string } => ({ ok: false, error: userMessage(error, "Something went wrong.") });

export interface StaffMemberPayload {
  name: string;
  phone: string;
  defaultDuty: string;
  notes: string;
  isActive: boolean;
}

function toInput(p: StaffMemberPayload) {
  if (!isStaffDuty(p.defaultDuty)) throw new Error("Choose a duty.");
  return { name: p.name, phone: p.phone, defaultDuty: p.defaultDuty, notes: p.notes, isActive: p.isActive };
}

export async function createStaffMemberAction(payload: StaffMemberPayload): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["create"] }, organizationId);
  try {
    await createStaffMember(organizationId, toInput(payload), session.user.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function updateStaffMemberAction(id: string, payload: StaffMemberPayload): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["edit"] }, organizationId);
  try {
    await updateStaffMember(organizationId, id, toInput(payload), session.user.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function deleteStaffMemberAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["delete"] }, organizationId);
  try {
    await deleteStaffMember(organizationId, id, session.user.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function assignStaffAction(orderId: string | null, eventId: string, person: { staffMemberId?: string; memberId?: string }, duty: string, notes: string): Promise<AssignResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["create"] }, organizationId);
  await assertEventAtMyLocationById(organizationId, session.user.id, eventId);
  try {
    if (!isStaffDuty(duty)) throw new Error("Choose a duty.");
    const result = await assignStaff(organizationId, eventId, { ...person, duty, notes }, session.user.id);
    refreshSchedule(orderId);
    return { ok: true, conflicts: result.conflicts.map((c) => ({ label: c.label, orderId: c.orderId })) };
  } catch (error) {
    return fail(error);
  }
}

export async function updateAssignmentAction(orderId: string | null, id: string, duty: string, notes: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["edit"] }, organizationId);
  await assertStaffAssignmentAtMyLocation(organizationId, session.user.id, id);
  try {
    if (!isStaffDuty(duty)) throw new Error("Choose a duty.");
    await updateAssignment(organizationId, id, { duty, notes }, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refreshSchedule(orderId);
  return { ok: true };
}

export async function removeAssignmentAction(orderId: string | null, id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  // Taking someone off an event is editing the schedule; "delete" is for removing a floor staff record.
  await requirePermission({ staffing: ["edit"] }, organizationId);
  await assertStaffAssignmentAtMyLocation(organizationId, session.user.id, id);
  try {
    await removeAssignment(organizationId, id, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refreshSchedule(orderId);
  return { ok: true };
}
