"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { createTask, setTaskDone, deleteTask } from "@/modules/logistics/task";
import { saveLogistics } from "@/modules/logistics/logistics";
import { DISPATCH_STATUSES, SETUP_STATUSES } from "@/modules/logistics/labels";
import type { DispatchStatus, SetupStatus } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: unknown): { ok: false; error: string } => ({ ok: false, error: userMessage(error, "Something went wrong.") });

function refresh(orderId: string | null) {
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/staff");
  revalidatePath("/staff/events/[eventId]", "page");
}

/** A date or date-time typed in a form, kept exactly as typed (no time-zone shift): stored and shown as the same clock time. */
const naive = (value: string): Date | null => {
  if (!value) return null;
  // "2026-12-01" or "2026-12-01T14:30" from a date / datetime-local input.
  const iso = value.length === 10 ? `${value}T00:00:00Z` : `${value}:00Z`;
  return new Date(iso);
};

export async function createTaskAction(orderId: string | null, eventId: string, form: { title: string; notes: string; dueDate: string; assignmentId: string }): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["create"] }, organizationId);
  try {
    await createTask(organizationId, eventId, { title: form.title, notes: form.notes, dueDate: naive(form.dueDate), assignmentId: form.assignmentId || null }, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(orderId);
  return { ok: true };
}

export async function setTaskDoneAction(orderId: string | null, id: string, done: boolean): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["edit"] }, organizationId);
  try {
    await setTaskDone(organizationId, id, done, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(orderId);
  return { ok: true };
}

export async function deleteTaskAction(orderId: string | null, id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["edit"] }, organizationId);
  try {
    await deleteTask(organizationId, id, session.user.id);
  } catch (error) {
    return fail(error);
  }
  refresh(orderId);
  return { ok: true };
}

export interface LogisticsForm {
  vehicleType: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  dispatchPlannedAt: string;
  dispatchStatus: string;
  setupStatus: string;
  setupTime: string;
  setupNotes: string;
}

export async function saveLogisticsAction(orderId: string | null, eventId: string, form: LogisticsForm): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ staffing: ["edit"] }, organizationId);
  try {
    if (!DISPATCH_STATUSES.includes(form.dispatchStatus as DispatchStatus) || !SETUP_STATUSES.includes(form.setupStatus as SetupStatus)) throw new Error("Choose a status.");
    await saveLogistics(
      organizationId,
      eventId,
      {
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber,
        driverName: form.driverName,
        driverPhone: form.driverPhone,
        dispatchPlannedAt: naive(form.dispatchPlannedAt),
        dispatchStatus: form.dispatchStatus as DispatchStatus,
        setupStatus: form.setupStatus as SetupStatus,
        setupTime: naive(form.setupTime),
        setupNotes: form.setupNotes,
      },
      session.user.id,
    );
  } catch (error) {
    return fail(error);
  }
  refresh(orderId);
  return { ok: true };
}
