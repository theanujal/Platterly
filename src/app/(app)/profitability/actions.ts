"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { ExpenseError, createExpense, deleteExpense, updateExpense, type ExpenseInput } from "@/modules/expenses/expense";
import { AttachmentError, addExpenseAttachment, removeExpenseAttachment } from "@/modules/expenses/attachment";
import { RecurringExpenseError, createRecurringExpense, deleteRecurringExpense, setRecurringExpenseActive, updateRecurringExpense, type RecurringExpenseInput } from "@/modules/expenses/recurring";
import { RECURRENCE_FREQUENCIES, type RecurrenceFrequencyValue } from "@/modules/expenses/recurrence";
import type { ExpenseCategoryValue } from "@/modules/expenses/profitability";
import type { PaymentMethod } from "@/generated/prisma/enums";

export type ExpenseActionResult = { ok: true } | { ok: false; error: string };
export type ExpenseCreateResult = { ok: true; expenseId: string } | { ok: false; error: string };

export interface ExpenseFormInput {
  category: string;
  amount: number;
  spentAt: string;
  paymentMethod: string;
  supplierName: string;
  notes: string;
}

const METHODS: PaymentMethod[] = ["UPI", "CARD", "NET_BANKING", "CASH", "BANK_TRANSFER"];

function toInput(form: ExpenseFormInput): ExpenseInput {
  return {
    category: form.category as ExpenseCategoryValue,
    amount: form.amount,
    spentAt: new Date(form.spentAt),
    paymentMethod: METHODS.includes(form.paymentMethod as PaymentMethod) ? (form.paymentMethod as PaymentMethod) : null,
    supplierName: form.supplierName,
    notes: form.notes,
  };
}

async function guarded(orderId: string | null, task: () => Promise<void>): Promise<ExpenseActionResult> {
  try {
    await task();
  } catch (error) {
    if (error instanceof ExpenseError || error instanceof AttachmentError || error instanceof RecurringExpenseError) return { ok: false, error: error.message };
    throw error;
  }
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/profitability");
  revalidatePath("/expenses");
  return { ok: true };
}

/** `orderId` null records a company expense. Returns the new expense's id so receipts can be attached to it. */
export async function createExpenseAction(orderId: string | null, form: ExpenseFormInput): Promise<ExpenseCreateResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["create"] }, organizationId);
  let expenseId = "";
  const result = await guarded(orderId, async () => {
    const expense = await createExpense(organizationId, orderId, toInput(form), session.user.id);
    expenseId = expense.id;
  });
  return result.ok ? { ok: true, expenseId } : result;
}

export async function updateExpenseAction(orderId: string | null, expenseId: string, form: ExpenseFormInput): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["edit"] }, organizationId);
  return guarded(orderId, async () => {
    await updateExpense(organizationId, expenseId, toInput(form), session.user.id);
  });
}

export async function deleteExpenseAction(orderId: string | null, expenseId: string): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["delete"] }, organizationId);
  return guarded(orderId, async () => {
    await deleteExpense(organizationId, expenseId, session.user.id);
  });
}

/** One file per call (the request body limit is 5MB). Adding to a new expense needs create, to an old one edit. */
export async function uploadExpenseAttachmentAction(orderId: string | null, expenseId: string, formData: FormData): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  if (!(await hasPermission({ expenses: ["create"] }, organizationId)) && !(await hasPermission({ expenses: ["edit"] }, organizationId))) {
    return { ok: false, error: "You do not have permission to attach files." };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a file to attach." };
  return guarded(orderId, async () => {
    await addExpenseAttachment(organizationId, expenseId, file, session.user.id);
  });
}

export async function removeExpenseAttachmentAction(orderId: string | null, attachmentId: string): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["edit"] }, organizationId);
  return guarded(orderId, async () => {
    await removeExpenseAttachment(organizationId, attachmentId, session.user.id);
  });
}

export interface RecurringFormInput {
  category: string;
  amount: number;
  frequency: string;
  startDate: string;
  endDate: string;
  paymentMethod: string;
  supplierName: string;
  notes: string;
}

function toRecurringInput(form: RecurringFormInput): RecurringExpenseInput {
  return {
    category: form.category as ExpenseCategoryValue,
    amount: form.amount,
    frequency: (RECURRENCE_FREQUENCIES.includes(form.frequency as RecurrenceFrequencyValue) ? form.frequency : "") as RecurrenceFrequencyValue,
    startDate: new Date(form.startDate),
    endDate: form.endDate ? new Date(form.endDate) : null,
    paymentMethod: METHODS.includes(form.paymentMethod as PaymentMethod) ? (form.paymentMethod as PaymentMethod) : null,
    supplierName: form.supplierName,
    notes: form.notes,
  };
}

export async function createRecurringExpenseAction(form: RecurringFormInput): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["create"] }, organizationId);
  return guarded(null, async () => {
    await createRecurringExpense(organizationId, toRecurringInput(form), session.user.id);
  });
}

export async function updateRecurringExpenseAction(id: string, form: RecurringFormInput): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["edit"] }, organizationId);
  return guarded(null, async () => {
    await updateRecurringExpense(organizationId, id, toRecurringInput(form), session.user.id);
  });
}

export async function setRecurringExpenseActiveAction(id: string, isActive: boolean): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["edit"] }, organizationId);
  return guarded(null, async () => {
    await setRecurringExpenseActive(organizationId, id, isActive, session.user.id);
  });
}

export async function deleteRecurringExpenseAction(id: string): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["delete"] }, organizationId);
  return guarded(null, async () => {
    await deleteRecurringExpense(organizationId, id, session.user.id);
  });
}
