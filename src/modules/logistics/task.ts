import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { RULES, validateInput } from "@/lib/validation";
import { onTaskAssigned } from "@/modules/notifications/triggers";

export class EventTaskError extends Error {}

export interface TaskInput {
  title: string;
  notes?: string;
  dueDate?: Date | null;
  /** A StaffAssignment on the same event. */
  assignmentId?: string | null;
}

const MAX_TASKS_PER_EVENT = 200;

async function checkAssignment(organizationId: string, eventId: string, assignmentId?: string | null) {
  if (!assignmentId) return;
  const found = await prisma.staffAssignment.findFirst({ where: { id: assignmentId, organizationId, eventId }, select: { id: true } });
  if (!found) throw new EventTaskError("Give the task to someone who is on this event.");
}

function clean(input: TaskInput) {
  validateInput(input, RULES.eventTask);
  if (input.dueDate && Number.isNaN(input.dueDate.getTime())) throw new EventTaskError("Enter a valid due date.");
  return { title: input.title.trim(), notes: input.notes?.trim() || null, dueDate: input.dueDate ?? null };
}

export async function createTask(organizationId: string, eventId: string, input: TaskInput, actorUserId: string) {
  const data = clean(input);
  await prisma.event.findFirstOrThrow({ where: { id: eventId, organizationId }, select: { id: true } });
  await checkAssignment(organizationId, eventId, input.assignmentId);
  if ((await prisma.eventTask.count({ where: { eventId } })) >= MAX_TASKS_PER_EVENT) throw new EventTaskError(`An event can have at most ${MAX_TASKS_PER_EVENT} tasks.`);
  const task = await prisma.eventTask.create({ data: { organizationId, eventId, ...data, assignmentId: input.assignmentId ?? null, createdByUserId: actorUserId } });
  await audit({ organizationId, actorUserId, action: "event_task.create", recordType: "EventTask", recordId: task.id, after: { eventId, title: task.title } });
  await onTaskAssigned(organizationId, eventId, task.assignmentId, task.title, task.dueDate, actorUserId);
  return task;
}

export async function updateTask(organizationId: string, id: string, input: TaskInput, actorUserId: string) {
  const before = await prisma.eventTask.findFirstOrThrow({ where: { id, organizationId } });
  const data = clean(input);
  await checkAssignment(organizationId, before.eventId, input.assignmentId);
  const task = await prisma.eventTask.update({ where: { id }, data: { ...data, assignmentId: input.assignmentId ?? null } });
  await audit({ organizationId, actorUserId, action: "event_task.update", recordType: "EventTask", recordId: id, before: { title: before.title }, after: { title: task.title } });
  // Only a change of person is news to the new person.
  if (task.assignmentId && task.assignmentId !== before.assignmentId) await onTaskAssigned(organizationId, before.eventId, task.assignmentId, task.title, task.dueDate, actorUserId);
  return task;
}

/** Ticks a task off (or back on), stamping who and when. */
export async function setTaskDone(organizationId: string, id: string, done: boolean, actorUserId: string) {
  await prisma.eventTask.findFirstOrThrow({ where: { id, organizationId }, select: { id: true } });
  const task = await prisma.eventTask.update({ where: { id }, data: { done, completedAt: done ? new Date() : null, completedByUserId: done ? actorUserId : null } });
  await audit({ organizationId, actorUserId, action: done ? "event_task.done" : "event_task.reopened", recordType: "EventTask", recordId: id, after: { done } });
  return task;
}

export async function deleteTask(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.eventTask.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.eventTask.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "event_task.delete", recordType: "EventTask", recordId: id, before: { title: before.title } });
}

/** Open tasks first (soonest due first), finished ones after. */
export async function listEventTasks(organizationId: string, eventId: string) {
  const tasks = await prisma.eventTask.findMany({ where: { organizationId, eventId }, include: { assignment: { select: { id: true, staffMember: { select: { name: true } }, memberId: true } } }, orderBy: { createdAt: "asc" } });
  return tasks.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime());
}
