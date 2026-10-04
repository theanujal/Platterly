"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus, Repeat, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { IconInput } from "@/components/ui/icon-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import { EXPENSE_CATEGORY_LABEL } from "@/modules/expenses/profitability";
import { cn } from "cn";
import { deleteExpenseAction } from "../../profitability/actions";
import { ExpenseDialog, METHOD_LABEL, type ExpenseRowData } from "./expense-dialog";
import { ExpenseFiles } from "./expense-files";

type Row = ExpenseRowData & { orderLabel: string | null };
type Scope = "ALL" | "ORDER" | "COMPANY";

const FILTERS: { value: Scope; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ORDER", label: "Order expenses" },
  { value: "COMPANY", label: "Company expenses" },
];

/** The Expenses page body: totals, filter, search, the table, and add / edit / delete. */
export function ExpensesBrowser({
  rows,
  orderOptions,
  suppliers,
  canCreate,
  canEdit,
  canDelete,
}: {
  rows: Row[];
  orderOptions: { id: string; label: string }[];
  suppliers: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("ALL");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; row: Row } | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totals = useMemo(() => {
    const order = rows.filter((r) => r.orderId).reduce((s, r) => s + r.amount, 0);
    const company = rows.filter((r) => !r.orderId).reduce((s, r) => s + r.amount, 0);
    return { order, company, all: order + company };
  }, [rows]);

  const visible = rows.filter((r) => {
    if (scope === "ORDER" && !r.orderId) return false;
    if (scope === "COMPANY" && r.orderId) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [EXPENSE_CATEGORY_LABEL[r.category], r.supplierName, r.notes, r.orderLabel].some((v) => v?.toLowerCase().includes(q));
  });

  async function confirmRemove() {
    if (!removing) return;
    const result = await deleteExpenseAction(removing.orderId, removing.id);
    setRemoving(null);
    setNotice(result.ok ? "Expense deleted." : result.error);
    router.refresh();
  }

  const tiles = [
    { label: "All expenses", value: totals.all, testId: "exp-total-all" },
    { label: "Order expenses", value: totals.order, testId: "exp-total-order" },
    { label: "Company expenses", value: totals.company, testId: "exp-total-company" },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="expenses-browser">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="text-xs text-muted-foreground">{t.label}</span>
            <span className="text-xl font-bold tabular-nums" data-testid={t.testId}>
              {inr(t.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <IconInput icon={Search} aria-label="Search expenses" placeholder="Search by category, supplier, notes or order…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={scope === f.value}
              onClick={() => setScope(f.value)}
              className={cn("flex h-10 items-center rounded-lg border px-3 text-sm font-medium", scope === f.value ? "border-primary bg-accent text-primary" : "border-border bg-card hover:bg-muted")}
            >
              {f.label}
            </button>
          ))}
        </div>
        {canCreate && (
          <Button type="button" onClick={() => setDialog({ mode: "add" })}>
            <Plus />
            Add Expense
          </Button>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">{rows.length === 0 ? "No expenses recorded yet." : "No expenses match."}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                {["Date", "Applies to", "Category", "Supplier", "Method", "Notes", "Files", "Amount"].map((h, i) => (
                  <TableHead key={h} className={cn("h-12 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase", i === 7 && "text-right")}>
                    {h}
                  </TableHead>
                ))}
                {(canEdit || canDelete) && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id} data-testid="expense-row">
                  <TableCell className="px-3 py-3 whitespace-nowrap">{longDate(new Date(r.spentAt))}</TableCell>
                  <TableCell className="px-3 py-3">
                    {r.orderId ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <ShoppingCart className="size-3.5 shrink-0 text-muted-foreground" />
                        {r.orderLabel}
                      </span>
                    ) : (
                      <Badge variant="info">
                        <Building2 data-icon="inline-start" />
                        Company
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {EXPENSE_CATEGORY_LABEL[r.category]}
                      {r.recurringExpenseId && (
                        <Badge variant="outline" data-testid="recurring-badge">
                          <Repeat data-icon="inline-start" />
                          Recurring
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3">{r.supplierName ?? "—"}</TableCell>
                  <TableCell className="px-3 py-3">{r.paymentMethod ? (METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod) : "—"}</TableCell>
                  <TableCell className="max-w-56 truncate px-3 py-3 text-muted-foreground">{r.notes ?? "—"}</TableCell>
                  <TableCell className="px-3 py-3">
                    <ExpenseFiles attachments={r.attachments} />
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-semibold tabular-nums">{inr(r.amount)}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${EXPENSE_CATEGORY_LABEL[r.category]} expense`} onClick={() => setDialog({ mode: "edit", row: r })}>
                            <Pencil />
                          </Button>
                        )}
                        {canDelete && (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${EXPENSE_CATEGORY_LABEL[r.category]} expense`} onClick={() => setRemoving(r)}>
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

      {dialog && <ExpenseDialog key={dialog.mode === "edit" ? dialog.row.id : "add"} orderId={dialog.mode === "edit" ? dialog.row.orderId : null} orderOptions={orderOptions} suppliers={suppliers} canStopRepeating={canDelete} state={dialog} onClose={() => setDialog(null)} onDone={setNotice} />}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>{removing ? `${EXPENSE_CATEGORY_LABEL[removing.category]} · ${inr(removing.amount)} will be removed.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemove()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
