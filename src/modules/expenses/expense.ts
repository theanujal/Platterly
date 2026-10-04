import { RULES, validateInput } from "@/lib/validation";
import "server-only";
import { prisma } from "@/lib/db";
import { resolveSupplierFields } from "@/modules/suppliers/supplier";
import { audit } from "@/lib/audit/audit";
import { deleteStoredFiles } from "./attachment";
import { nextOccurrence } from "./recurrence";
import { COMPANY_EXPENSE_CATEGORIES, computeProfitability, EXPENSE_CATEGORIES, type ExpenseCategoryValue } from "./profitability";
import type { PaymentMethod } from "@/generated/prisma/enums";

export class ExpenseError extends Error {}

export interface ExpenseInput {
  category: ExpenseCategoryValue;
  amount: number;
  spentAt: Date;
  paymentMethod?: PaymentMethod | null;
  supplierName?: string | null;
  /** A pick from the supplier list; its name replaces `supplierName`. */
  supplierId?: string | null;
  notes?: string | null;
}

async function clean(organizationId: string, input: ExpenseInput, forOrder: boolean) {
  const allowed: readonly string[] = forOrder ? EXPENSE_CATEGORIES : COMPANY_EXPENSE_CATEGORIES;
  if (!allowed.includes(input.category)) throw new ExpenseError(forOrder ? "Choose a category." : "Choose a category for a company expense.");
  const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new ExpenseError("Enter an amount greater than zero.");
  if (Number.isNaN(input.spentAt.getTime())) throw new ExpenseError("Enter the date of the expense.");
  return {
    category: input.category,
    amount,
    spentAt: input.spentAt,
    paymentMethod: input.paymentMethod ?? null,
    ...(await resolveSupplierFields(organizationId, input)),
    notes: input.notes?.trim() || null,
  };
}

/** `orderId` null records a company (overhead) expense, such as rent, that belongs to no order. */
export async function createExpense(organizationId: string, orderId: string | null, input: ExpenseInput, actorUserId?: string) {
  validateInput(input, RULES.expense);
  if (orderId) await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { id: true } });
  const expense = await prisma.expense.create({ data: { organizationId, orderId, recordedByUserId: actorUserId, ...(await clean(organizationId, input, orderId !== null)) } });
  await audit({ organizationId, actorUserId, action: "expense.create", recordType: "Expense", recordId: expense.id, after: { orderId, category: expense.category, amount: Number(expense.amount) } });
  return expense;
}

export async function updateExpense(organizationId: string, id: string, input: ExpenseInput, actorUserId?: string) {
  validateInput(input, RULES.expense);
  const before = await prisma.expense.findFirstOrThrow({ where: { id, organizationId } });
  const expense = await prisma.expense.update({ where: { id }, data: await clean(organizationId, input, before.orderId !== null) });
  await audit({
    organizationId,
    actorUserId,
    action: "expense.update",
    recordType: "Expense",
    recordId: id,
    before: { category: before.category, amount: Number(before.amount) },
    after: { category: expense.category, amount: Number(expense.amount) },
  });
  return expense;
}

export async function deleteExpense(organizationId: string, id: string, actorUserId?: string) {
  const before = await prisma.expense.findFirstOrThrow({ where: { id, organizationId }, include: { attachments: { select: { key: true } } } });
  await prisma.expense.delete({ where: { id } });
  await deleteStoredFiles(before.attachments.map((a) => a.key));
  await audit({ organizationId, actorUserId, action: "expense.delete", recordType: "Expense", recordId: id, before: { orderId: before.orderId, category: before.category, amount: Number(before.amount) } });
}

export function listOrderExpenses(organizationId: string, orderId: string) {
  return prisma.expense.findMany({ where: { organizationId, orderId }, orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }], include: { attachments: { select: { id: true, fileName: true, url: true, contentType: true }, orderBy: { createdAt: "asc" } } } });
}

export async function getOrderProfitability(organizationId: string, orderId: string) {
  const [order, expenses] = await Promise.all([
    prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { total: true } }),
    listOrderExpenses(organizationId, orderId),
  ]);
  return computeProfitability(
    Number(order.total),
    expenses.map((e) => ({ category: e.category, amount: Number(e.amount) })),
  );
}

/** One row per order (cancelled ones left out), for the Profitability page. */
export async function listProfitability(organizationId: string, range: { from?: Date | null; to?: Date | null } = {}) {
  // The range is on the event date (inclusive of the last day), since profit belongs to the event.
  const eventStartDate = range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: new Date(range.to.getTime() + 86_400_000) } : {}) } : undefined;
  const orders = await prisma.order.findMany({
    where: { organizationId, status: { not: "CANCELLED" }, ...(eventStartDate ? { eventStartDate } : {}) },
    orderBy: { eventStartDate: "desc" },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      eventStartDate: true,
      venue: true,
      customer: { select: { name: true } },
      eventType: { select: { name: true } },
      expenses: { select: { category: true, amount: true } },
    },
  });
  return orders.map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer.name,
    eventTypeName: o.eventType?.name ?? null,
    eventStartDate: o.eventStartDate,
    venue: o.venue,
    expenseCount: o.expenses.length,
    ...computeProfitability(
      Number(o.total),
      o.expenses.map((e) => ({ category: e.category, amount: Number(e.amount) })),
    ),
  }));
}

export interface ExpenseListRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  category: ExpenseCategoryValue;
  amount: number;
  spentAt: Date;
  paymentMethod: PaymentMethod | null;
  supplierName: string | null;
  supplierId: string | null;
  notes: string | null;
  recurringExpenseId: string | null;
  /** The schedule that booked this expense, when one did. */
  recurring: { frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY"; isActive: boolean; startDate: Date; endDate: Date | null; nextDue: Date | null } | null;
  attachments: { id: string; fileName: string; url: string; contentType: string }[];
}

/** Every expense, order-level and company-level, newest first (the Expenses page). */
export async function listExpenses(organizationId: string): Promise<ExpenseListRow[]> {
  const rows = await prisma.expense.findMany({
    where: { organizationId },
    orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
    include: {
      order: { select: { orderNumber: true, customer: { select: { name: true } } } },
      recurringExpense: { select: { frequency: true, isActive: true, startDate: true, endDate: true } },
      attachments: { select: { id: true, fileName: true, url: true, contentType: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    orderId: e.orderId,
    orderNumber: e.order?.orderNumber ?? null,
    customerName: e.order?.customer.name ?? null,
    category: e.category,
    amount: Number(e.amount),
    spentAt: e.spentAt,
    paymentMethod: e.paymentMethod,
    supplierName: e.supplierName,
    supplierId: e.supplierId,
    notes: e.notes,
    recurringExpenseId: e.recurringExpenseId,
    recurring: e.recurringExpense
      ? { ...e.recurringExpense, nextDue: e.recurringExpense.isActive ? nextOccurrence({ start: e.recurringExpense.startDate, frequency: e.recurringExpense.frequency, endDate: e.recurringExpense.endDate, from: new Date() }) : null }
      : null,
    attachments: e.attachments,
  }));
}

/** The orders an expense can be booked against (cancelled ones left out), newest event first. */
export async function listOrderOptions(organizationId: string) {
  const orders = await prisma.order.findMany({
    where: { organizationId, status: { not: "CANCELLED" } },
    orderBy: { eventStartDate: "desc" },
    take: 500,
    select: { id: true, orderNumber: true, eventStartDate: true, customer: { select: { name: true } } },
  });
  return orders.map((o) => ({ id: o.id, label: `${o.orderNumber ?? "Order"} · ${o.customer.name}`, eventStartDate: o.eventStartDate }));
}
