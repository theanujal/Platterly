"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type Profitability } from "@/modules/expenses/profitability";
import { deleteExpenseAction } from "../../../profitability/actions";
import { ExpenseDialog, METHOD_LABEL, type ExpenseRowData } from "../../../expenses/_components/expense-dialog";
import { ExpenseFiles } from "../../../expenses/_components/expense-files";

const percent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);

function Tile({ label, value, tone, testId }: { label: string; value: string; tone?: "success" | "danger"; testId?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/40 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold tabular-nums break-words ${tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : ""}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

/**
 * The Expenses tab on the order (AJ, 2026-10-03): what the event cost, the profit against the order
 * total (PRD §42), and the expense table with add / edit / delete.
 */
export function ExpensesCard({
  orderId,
  profitability,
  expenses,
  suppliers,
  canCreate,
  canEdit,
  canDelete,
}: {
  orderId: string;
  profitability: Profitability;
  expenses: ExpenseRowData[];
  suppliers: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; row: ExpenseRowData } | null>(null);
  const [removing, setRemoving] = useState<ExpenseRowData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const loss = profitability.profit < 0;

  async function confirmRemove() {
    if (!removing) return;
    const result = await deleteExpenseAction(orderId, removing.id);
    setRemoving(null);
    setNotice(result.ok ? "Expense deleted." : result.error);
    router.refresh();
  }

  return (
    <Card className="gap-5 px-5 [--card-spacing:--spacing(5)]" data-testid="expenses-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{loss ? <TrendingDown className="size-5" /> : <TrendingUp className="size-5" />}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Expenses &amp; Profitability</h2>
          <p className="text-xs text-muted-foreground">What this event cost to run, against the order total.</p>
        </div>
        {canCreate && (
          <Button type="button" size="md" onClick={() => setDialog({ mode: "add" })}>
            <Plus />
            Add Expense
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Revenue (order total)" value={inr(profitability.revenue)} testId="profit-revenue" />
        <Tile label="Total cost" value={inr(profitability.totalCost)} testId="profit-cost" />
        <Tile label={loss ? "Loss" : "Profit"} value={inr(profitability.profit)} tone={loss ? "danger" : "success"} testId="profit-profit" />
        <Tile label="Profit margin" value={percent(profitability.marginPercent)} testId="profit-margin" />
        <Tile label="Food cost" value={percent(profitability.foodCostPercent)} testId="profit-food" />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Expense breakdown</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm tabular-nums sm:grid-cols-3">
          {EXPENSE_CATEGORIES.map((c) => (
            <div key={c} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{EXPENSE_CATEGORY_LABEL[c]}</dt>
              <dd className="font-medium" data-testid={`breakdown-${c}`}>
                {inr(profitability.byCategory[c])}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses recorded for this order yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Files</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {(canEdit || canDelete) && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((row) => (
                <TableRow key={row.id} data-testid="expense-row">
                  <TableCell className="whitespace-nowrap">{longDate(new Date(row.spentAt))}</TableCell>
                  <TableCell>{EXPENSE_CATEGORY_LABEL[row.category]}</TableCell>
                  <TableCell>{row.supplierName ?? "—"}</TableCell>
                  <TableCell>{row.paymentMethod ? (METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod) : "—"}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{row.notes ?? "—"}</TableCell>
                  <TableCell>
                    <ExpenseFiles attachments={row.attachments} />
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{inr(row.amount)}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${EXPENSE_CATEGORY_LABEL[row.category]} expense`} onClick={() => setDialog({ mode: "edit", row })}>
                            <Pencil />
                          </Button>
                        )}
                        {canDelete && (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${EXPENSE_CATEGORY_LABEL[row.category]} expense`} onClick={() => setRemoving(row)}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog && <ExpenseDialog key={dialog.mode === "edit" ? dialog.row.id : "add"} orderId={orderId} suppliers={suppliers} state={dialog} onClose={() => setDialog(null)} onDone={(text) => setNotice(text)} />}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>{removing ? `${EXPENSE_CATEGORY_LABEL[removing.category]} · ${inr(removing.amount)} will be removed and the profit recalculated.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemove()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

