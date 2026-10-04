"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createStaffMember, updateStaffMember, deleteStaffMember } from "@/modules/employees/staff-member";
import { isStaffDuty } from "@/modules/employees/duty";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
