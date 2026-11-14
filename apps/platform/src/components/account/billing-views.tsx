"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { AccountShell } from "./shell";
import { Badge, PageHeader } from "./ui";
import type { InvoiceRow, PaymentRow, SubscriptionRow } from "@/modules/account/billing";

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "no_business" }
  | { phase: "not_admin" }
  | { phase: "ready"; business: string; subscriptions: SubscriptionRow[]; invoices: InvoiceRow[]; payments: PaymentRow[] };

/** The business's billing as Ops holds it (read-only). One fetch shared by the two pages. */
function useBilling(reloadKey = 0): State {
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

const inr = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const term = (interval: "MONTHLY" | "ANNUAL") => (interval === "ANNUAL" ? "yearly" : "monthly");
const TONE = { good: "success", info: "info", warn: "warning", bad: "warning", none: "neutral" } as const;

function Gate({ state, children }: { state: State; children: (s: Extract<State, { phase: "ready" }>) => React.ReactNode }) {
  if (state.phase === "loading") return <p className="pa-muted" role="status" aria-busy="true">Loading your billing…</p>;
  if (state.phase === "error") return <p className="pa-muted" role="alert">We could not load your billing just now. Please reload the page in a few minutes.</p>;
  if (state.phase === "no_business") return <p className="pa-muted" role="status">You have not set up a business yet, so there is no billing to show.</p>;
  if (state.phase === "not_admin") return <p className="pa-muted" role="status">Billing is available to the business Admin only.</p>;
  return <>{children(state)}</>;
}

const LATEST_INVOICES = 3;

/** Overview section (E): each subscription's state and renewal date, and the latest invoices, from the same one fetch as the Invoices and Payments pages. */
export function BillingSummary() {
  const state = useBilling();
  // A person with no business has no billing: the products section above already says so, so nothing is added here.
  if (state.phase === "no_business" || state.phase === "not_admin") return null;
  return (
    <section aria-labelledby="ov-billing">
      <div className="pa-section-head">
        <h2 id="ov-billing">Subscriptions and invoices</h2>
        <Link href="/subscriptions" className="pa-link">
          All subscriptions <Icon name="chevronRight" size={14} />
        </Link>
      </div>
      <Gate state={state}>
        {(b) => (
          <div className="pa-grid-2">
            <article className="pa-card pa-form" aria-label="Subscriptions">
              {b.subscriptions.length === 0 ? (
                <p className="pa-muted">No subscriptions yet. Choose a plan in the Store.</p>
              ) : (
                <ul className="pa-sessions">
                  {b.subscriptions.map((s) => (
                    <li className="pa-session" key={s.productKey}>
                      <span className="pa-session-text">
                        <span className="pa-row-label">
                          {s.product}
                          {s.planName ? ` · ${s.planName}` : ""}
                        </span>
                        <span className="pa-hint">{s.display.detail}</span>
                      </span>
                      <Badge tone={TONE[s.display.tone]}>{s.display.label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="pa-card pa-form" aria-label="Latest invoices">
              {b.invoices.length === 0 ? (
                <p className="pa-muted">No invoices yet. One appears here as soon as a payment is confirmed.</p>
              ) : (
                <>
                  <ul className="pa-sessions">
                    {b.invoices.slice(0, LATEST_INVOICES).map((i) => (
                      <li className="pa-session" key={i.id}>
                        <span className="pa-session-text">
                          <span className="pa-row-label">{i.invoiceNumber}</span>
                          <span className="pa-hint">
                            {day(i.paidAt)} · {i.product} {i.planName}, {term(i.interval)} · {inr(i.total)} incl. GST
                          </span>
                        </span>
                        <a className="pa-btn pa-btn-outline" href={`/api/account/invoices/${encodeURIComponent(i.id)}?product=${encodeURIComponent(i.productKey)}`} download>
                          Download PDF
                        </a>
                      </li>
                    ))}
                  </ul>
                  <Link href="/invoices" className="pa-link">
                    All invoices <Icon name="chevronRight" size={14} />
                  </Link>
                </>
              )}
            </article>
          </div>
        )}
      </Gate>
    </section>
  );
}

export function InvoicesView() {
  const state = useBilling();
  return (
    <AccountShell>
      <PageHeader title="Invoices" lede="The GST invoices for what your business has paid. Download any of them as a PDF." />
      <Gate state={state}>
        {(b) =>
          b.invoices.length === 0 ? (
            <section className="pa-card"><p className="pa-muted">No invoices yet. One appears here as soon as a payment is confirmed.</p></section>
          ) : (
            <section className="pa-card pa-form" aria-label="Invoices">
              <ul className="pa-sessions">
                {b.invoices.map((i) => (
                  <li className="pa-session" key={i.id}>
                    <span className="pa-session-text">
                      <span className="pa-row-label">{i.invoiceNumber}</span>
                      <span className="pa-hint">{day(i.paidAt)} · {i.product} {i.planName}, {term(i.interval)} · {inr(i.total)} incl. GST</span>
                    </span>
                    <a className="pa-btn pa-btn-outline" href={`/api/account/invoices/${encodeURIComponent(i.id)}?product=${encodeURIComponent(i.productKey)}`} download>Download PDF</a>
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </Gate>
    </AccountShell>
  );
}

const HOUR = 3_600_000;
function paymentBadge(p: PaymentRow) {
  if (p.status === "PAID") return <Badge tone="success">Paid</Badge>;
  if (p.status === "FAILED") return <Badge tone="warning">Failed</Badge>;
  // Started and not finished: in progress for the first hour, after that it was not completed.
  return Date.now() - new Date(p.at).getTime() < HOUR ? <Badge tone="info">In progress</Badge> : <Badge tone="neutral">Not completed</Badge>;
}

const STATUS_LABEL: Record<string, string> = { TRIALING: "Trial", ACTIVE: "Active", CANCELLED: "Cancelled", LOCKED: "Locked", PAST_DUE: "Payment due", EXPIRED: "Expired" };
const AUTO_PAY_LABEL: Record<string, string> = { ACTIVE: "On", PENDING: "Payment failed, retrying", PAUSED: "Paused", HALTED: "Stopped: set up again in the Store", CANCELLED: "Off" };
const label = (status: string) => STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");

async function postAutoRenewal(body: Record<string, unknown>) {
  const res = await fetch("/api/account/payment-methods", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  return { ok: res.ok, json: ((await res.json().catch(() => ({}))) as { message?: string }) ?? {} };
}

/** Pause, resume or stop a monthly plan's auto-renewal, here in the Account (the same Ops actions as the Payment method page). */
function AutoRenewalControls({ productKey, status, onChanged }: { productKey: string; status: "ACTIVE" | "PENDING" | "PAUSED" | "HALTED" | "CANCELLED"; onChanged: () => void }) {
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

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/**
 * The Subscriptions page: the page Caterly's own Subscription settings used to be, now kept in the Account (AJ, 2026-11-14). Per product: the current
 * subscription with its status, billing information and auto-renewal, then the subscription history, then every payment with its invoice. Changing or paying
 * for a plan happens in the Store (the "Manage plan" button).
 */
export function SubscriptionsView({ storeOrigin }: { storeOrigin: string }) {
  // A change to auto-renewal bumps the counter, which re-reads the billing quietly (the page stays, so the message under the buttons stays too).
  const [reloads, setReloads] = useState(0);
  const state = useBilling(reloads);
  return (
    <AccountShell>
      <PageHeader title="Subscriptions" lede="Your current plan and subscription history, and every payment with its invoice." />
      <Gate state={state}>
        {(b) => (
          <>
            {b.subscriptions.length === 0 ? (
              <section className="pa-card"><p className="pa-muted">No subscriptions yet. Choose a plan in the Store.</p></section>
            ) : null}
            {b.subscriptions.map((s) => {
              const c = s.current;
              const trialing = c?.status === "TRIALING";
              const payments = b.payments.filter((p) => p.productKey === s.productKey);
              return (
                <div key={s.productKey} data-testid={`subscription-${s.productKey}`}>
                  <section className="pa-card pa-form" aria-label={`Current subscription, ${s.product}`}>
                    <div className="pa-row-actions" style={{ justifyContent: "space-between" }}>
                      <span className="pa-session-text">
                        <h3>Current Subscription · {s.product}</h3>
                        <span className="pa-hint">{c ? (trialing ? "You are on a free trial" : "Your current plan") : "No active subscription."}</span>
                      </span>
                      <Badge tone={TONE[s.display.tone]}>{s.display.label}</Badge>
                    </div>
                    {c ? (
                      <>
                        <p className="pa-row-label" style={{ fontSize: 18 }}>
                          {s.planName}
                          {trialing && c.trialEndsAt ? <span className="pa-hint"> ({daysLeft(c.trialEndsAt)} days left)</span> : null}
                        </p>
                        <p className="pa-hint">{s.display.detail}</p>
                        <section className="pa-card" aria-label="Billing information">
                          <h3><Icon name="card" size={16} /> Billing Information</h3>
                          <ul className="pa-sessions">
                            <li className="pa-session"><span className="pa-hint">Payment method</span><span className="pa-row-label">{trialing ? "Free trial" : c.autoPay ? "Auto-pay every 30 days (Razorpay)" : c.interval ? "Razorpay, paid once (card, UPI or net banking)" : "Set by Platterly"}</span></li>
                            {c.autoPay ? <li className="pa-session"><span className="pa-hint">Auto-renewal</span><span className="pa-row-label" data-testid="autopay-status">{AUTO_PAY_LABEL[c.autoPay.status] ?? c.autoPay.status}{c.autoPay.nextChargeAt ? `, next charge ${day(c.autoPay.nextChargeAt)}` : ""}</span></li> : null}
                            <li className="pa-session"><span className="pa-hint">Next billing</span><span className="pa-row-label">{day(trialing ? c.trialEndsAt : c.currentPeriodEnd) || "—"}</span></li>
                            {c.pendingPlan ? <li className="pa-session"><span className="pa-hint">Next plan</span><span className="pa-row-label">{c.pendingPlan} (from the next payment)</span></li> : null}
                          </ul>
                        </section>
                      </>
                    ) : null}
                    <p>
                      <a className="pa-btn pa-btn-primary" href={`${storeOrigin}/manage/${encodeURIComponent(s.productKey)}`} data-testid="manage-plan">{trialing || !c ? "Upgrade plan" : "Renew or upgrade plan"}</a>
                    </p>
                    {c?.autoPay && !c.pendingPlan ? <AutoRenewalControls productKey={s.productKey} status={c.autoPay.status} onChanged={() => setReloads((n) => n + 1)} /> : null}
                  </section>

                  <section className="pa-card pa-form" aria-label={`Subscription history, ${s.product}`}>
                    <h3>Subscription History</h3>
                    {s.history.length === 0 ? (
                      <p className="pa-muted">No subscription history yet.</p>
                    ) : (
                      <ul className="pa-sessions">
                        {s.history.map((h) => (
                          <li className="pa-session" key={h.id}>
                            <span className="pa-session-text">
                              <span className="pa-row-label">{h.planName}</span>
                              <span className="pa-hint">{day(h.startDate)} – {h.endDate ? day(h.endDate) : "ongoing"}</span>
                            </span>
                            <Badge tone={h.status === "ACTIVE" ? "success" : h.status === "TRIALING" ? "info" : "neutral"}>{label(h.status)}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="pa-card pa-form" aria-label={`Payments, ${s.product}`}>
                    <h3>Payments</h3>
                    {payments.length === 0 ? (
                      <p className="pa-muted">No payments yet. Once you pay for a plan, each payment and its invoice shows here.</p>
                    ) : (
                      <ul className="pa-sessions" data-testid="payments-list">
                        {payments.map((p) => (
                          <li className="pa-session" key={p.id}>
                            <span className="pa-session-text">
                              <span className="pa-row-label">{p.planName}, {term(p.interval)} · {inr(p.total)}</span>
                              <span className="pa-hint">{day(p.at)}{p.invoiceNumber ? ` · invoice ${p.invoiceNumber}` : ""}{p.status === "FAILED" ? ` · ${p.reason ?? "the payment was declined or not finished"}` : ""}</span>
                            </span>
                            <span className="pa-row-actions">
                              {paymentBadge(p)}
                              {p.status === "PAID" && p.invoiceNumber ? <a className="pa-btn pa-btn-outline" href={`/api/account/invoices/${encodeURIComponent(p.id)}?product=${encodeURIComponent(p.productKey)}`} download>Invoice</a> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              );
            })}
          </>
        )}
      </Gate>
    </AccountShell>
  );
}
