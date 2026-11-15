"use client";

import { useEffect, useState } from "react";
import { Badge } from "./ui";
import type { PaymentRow, SubscriptionRow, InvoiceRow } from "@/modules/account/billing";

export type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "no_business" }
  | { phase: "not_admin" }
  | { phase: "ready"; business: string; subscriptions: SubscriptionRow[]; invoices: InvoiceRow[]; payments: PaymentRow[] };

/** The business's billing as Ops holds it (read-only). One fetch shared by the two pages. */
export function useBilling(reloadKey = 0): State {
  const [state, setState] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/billing", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (!res.ok) return setState({ phase: "error" });
        const body = (await res.json()) as { status?: string; business?: { name: string }; subscriptions?: SubscriptionRow[]; invoices?: InvoiceRow[]; payments?: PaymentRow[] };
        if (!alive) return;
        if (body.status === "no_business") return setState({ phase: "no_business" });
        if (body.status === "not_admin") return setState({ phase: "not_admin" });
        if (body.status === "ok" && body.business && body.subscriptions && body.invoices && body.payments) setState({ phase: "ready", business: body.business.name, subscriptions: body.subscriptions, invoices: body.invoices, payments: body.payments });
        else setState({ phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  return state;
}

export const inr = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
export const term = (interval: "MONTHLY" | "ANNUAL") => (interval === "ANNUAL" ? "yearly" : "monthly");
export const TONE = { good: "success", info: "info", warn: "warning", bad: "warning", none: "neutral" } as const;

export function Gate({ state, children }: { state: State; children: (s: Extract<State, { phase: "ready" }>) => React.ReactNode }) {
  if (state.phase === "loading") return <p className="pa-muted" role="status" aria-busy="true">Loading your billing…</p>;
  if (state.phase === "error") return <p className="pa-muted" role="alert">We could not load your billing just now. Please reload the page in a few minutes.</p>;
  if (state.phase === "no_business") return <p className="pa-muted" role="status">You have not set up a business yet, so there is no billing to show.</p>;
  if (state.phase === "not_admin") return <p className="pa-muted" role="status">Billing is available to the business Admin only.</p>;
  return <>{children(state)}</>;
}

export const HOUR = 3_600_000;
export function paymentBadge(p: PaymentRow) {
  if (p.status === "PAID") return <Badge tone="success">Paid</Badge>;
  if (p.status === "FAILED") return <Badge tone="warning">Failed</Badge>;
  // Started and not finished: in progress for the first hour, after that it was not completed.
  return Date.now() - new Date(p.at).getTime() < HOUR ? <Badge tone="info">In progress</Badge> : <Badge tone="neutral">Not completed</Badge>;
}

export const STATUS_LABEL: Record<string, string> = { TRIALING: "Trial", ACTIVE: "Active", CANCELLED: "Cancelled", LOCKED: "Locked", PAST_DUE: "Payment due", EXPIRED: "Expired" };
export const AUTO_PAY_LABEL: Record<string, string> = { ACTIVE: "On", PENDING: "Payment failed, retrying", PAUSED: "Paused", HALTED: "Stopped: set up again in the Store", CANCELLED: "Off" };
export const label = (status: string) => STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");

export async function postAutoRenewal(body: Record<string, unknown>) {
  const res = await fetch("/api/account/payment-methods", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  return { ok: res.ok, json: ((await res.json().catch(() => ({}))) as { message?: string }) ?? {} };
}

/** Pause, resume or stop a monthly plan's auto-renewal, here in the Account (the same Ops actions as the Payment method page). */
export function AutoRenewalControls({ productKey, status, onChanged }: { productKey: string; status: "ACTIVE" | "PENDING" | "PAUSED" | "HALTED" | "CANCELLED"; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"pause" | "cancel" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (status !== "ACTIVE" && status !== "PAUSED") return null;

  async function change(what: "pause" | "resume" | "cancel") {
    setBusy(true);
    setConfirm(null);
    setNote(null);
    try {
      const done = await postAutoRenewal({ action: `autopay-${what}`, productKey });
      if (!done.ok) return setNote({ ok: false, text: done.json.message ?? "We could not change your auto-renewal. Nothing was changed." });
      setNote({ ok: true, text: what === "pause" ? "Auto-renewal is paused. Nothing more will be charged until you resume it." : what === "resume" ? "Auto-renewal is back on." : "Auto-renewal is stopped. Your paid days keep working until they end." });
      onChanged();
    } catch {
      setNote({ ok: false, text: "Something went wrong. Nothing was changed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="auto-renewal-controls">
      {confirm ? (
        <div role="alertdialog" aria-label={confirm === "pause" ? "Pause auto-renewal" : "Stop auto-renewal"}>
          <p className="pa-muted">
            {confirm === "pause"
              ? "Pause auto-renewal? Nothing is charged while it is paused. Your paid days keep working; if they run out before you resume, your account is locked after the 7-day grace."
              : "Stop auto-renewal for good? Your paid days keep working, then the 7-day grace and the lock apply. Nothing is refunded, and you start again from the Store."}
          </p>
          <button type="button" className="pa-btn pa-btn-primary" disabled={busy} onClick={() => change(confirm)}>{confirm === "pause" ? "Yes, pause" : "Yes, stop auto-renewal"}</button>{" "}
          <button type="button" className="pa-btn pa-btn-outline" onClick={() => setConfirm(null)}>Keep it on</button>
        </div>
      ) : (
        <p>
          {status === "ACTIVE" ? <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => setConfirm("pause")}>Pause auto-renewal</button> : <button type="button" className="pa-btn pa-btn-primary" disabled={busy} onClick={() => change("resume")}>Resume auto-renewal</button>}{" "}
          <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => setConfirm("cancel")}>Stop auto-renewal</button>
        </p>
      )}
      {note ? <p className={note.ok ? "pa-hint" : "pa-muted"} role={note.ok ? "status" : "alert"}>{note.text}</p> : null}
    </div>
  );
}

export const withinRefundWindow = (paidAt: string) => Date.now() - new Date(paidAt).getTime() <= 7 * 86_400_000;
export const REFUND_BADGE = { PENDING: { tone: "info", text: "Refund requested" }, REJECTED: { tone: "neutral", text: "Refund declined" }, PARTIAL: { tone: "info", text: "Partly refunded" }, REFUNDED: { tone: "success", text: "Refunded" } } as const;

/** "Request a refund" on one paid payment: the reason goes to Platterly staff, who decide in Ops. Not offered while a request is waiting or once the payment is refunded in full. */
export function RefundRequest({ payment, onChanged }: { payment: PaymentRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const status = payment.refund?.status;
  const badge = status ? REFUND_BADGE[status] : null;
  // A refund can be asked for within 7 days of paying (AJ, 2026-11-15); Ops enforces it too.
  const inWindow = withinRefundWindow(payment.at);
  const canAsk = payment.status === "PAID" && inWindow && (!status || status === "REJECTED" || status === "PARTIAL");

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/account/refund", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ productKey: payment.productKey, paymentId: payment.id, reason }) });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) return setNote({ ok: false, text: json.message ?? "We could not send your request. Please try again in a few minutes." });
      setOpen(false);
      setReason("");
      setNote({ ok: true, text: "Your refund request is sent. We will email you once it is decided." });
      onChanged();
    } catch {
      setNote({ ok: false, text: "Something went wrong. Your request was not sent." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid={`refund-${payment.id}`}>
      <span className="pa-row-actions">
        {badge ? <Badge tone={badge.tone}>{badge.text}{status === "PARTIAL" && payment.refund ? ` ${inr(payment.refund.refunded)}` : ""}</Badge> : null}
        {(payment.creditNotes ?? []).map((n) => (
          <a key={n.id} className="pa-btn pa-btn-outline" href={`/api/account/credit-notes/${encodeURIComponent(n.id)}?product=${encodeURIComponent(payment.productKey)}`} download>Credit note {n.number}</a>
        ))}
        {canAsk && !open ? <button type="button" className="pa-btn pa-btn-outline" onClick={() => setOpen(true)}>Request a refund</button> : null}
      </span>
      {open ? (
        <form className="pa-form" onSubmit={(e) => { e.preventDefault(); void send(); }} aria-label="Request a refund">
          <label className="pa-hint" htmlFor={`refund-reason-${payment.id}`}>Why are you asking for a refund?</label>
          <textarea id={`refund-reason-${payment.id}`} className="pa-input" rows={3} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="pa-hint">Refunds can be asked for within 7 days of paying. Our team decides the amount. If it is approved, it goes back to the way you paid.</p>
          <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !reason.trim()}>Send request</button>{" "}
          <button type="button" className="pa-btn pa-btn-outline" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      ) : null}
      {note ? <p className={note.ok ? "pa-hint" : "pa-muted"} role={note.ok ? "status" : "alert"}>{note.text}</p> : null}
    </div>
  );
}

export function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}
