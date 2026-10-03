"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { ExpenseError, createExpense, deleteExpense, updateExpense, type ExpenseInput } from "@/modules/expenses/expense";
import type { ExpenseCategoryValue } from "@/modules/expenses/profitability";
import type { PaymentMethod } from "@/generated/prisma/enums";

export type ExpenseActionResult = { ok: true } | { ok: false; error: string };

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
    if (error instanceof ExpenseError) return { ok: false, error: error.message };
    throw error;
  }
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/profitability");
  revalidatePath("/expenses");
  return { ok: true };
}

/** `orderId` null records a company expense. */
export async function createExpenseAction(orderId: string | null, form: ExpenseFormInput): Promise<ExpenseActionResult> {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ expenses: ["create"] }, organizationId);
  return guarded(orderId, async () => {
    await createExpense(organizationId, orderId, toInput(form), session.user.id);
  });
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
