import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { COMPANY_EXPENSE_CATEGORIES, type ExpenseCategoryValue } from "./profitability";
import { RECURRENCE_FREQUENCIES, dueOccurrences, nextOccurrence, utcDate, type RecurrenceFrequencyValue } from "./recurrence";
import type { PaymentMethod } from "@/generated/prisma/enums";

export class RecurringExpenseError extends Error {}

export interface RecurringExpenseInput {
  category: ExpenseCategoryValue;
  amount: number;
  frequency: RecurrenceFrequencyValue;
  startDate: Date;
  endDate?: Date | null;
  paymentMethod?: PaymentMethod | null;
  supplierName?: string | null;
  notes?: string | null;
}

function clean(input: RecurringExpenseInput) {
  if (!(COMPANY_EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) throw new RecurringExpenseError("Choose a company category.");
  if (!RECURRENCE_FREQUENCIES.includes(input.frequency)) throw new RecurringExpenseError("Choose how often it repeats.");
  const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new RecurringExpenseError("Enter an amount greater than zero.");
  if (Number.isNaN(input.startDate.getTime())) throw new RecurringExpenseError("Enter the date it starts.");
  const endDate = input.endDate ?? null;
  if (endDate && (Number.isNaN(endDate.getTime()) || endDate.getTime() < input.startDate.getTime())) throw new RecurringExpenseError("The end date must be on or after the start date.");
  return {
    category: input.category,
    amount,
    frequency: input.frequency,
    startDate: utcDate(input.startDate),
    endDate: endDate ? utcDate(endDate) : null,
    paymentMethod: input.paymentMethod ?? null,
    supplierName: input.supplierName?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createRecurringExpense(organizationId: string, input: RecurringExpenseInput, actorUserId?: string) {
  const recurring = await prisma.recurringExpense.create({ data: { organizationId, createdByUserId: actorUserId, ...clean(input) } });
  await audit({ organizationId, actorUserId, action: "recurring_expense.create", recordType: "RecurringExpense", recordId: recurring.id, after: { category: recurring.category, amount: Number(recurring.amount), frequency: recurring.frequency } });
  return recurring;
}

/** Changes apply to dates not yet booked; expenses already booked keep their own values. */
export async function updateRecurringExpense(organizationId: string, id: string, input: RecurringExpenseInput, actorUserId?: string) {
  await prisma.recurringExpense.findFirstOrThrow({ where: { id, organizationId }, select: { id: true } });
  const recurring = await prisma.recurringExpense.update({ where: { id }, data: clean(input) });
  await audit({ organizationId, actorUserId, action: "recurring_expense.update", recordType: "RecurringExpense", recordId: id, after: { category: recurring.category, amount: Number(recurring.amount), frequency: recurring.frequency } });
  return recurring;
}

/** Pausing stops new bookings. Resuming skips the dates that fell during the pause. */
export async function setRecurringExpenseActive(organizationId: string, id: string, isActive: boolean, actorUserId?: string, now: Date = new Date()) {
  await prisma.recurringExpense.findFirstOrThrow({ where: { id, organizationId }, select: { id: true } });
  const recurring = await prisma.recurringExpense.update({ where: { id }, data: isActive ? { isActive: true, lastRunThrough: utcDate(now) } : { isActive: false } });
  await audit({ organizationId, actorUserId, action: isActive ? "recurring_expense.resume" : "recurring_expense.pause", recordType: "RecurringExpense", recordId: id });
  return recurring;
}

/** Deleting a template keeps every expense it already booked. */
export async function deleteRecurringExpense(organizationId: string, id: string, actorUserId?: string) {
  const before = await prisma.recurringExpense.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.recurringExpense.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "recurring_expense.delete", recordType: "RecurringExpense", recordId: id, before: { category: before.category, amount: Number(before.amount), frequency: before.frequency } });
}

export async function listRecurringExpenses(organizationId: string, now: Date = new Date()) {
  const rows = await prisma.recurringExpense.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] });
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    amount: Number(r.amount),
    frequency: r.frequency,
    startDate: r.startDate,
    endDate: r.endDate,
    paymentMethod: r.paymentMethod,
    supplierName: r.supplierName,
    notes: r.notes,
    isActive: r.isActive,
    nextDue: r.isActive ? nextOccurrence({ start: r.startDate, frequency: r.frequency, endDate: r.endDate, from: now }) : null,
  }));
}

/**
 * Books every due date of every active template as an ordinary company expense. There is no background
 * scheduler yet, so this runs when the Expenses page loads. Safe to run twice at once: a template can never
 * book the same date twice (a unique key on the expense), and nothing already booked is touched.
 */
export async function generateDueRecurringExpenses(organizationId: string, now: Date = new Date()): Promise<number> {
  const templates = await prisma.recurringExpense.findMany({ where: { organizationId, isActive: true } });
  let booked = 0;
  for (const t of templates) {
    const dates = dueOccurrences({ start: t.startDate, frequency: t.frequency, endDate: t.endDate, through: now, after: t.lastRunThrough });
    if (dates.length > 0) {
      const result = await prisma.expense.createMany({
        data: dates.map((spentAt) => ({
          organizationId,
          orderId: null,
          category: t.category,
          amount: t.amount,
          spentAt,
          paymentMethod: t.paymentMethod,
          supplierName: t.supplierName,
          notes: t.notes,
          recordedByUserId: t.createdByUserId,
          recurringExpenseId: t.id,
        })),
        skipDuplicates: true,
      });
      booked += result.count;
      if (result.count > 0) await audit({ organizationId, action: "recurring_expense.generate", recordType: "RecurringExpense", recordId: t.id, after: { booked: result.count } });
    }
    await prisma.recurringExpense.update({ where: { id: t.id }, data: { lastRunThrough: utcDate(now) } });
  }
  return booked;
}
