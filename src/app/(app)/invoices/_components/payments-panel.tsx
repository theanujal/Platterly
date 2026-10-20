"use client";

import { PAYMENT_BLOCKED_TEXT } from "@/modules/payments/payment-math";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, Copy, CreditCard, FileText, Hourglass, Link2, Receipt, Send, Star, Tag, Truck, UtensilsCrossed, Users, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import { cn } from "cn";
import { useLiveOrderTotal, useOrderPriceLines } from "@/modules/orders/live-total";
import { confirmPaymentAction, createPaymentLinkAction, recordPaymentAction, rejectPaymentAction, sendReceiptAction, type ActionResult } from "../actions";
import { Badge } from "@/components/ui/badge";
import { PaymentStatusBadge } from "./invoice-badges";

export interface PaymentRowData {
  id: string;
  amount: number;
  type: "ADVANCE" | "PARTIAL" | "FINAL";
  method: "UPI" | "CARD" | "NET_BANKING" | "CASH" | "BANK_TRANSFER";
  source: "MANUAL" | "RAZORPAY" | "UPI_QR";
  status: "PENDING" | "CONFIRMED" | "FAILED";
  receivedAt: string;
  reference: string | null;
  receipt: { id: string; number: string } | null;
}

const TYPE_LABEL = { ADVANCE: "Advance", PARTIAL: "Partial", FINAL: "Final" } as const;
const METHOD_LABEL = { UPI: "UPI", CARD: "Card", NET_BANKING: "Net Banking", CASH: "Cash", BANK_TRANSFER: "Bank Transfer" } as const;
const SOURCE_LABEL = { MANUAL: "recorded by the team", RAZORPAY: "via Razorpay", UPI_QR: "UPI QR" } as const;

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

/** A small icon for a priced line, picked from its label (the lines come from the order form as plain text). */
function lineIcon(label: string): LucideIcon {
  const text = label.toLowerCase();
  if (text.startsWith("meals") || text.startsWith("extra dishes")) return UtensilsCrossed;
  if (text.startsWith("children")) return Users;
  if (text.startsWith("transport")) return Truck;
  if (text.startsWith("extra / service")) return Star;
  if (text.startsWith("discount")) return Tag;
  return Receipt;
}

/** The "Payment Summary" card (priced lines, total, paid, balance), the same on an existing order and on the New Order page. */
export function PaymentSummaryCard({ total, paid, balance, overdue = false, children }: { total: number; paid: number; balance: number; overdue?: boolean; children?: React.ReactNode }) {
  const lines = useOrderPriceLines();
  const chip = (Icon: LucideIcon) => (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-4" />
    </span>
  );
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wallet className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            Payment Summary
            {overdue && <Badge variant="danger" data-testid="payment-overdue">Overdue</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">Live totals for this order.</p>
        </div>
      </div>
      {lines.length > 0 && (
        <dl className="flex flex-col divide-y divide-border text-sm tabular-nums" data-testid="payment-summary-lines">
          {lines.map((line, index) => (
            <div key={`${line.label}-${index}`} className="flex items-center gap-3 py-2 first:pt-0">
              {chip(lineIcon(line.label))}
              <dt className="min-w-0 flex-1 text-muted-foreground">
                {line.label}
                {line.detail && <span className="block text-xs">{line.detail}</span>}
              </dt>
              <dd className="shrink-0 font-medium">{line.negative ? `− ${inr(line.amount)}` : inr(line.amount)}</dd>
            </div>
          ))}
        </dl>
      )}
      <dl className="flex flex-col gap-2 text-sm tabular-nums">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 text-accent-foreground">
          <dt className="font-semibold">Total</dt>
          <dd className="text-lg font-semibold">{inr(total)}</dd>
        </div>
        <div className="flex items-center gap-3 py-1">
          {chip(CreditCard)}
          <dt className="flex-1 text-muted-foreground">Paid</dt>
          <dd className="font-semibold text-success" data-testid="paid-amount">
            {inr(paid)}
          </dd>
        </div>
        <div className="flex items-center gap-3 py-1">
          {chip(Hourglass)}
          <dt className="flex-1 text-muted-foreground">Balance</dt>
          <dd className="font-semibold" data-testid="balance-amount">
            {inr(balance)}
          </dd>
        </div>
      </dl>
      {children}
    </div>
  );
}

/** The "Payments" history card: its rows are `PaymentRowView`s. */
export function PaymentsListCard({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clock className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Payments</h2>
          <p className="text-sm text-muted-foreground">Payments received for this order.</p>
        </div>
      </div>
      {empty && (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CreditCard className="size-5" />
          </span>
          <p className="text-sm font-medium">No payments yet.</p>
          <p className="text-xs text-muted-foreground">Record a payment or create a payment link to get started.</p>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-border">{children}</ul>
    </div>
  );
}

export function PaymentRowView({
  id,
  amount,
  type,
  method,
  receivedAt,
  sourceText,
  reference,
  trailing,
}: {
  id: string;
  amount: number;
  type: keyof typeof TYPE_LABEL;
  method: keyof typeof METHOD_LABEL;
  receivedAt: string;
  sourceText: string;
  reference: string | null;
  trailing: React.ReactNode;
}) {
  return (
    <li key={id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0" data-testid="payment-row">
      <div className="min-w-36 flex-1">
        <span className="block font-semibold tabular-nums">{inr(amount)}</span>
        <span className="block text-xs text-muted-foreground">
          {TYPE_LABEL[type]} · {METHOD_LABEL[method]} · {longDate(new Date(receivedAt))} · {sourceText}
        </span>
        {reference && <span className="block text-xs text-muted-foreground">Ref {reference}</span>}
      </div>
      {trailing}
    </li>
  );
}

export function PaymentsPanel({
  orderId,
  invoiceId,
  total: savedTotal,
  paid,
  balance: savedBalance,
  payments,
  canRecord,
  canManage,
  recordBlocked = false,
  overdue = false,
}: {
  orderId: string;
  invoiceId?: string;
  total: number;
  paid: number;
  balance: number;
  payments: PaymentRowData[];
  canRecord: boolean;
  canManage: boolean;
  /** The customer has not approved the order yet: Record Payment and Create Payment Link stay visible but disabled, with the reason. */
  recordBlocked?: boolean;
  /** The order's event is over and money is still owed (isPaymentOverdue). */
  overdue?: boolean;
}) {
  const router = useRouter();
  // Inside the order form the total follows the pricing typed there, saved or not.
  const liveTotal = useLiveOrderTotal();
  const total = liveTotal ?? savedTotal;
  const balance = liveTotal === null ? savedBalance : Math.max(liveTotal - paid, 0);
  const [recordOpen, setRecordOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function rowAction(id: string, task: () => Promise<ActionResult>) {
    setBusyId(id);
    const result = await task();
    setBusyId(null);
    setNotice(result.ok ? { ok: true, text: result.message ?? "Done." } : { ok: false, text: result.error });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3" data-testid="payments-panel">
      <PaymentSummaryCard total={total} paid={paid} balance={balance} overdue={overdue}>
        {canRecord && balance > 0 && (
          <div className="flex flex-col gap-2">
            <Button type="button" size="md" disabled={recordBlocked} onClick={() => setRecordOpen(true)}>
              <CreditCard />
              Record Payment
            </Button>
            <Button type="button" variant="outline" size="md" disabled={recordBlocked} onClick={() => setLinkOpen(true)}>
              <Link2 />
              Create Payment Link
            </Button>
            {recordBlocked && (
              <p className="text-xs text-muted-foreground" data-testid="payment-blocked-reason">
                {PAYMENT_BLOCKED_TEXT}
              </p>
            )}
          </div>
        )}
      </PaymentSummaryCard>

      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm", notice.ok ? "border-success/25 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive")}>
          {notice.text}
        </p>
      )}

      <PaymentsListCard empty={payments.length === 0}>
        {payments.map((payment) => (
          <PaymentRowView
            key={payment.id}
            id={payment.id}
            amount={payment.amount}
            type={payment.type}
            method={payment.method}
            receivedAt={payment.receivedAt}
            sourceText={SOURCE_LABEL[payment.source]}
            reference={payment.reference}
            trailing={
              <>
                <PaymentStatusBadge status={payment.status} />
                {payment.status === "PENDING" && payment.source === "UPI_QR" && canManage && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={busyId === payment.id} onClick={() => rowAction(payment.id, () => confirmPaymentAction(payment.id, false))}>
                      Confirm
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busyId === payment.id} onClick={() => rowAction(payment.id, () => rejectPaymentAction(payment.id))}>
                      Reject
                    </Button>
                  </div>
                )}
                {payment.status === "CONFIRMED" && payment.receipt && canManage && (
                  <Button type="button" variant="ghost" size="sm" disabled={busyId === payment.id} onClick={() => rowAction(payment.id, () => sendReceiptAction(payment.id))} title={`Send receipt ${payment.receipt.number}`}>
                    <Send />
                    Send receipt
                  </Button>
                )}
              </>
            }
          />
        ))}
      </PaymentsListCard>

      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        orderId={orderId}
        invoiceId={invoiceId}
        balance={balance}
        paid={paid}
        total={total}
        onDone={(message) => setNotice({ ok: true, text: message })}
      />
      <PaymentLinkDialog open={linkOpen} onOpenChange={setLinkOpen} orderId={orderId} invoiceId={invoiceId} balance={balance} onDone={(message) => setNotice({ ok: true, text: message })} />
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** A payment added on the New Order page: held in the form and recorded when the order is saved. */
export interface StagedPaymentDraft {
  key: string;
  amount: number;
  type: "ADVANCE" | "PARTIAL" | "FINAL";
  method: "UPI" | "CARD" | "NET_BANKING" | "CASH" | "BANK_TRANSFER";
  receivedAt: string;
  reference: string;
  sendReceipt: boolean;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  orderId,
  invoiceId,
  balance,
  paid,
  total,
  onDone,
  onStage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent on the New Order page, where the payment is staged (`onStage`) instead of recorded. */
  orderId?: string;
  invoiceId?: string;
  balance: number;
  paid: number;
  total: number;
  onDone?: (message: string) => void;
  onStage?: (payment: Omit<StagedPaymentDraft, "key">) => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(balance));
  const [type, setType] = useState(paid > 0 ? "FINAL" : "ADVANCE");
  const [method, setMethod] = useState("UPI");
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"only" | "send" | null>(null);

  async function submit(sendReceipt: boolean) {
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) return setError("Enter an amount greater than zero.");
    if (onStage) {
      // New order: nothing to record against yet. The payment is held with the form and recorded, with its receipt, on Save.
      if (value > balance + 0.005) return setError(`That is more than the balance of ${inr(balance)}.`);
      onStage({ amount: value, type: type as StagedPaymentDraft["type"], method: method as StagedPaymentDraft["method"], receivedAt, reference, sendReceipt });
      onOpenChange(false);
      return;
    }
    if (!orderId) return;
    setPending(sendReceipt ? "send" : "only");
    const result = await recordPaymentAction({ orderId, invoiceId: invoiceId ?? null, amount: value, type, method, receivedAt, reference, sendReceipt });
    setPending(null);
    if (!result.ok) return setError(result.error);
    onOpenChange(false);
    onDone?.(result.message ?? "Payment recorded.");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Record Payment</DialogTitle>
          <DialogDescription>
            Balance {inr(balance)} of {inr(total)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-amount">Amount</Label>
              <IconInput icon={CreditCard} id="pay-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <SelectField id="pay-type" label="Payment Type" value={type} onChange={setType} options={{ ADVANCE: "Advance", PARTIAL: "Partial payment", FINAL: "Final payment" }} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField id="pay-method" label="Method" value={method} onChange={setMethod} options={{ UPI: "UPI", CARD: "Card", NET_BANKING: "Net Banking", CASH: "Cash", BANK_TRANSFER: "Bank Transfer" }} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-date">Date received</Label>
              <IconInput icon={CalendarDays} id="pay-date" type="date" value={receivedAt} max={todayIso()} onChange={(e) => setReceivedAt(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <IconInput icon={FileText} id="pay-ref" placeholder="UPI transaction ID or cheque number" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending !== null} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="outline" disabled={pending !== null} onClick={() => submit(false)}>
            {pending === "only" ? "Recording…" : "Record Only"}
          </Button>
          <Button type="button" disabled={pending !== null} onClick={() => submit(true)}>
            <Send />
            {pending === "send" ? "Recording…" : "Record & Send Receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentLinkDialog({
  open,
  onOpenChange,
  orderId,
  invoiceId,
  balance,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  invoiceId?: string;
  balance: number;
  onDone: (message: string) => void;
}) {
  const [kind, setKind] = useState<"ADVANCE" | "BALANCE" | "CUSTOM">("ADVANCE");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"copy" | "send" | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const options: { key: typeof kind; title: string; hint: string }[] = [
    { key: "ADVANCE", title: "Advance", hint: "Your advance percentage of the order" },
    { key: "BALANCE", title: "Balance", hint: `What is still unpaid, ${inr(balance)}` },
    { key: "CUSTOM", title: "Custom amount", hint: "Partial payment" },
  ];

  async function submit(send: boolean) {
    setError(null);
    setPending(send ? "send" : "copy");
    const result = await createPaymentLinkAction({ orderId, invoiceId: invoiceId ?? null, kind, amount: kind === "CUSTOM" ? Number(custom) : undefined, send });
    setPending(null);
    if (!result.ok) return setError(result.error);
    setCreated(result.url);
    if (!send) {
      try {
        await navigator.clipboard.writeText(result.url);
      } catch {
        /* the link is shown below to copy by hand */
      }
    }
    onDone(`${result.message ?? "Payment link ready."} ${inr(result.amount)}.`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setCreated(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Create Payment Link</DialogTitle>
          <DialogDescription>The customer pays on a page of their own, with no login.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Amount">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={kind === option.key}
              onClick={() => setKind(option.key)}
              className={cn("flex items-center gap-3 rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", kind === option.key ? "border-primary bg-accent" : "border-border")}
            >
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", kind === option.key ? "border-primary" : "border-border")}>{kind === option.key && <span className="size-2.5 rounded-full bg-primary" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{option.title}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {kind === "CUSTOM" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-custom">Amount</Label>
            <IconInput icon={CreditCard} id="link-custom" type="number" min={0} step="0.01" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </div>
        )}
        {created && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3">
            <p className="min-w-0 flex-1 font-mono text-xs break-all" data-testid="payment-link-url">
              {created}
            </p>
            <Button type="button" variant="outline" size="md" className="w-[38px] shrink-0 px-0" aria-label="Copy link" onClick={() => void navigator.clipboard.writeText(created).catch(() => undefined)}>
              <Copy />
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {created ? "Close" : "Cancel"}
          </Button>
          <Button type="button" variant="outline" disabled={pending !== null} onClick={() => submit(false)}>
            <Copy />
            {pending === "copy" ? "Creating…" : "Copy Link"}
          </Button>
          <Button type="button" disabled={pending !== null} onClick={() => submit(true)}>
            <Send />
            {pending === "send" ? "Sending…" : "Send Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
