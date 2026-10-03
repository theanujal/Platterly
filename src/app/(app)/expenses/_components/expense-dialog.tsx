"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, IndianRupee, Receipt, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMPANY_EXPENSE_CATEGORIES, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type ExpenseCategoryValue } from "@/modules/expenses/profitability";
import { createExpenseAction, updateExpenseAction } from "../../profitability/actions";

export interface ExpenseRowData {
  id: string;
  /** null for a company expense. */
  orderId: string | null;
  category: ExpenseCategoryValue;
  amount: number;
  spentAt: string;
  paymentMethod: string | null;
  supplierName: string | null;
  notes: string | null;
}

export const METHOD_LABEL: Record<string, string> = { UPI: "UPI", CARD: "Card", NET_BANKING: "Net Banking", CASH: "Cash", BANK_TRANSFER: "Bank Transfer" };
const METHOD_OPTIONS: Record<string, string> = { NONE: "Not specified", ...METHOD_LABEL };
const COMPANY = "COMPANY";
const todayIso = () => new Date().toISOString().slice(0, 10);

const categoryOptions = (forOrder: boolean) => Object.fromEntries((forOrder ? EXPENSE_CATEGORIES : COMPANY_EXPENSE_CATEGORIES).map((c) => [c, EXPENSE_CATEGORY_LABEL[c]]));

function SelectField({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={options} value={value} onValueChange={(v) => onChange(v ?? value)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Add / edit an expense. On an order's own tab `orderId` is fixed. On the Expenses page `orderOptions`
 * is given and the person chooses what it applies to: the company (rent, salaries...) or one order.
 * Editing never moves an expense between the company and an order.
 */
export function ExpenseDialog({
  orderId,
  orderOptions,
  state,
  onClose,
  onDone,
}: {
  orderId: string | null;
  orderOptions?: { id: string; label: string }[];
  state: { mode: "add" } | { mode: "edit"; row: ExpenseRowData };
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const router = useRouter();
  const row = state.mode === "edit" ? state.row : null;
  const picker = !row && orderOptions !== undefined;
  const [target, setTarget] = useState<string>(orderId ?? COMPANY);
  const forOrder = target !== COMPANY;
  const [category, setCategory] = useState<string>(row?.category ?? (forOrder ? "FOOD" : "RENT"));
  const [amount, setAmount] = useState(row ? String(row.amount) : "");
  const [spentAt, setSpentAt] = useState(row ? row.spentAt.slice(0, 10) : todayIso());
  const [method, setMethod] = useState(row?.paymentMethod ?? "NONE");
  const [supplier, setSupplier] = useState(row?.supplierName ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function changeTarget(next: string) {
    setTarget(next);
    const nextForOrder = next !== COMPANY;
    // Keep the category when both kinds allow it, otherwise start from that kind's first one.
    const allowed = nextForOrder ? EXPENSE_CATEGORIES : COMPANY_EXPENSE_CATEGORIES;
    if (!(allowed as readonly string[]).includes(category)) setCategory(nextForOrder ? "FOOD" : "RENT");
  }

  async function submit() {
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) return setError("Enter an amount greater than zero.");
    setPending(true);
    const form = { category, amount: value, spentAt, paymentMethod: method, supplierName: supplier, notes };
    const targetOrderId = row ? row.orderId : forOrder ? target : null;
    const result = row ? await updateExpenseAction(targetOrderId, row.id, form) : await createExpenseAction(targetOrderId, form);
    setPending(false);
    if (!result.ok) return setError(result.error);
    onClose();
    onDone(row ? "Expense updated." : "Expense added.");
    router.refresh();
  }

  const title = row ? (row.orderId ? "Edit Expense" : "Edit Company Expense") : "Add Expense";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>{forOrder ? "A cost you paid for this event, such as food, labour or transport." : "A cost of running the business that belongs to no single order, such as rent or salaries."}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {picker && (
            <SelectField id="exp-target" label="Applies to" value={target} onChange={changeTarget} options={{ [COMPANY]: "Company (not tied to an order)", ...Object.fromEntries(orderOptions.map((o) => [o.id, o.label])) }} />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField id="exp-category" label="Category" value={category} onChange={setCategory} options={categoryOptions(forOrder)} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-amount">Amount</Label>
              <IconInput icon={IndianRupee} id="exp-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <IconInput icon={CalendarDays} id="exp-date" type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
            </div>
            <SelectField id="exp-method" label="Payment method" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-supplier">Supplier (optional)</Label>
            <IconInput icon={Store} id="exp-supplier" placeholder="Who you paid" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-notes">Notes (optional)</Label>
            <Textarea id="exp-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            <Receipt />
            {pending ? "Saving…" : row ? "Save Expense" : "Add Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
