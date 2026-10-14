import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

/**
 * A completed order is closed (AJ, 2026-10-14): nothing about it can be changed, not its details, status, kitchen cards,
 * expenses, staff, tasks or logistics. Payments and invoices are the one exception (a balance may still be collected).
 * These checks sit at the start of every change that belongs to an order, whichever screen it comes from.
 */
export const ORDER_COMPLETED_MESSAGE = "This order is completed, so it can't be changed any more.";

export class OrderCompletedError extends ValidationError {
  constructor() {
    super(ORDER_COMPLETED_MESSAGE);
    this.name = "OrderCompletedError";
  }
}

export async function assertOrderNotCompleted(organizationId: string, orderId: string | null | undefined): Promise<void> {
  if (!orderId) return;
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { status: true } });
  if (order?.status === "COMPLETED") throw new OrderCompletedError();
}

export async function assertEventOrderNotCompleted(organizationId: string, eventId: string): Promise<void> {
  const event = await prisma.event.findFirst({ where: { id: eventId, organizationId }, select: { orderId: true } });
  await assertOrderNotCompleted(organizationId, event?.orderId);
}

export async function assertTaskOrderNotCompleted(organizationId: string, taskId: string): Promise<void> {
  const task = await prisma.eventTask.findFirst({ where: { id: taskId, organizationId }, select: { eventId: true } });
  if (task) await assertEventOrderNotCompleted(organizationId, task.eventId);
}

export async function assertAssignmentOrderNotCompleted(organizationId: string, assignmentId: string): Promise<void> {
  const assignment = await prisma.staffAssignment.findFirst({ where: { id: assignmentId, organizationId }, select: { eventId: true } });
  if (assignment) await assertEventOrderNotCompleted(organizationId, assignment.eventId);
}

export async function assertExpenseOrderNotCompleted(organizationId: string, expenseId: string): Promise<void> {
  const expense = await prisma.expense.findFirst({ where: { id: expenseId, organizationId }, select: { orderId: true } });
  await assertOrderNotCompleted(organizationId, expense?.orderId);
}
