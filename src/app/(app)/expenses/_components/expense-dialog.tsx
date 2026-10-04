"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, IndianRupee, Pause, Play, Receipt, Repeat, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { COMPANY_EXPENSE_CATEGORIES, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type ExpenseCategoryValue } from "@/modules/expenses/profitability";
import { RECURRENCE_FREQUENCIES, RECURRENCE_LABEL, type RecurrenceFrequencyValue } from "@/modules/expenses/recurrence";
import { longDate } from "@/modules/invoices/invoice-format";
import {
  createExpenseAction,
  createRecurringExpenseAction,
  deleteRecurringExpenseAction,
  removeExpenseAttachmentAction,
  setRecurringExpenseActiveAction,
  updateExpenseAction,
  updateRecurringExpenseAction,
  uploadExpenseAttachmentAction,
} from "../../profitability/actions";

export interface ExpenseRowData {
  id: string;
  /** null for a company expense. */
  orderId: string | null;
  category: ExpenseCategoryValue;
  amount: number;
  spentAt: string;
  paymentMethod: string | null;
  supplierName: string | null;
  supplierId?: string | null;
  notes: string | null;
  recurringExpenseId?: string | null;
  /** The schedule that booked this expense, when one did. */
  recurring?: { frequency: RecurrenceFrequencyValue; isActive: boolean; startDate: string; endDate: string | null; nextDue: string | null } | null;
  attachments?: ExpenseAttachmentData[];
}

export interface ExpenseAttachmentData {
  id: string;
  fileName: string;
  url: string;
  contentType: string;
}

/** The same limits the server enforces (attachment.ts), checked first so a bad file fails before anything is saved. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const fileProblem = (file: File) => (!ACCEPT.split(",").includes(file.type) ? `${file.name}: only PNG, JPG, WebP or PDF files.` : file.size > MAX_FILE_BYTES ? `${file.name}: files must be 4MB or smaller.` : null);

export const METHOD_LABEL: Record<string, string> = { UPI: "UPI", CARD: "Card", NET_BANKING: "Net Banking", CASH: "Cash", BANK_TRANSFER: "Bank Transfer" };
const METHOD_OPTIONS: Record<string, string> = { NONE: "Not specified", ...METHOD_LABEL };
const COMPANY = "COMPANY";
const todayIso = () => new Date().toISOString().slice(0, 10);

const FREQUENCY_OPTIONS = Object.fromEntries(RECURRENCE_FREQUENCIES.map((f) => [f, RECURRENCE_LABEL[f]]));

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
  suppliers = [],
  state,
  canStopRepeating = false,
  onClose,
  onDone,
}: {
  orderId: string | null;
  orderOptions?: { id: string; label: string }[];
  /** Active suppliers to pick from; a name can still be typed for a one-off shop. */
  suppliers?: { id: string; name: string }[];
  state: { mode: "add" } | { mode: "edit"; row: ExpenseRowData };
  /** May this person delete a repeating schedule (owner only)? */
  canStopRepeating?: boolean;
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
  const [supplierId, setSupplierId] = useState(row?.supplierId ?? "");
  const [supplier, setSupplier] = useState(row?.supplierId ? "" : (row?.supplierName ?? ""));
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState<ExpenseAttachmentData[]>(row?.attachments ?? []);
  // Once the expense itself is saved, a retry (after a failed upload) must edit it, not create a second one.
  const [savedId, setSavedId] = useState<string | null>(null);
  // Repeating: a company expense can be set to repeat when it is added; one a schedule booked can be paused or stopped.
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState<string>("MONTHLY");
  const [endDate, setEndDate] = useState("");
  const [applyToFuture, setApplyToFuture] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const repeating = !row && !forOrder && repeats;
  const schedule = row?.recurring && row.recurringExpenseId ? row.recurring : null;

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    const bad = incoming.map(fileProblem).find(Boolean);
    if (bad) return setError(bad);
    if (existing.length + files.length + incoming.length > MAX_FILES) return setError(`An expense can have at most ${MAX_FILES} files.`);
    setError(null);
    setFiles((f) => [...f, ...incoming]);
  }

  async function removeExisting(id: string) {
    const result = await removeExpenseAttachmentAction(row?.orderId ?? null, id);
    if (!result.ok) return setError(result.error);
    setExisting((list) => list.filter((a) => a.id !== id));
    router.refresh();
  }

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
    const form = { category, amount: value, spentAt, paymentMethod: method, supplierName: supplier, supplierId, notes };
    const targetOrderId = row ? row.orderId : forOrder ? target : null;
    if (repeating) {
      const made = await createRecurringExpenseAction({ category, amount: value, frequency, startDate: spentAt, endDate, paymentMethod: method, supplierName: supplier, supplierId, notes });
      setPending(false);
      if (!made.ok) return setError(made.error);
      router.refresh();
      onClose();
      return onDone("Repeating expense added. Dates already due are booked now.");
    }
    const editingId = row?.id ?? savedId;
    let expenseId = editingId;
    if (editingId) {
      const result = await updateExpenseAction(targetOrderId, editingId, form);
      if (!result.ok) {
        setPending(false);
        return setError(result.error);
      }
    } else {
      const result = await createExpenseAction(targetOrderId, form);
      if (!result.ok) {
        setPending(false);
        return setError(result.error);
      }
      expenseId = result.expenseId;
      setSavedId(result.expenseId);
    }
    // One file per call: a Server Action's request body is capped at 5MB.
    const failed: string[] = [];
    const remaining: File[] = [];
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      const uploaded = await uploadExpenseAttachmentAction(targetOrderId, expenseId!, body);
      if (!uploaded.ok) {
        failed.push(`${file.name}: ${uploaded.error}`);
        remaining.push(file);
      }
    }
    if (schedule && row?.recurringExpenseId && applyToFuture) {
      const future = await updateRecurringExpenseAction(row.recurringExpenseId, {
        category,
        amount: value,
        frequency: schedule.frequency,
        startDate: schedule.startDate,
        endDate: schedule.endDate ?? "",
        paymentMethod: method,
        supplierName: supplier,
        supplierId,
        notes,
      });
      if (!future.ok) {
        setPending(false);
        router.refresh();
        return setError(`This expense was saved, but the schedule could not be changed. ${future.error}`);
      }
    }
    setPending(false);
    router.refresh();
    if (failed.length > 0) {
      setFiles(remaining);
      return setError(`The expense was saved, but ${failed.length === 1 ? "a file" : `${failed.length} files`} could not be attached. ${failed[0]}`);
    }
    onClose();
    onDone(editingId ? (schedule && applyToFuture ? "Expense updated. Future bookings use the new values." : "Expense updated.") : "Expense added.");
  }

  async function togglePause() {
    if (!schedule || !row?.recurringExpenseId) return;
    const result = await setRecurringExpenseActiveAction(row.recurringExpenseId, !schedule.isActive);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onClose();
    onDone(schedule.isActive ? "Repeating paused. Nothing new is booked until you resume it." : "Repeating resumed. Dates that fell while it was paused are skipped.");
  }

  async function stopRepeating() {
    if (!row?.recurringExpenseId) return;
    const result = await deleteRecurringExpenseAction(row.recurringExpenseId);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onClose();
    onDone("Repeating stopped. Expenses already booked are kept.");
  }

  const title = row ? (row.orderId ? "Edit Expense" : "Edit Company Expense") : "Add Expense";
  const submitLabel = pending ? "Saving…" : row ? "Save Expense" : repeating ? "Add Repeating Expense" : "Add Expense";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
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
              <Label htmlFor="exp-date">{repeating ? "First date" : "Date"}</Label>
              <IconInput icon={CalendarDays} id="exp-date" type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
            </div>
            <SelectField id="exp-method" label="Payment method" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
          </div>
          {!row && !forOrder && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Repeat className="size-5 shrink-0 text-muted-foreground" />
                <Label htmlFor="exp-repeats" className="flex-1 cursor-pointer flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">This expense repeats</span>
                  <span className="text-xs font-normal text-muted-foreground">Rent, salaries and other costs that come round again. Each due date is booked for you.</span>
                </Label>
                <Switch id="exp-repeats" checked={repeats} onCheckedChange={setRepeats} />
              </div>
              {repeats && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SelectField id="exp-frequency" label="Repeats" value={frequency} onChange={setFrequency} options={FREQUENCY_OPTIONS} />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="exp-end">Last date (optional)</Label>
                    <IconInput icon={CalendarDays} id="exp-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">A first date in the past books every date already due. Pause or stop it later from this expense.</p>
                </div>
              )}
            </div>
          )}
          {schedule && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-3" data-testid="repeat-box">
              <div className="flex items-center gap-3">
                <Repeat className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">
                    Repeats {RECURRENCE_LABEL[schedule.frequency].toLowerCase()} · {schedule.isActive ? "Active" : "Paused"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {schedule.isActive ? (schedule.nextDue ? `Next ${longDate(new Date(schedule.nextDue))}` : "No more dates") : "Nothing new is booked while paused"}
                    {schedule.endDate ? ` · until ${longDate(new Date(schedule.endDate))}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="exp-future" className="flex-1 cursor-pointer text-sm font-normal">
                  Use these changes for future bookings too
                </Label>
                <Switch id="exp-future" checked={applyToFuture} onCheckedChange={setApplyToFuture} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="md" onClick={() => void togglePause()}>
                  {schedule.isActive ? <Pause /> : <Play />}
                  {schedule.isActive ? "Pause repeating" : "Resume repeating"}
                </Button>
                {canStopRepeating &&
                  (confirmStop ? (
                    <Button type="button" variant="outline" size="md" className="text-destructive" onClick={() => void stopRepeating()}>
                      Stop for good? Keep what is booked
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="md" className="text-destructive" onClick={() => setConfirmStop(true)}>
                      Stop repeating
                    </Button>
                  ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-supplier">Supplier (optional)</Label>
            {suppliers.length > 0 && (
              <Select
                items={{ other: "Not in the list", ...Object.fromEntries(suppliers.map((s) => [s.id, s.name])) }}
                value={supplierId || "other"}
                onValueChange={(v) => setSupplierId(!v || v === "other" ? "" : v)}
              >
                <SelectTrigger id="exp-supplier-pick" aria-label="Supplier list" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Not in the list</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!supplierId && <IconInput icon={Store} id="exp-supplier" placeholder="Who you paid" value={supplier} onChange={(e) => setSupplier(e.target.value)} />}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-notes">Notes (optional)</Label>
            <Textarea id="exp-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {!repeating && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="exp-files">Receipts and bills (optional)</Label>
            {(existing.length > 0 || files.length > 0) && (
              <ul className="flex flex-col gap-1.5" data-testid="expense-file-list">
                {existing.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline">
                      {a.fileName}
                    </a>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${a.fileName}`} onClick={() => void removeExisting(a.id)}>
                      <X />
                    </Button>
                  </li>
                ))}
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB, saved with the expense</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {existing.length + files.length < MAX_FILES && <FileDropzone id="exp-files" accept={ACCEPT} label="Click to upload receipts or bills, or drag and drop" caption={`PNG, JPG, WebP or PDF, up to 4MB each, ${MAX_FILES} at most`} onFilesSelect={addFiles} />}
          </div>
          )}
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
            {repeating ? <Repeat /> : <Receipt />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
