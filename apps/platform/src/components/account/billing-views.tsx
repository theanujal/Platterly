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
  | { phase: "ready"; business: string; subscriptions: SubscriptionRow[]; invoices: InvoiceRow[]; payments: PaymentRow[] };

/** The business's billing as Ops holds it (read-only). One fetch shared by the two pages. */
function useBilling(): State {
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
        if (body.status === "ok" && body.business && body.subscriptions && body.invoices && body.payments) setState({ phase: "ready", business: body.business.name, subscriptions: body.subscriptions, invoices: body.invoices, payments: body.payments });
        else setState({ phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
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
  return <>{children(state)}</>;
}

const LATEST_INVOICES = 3;

/** Overview section (E): each subscription's state and renewal date, and the latest invoices, from the same one fetch as the Invoices and Payments pages. */
export function BillingSummary() {
  const state = useBilling();
  // A person with no business has no billing: the products section above already says so, so nothing is added here.
  if (state.phase === "no_business") return null;
  return (
    <section aria-labelledby="ov-billing">
      <div className="pa-section-head">
        <h2 id="ov-billing">Subscriptions and invoices</h2>
        <Link href="/payments" className="pa-link">
          All payments <Icon name="chevronRight" size={14} />
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

export function PaymentsView() {
  const state = useBilling();
  return (
    <AccountShell>
      <PageHeader title="Payments" lede="Every payment for your business, including the ones that did not go through, and where each subscription stands." />
      <Gate state={state}>
        {(b) => (
          <>
            {b.subscriptions.length > 0 && (
              <section className="pa-card pa-form" aria-label="Subscriptions">
                <ul className="pa-sessions">
                  {b.subscriptions.map((s) => (
                    <li className="pa-session" key={s.productKey}>
                      <span className="pa-session-text">
                        <span className="pa-row-label">{s.product}{s.planName ? ` · ${s.planName}` : ""}</span>
                        <span className="pa-hint">{s.display.detail}</span>
                      </span>
                      <Badge tone={TONE[s.display.tone]}>{s.display.label}</Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {b.payments.length === 0 ? (
              <section className="pa-card"><p className="pa-muted">No payments yet.</p></section>
            ) : (
              <section className="pa-card pa-form" aria-label="Payments">
                <ul className="pa-sessions">
                  {b.payments.map((p) => (
                    <li className="pa-session" key={p.id}>
                      <span className="pa-session-text">
                        <span className="pa-row-label">{p.product} {p.planName}, {term(p.interval)} · {inr(p.total)}</span>
                        <span className="pa-hint">{day(p.at)}{p.invoiceNumber ? ` · invoice ${p.invoiceNumber}` : ""}{p.status === "FAILED" ? ` · ${p.reason ?? "the payment was declined or not finished"}` : ""}</span>
                      </span>
                      {paymentBadge(p)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </Gate>
    </AccountShell>
  );
}
