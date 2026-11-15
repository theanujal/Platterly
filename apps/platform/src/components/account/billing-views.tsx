"use client";

import Link from "next/link";
import { Icon } from "./icons";
import { AccountShell } from "./shell";
import { Badge, PageHeader } from "./ui";
import { Gate, day, inr, term, useBilling, TONE } from "./billing-shared";
import { SubscriptionsOverview } from "./subscriptions-overview";
import { useState } from "react";
import type { InvoiceRow, PaymentRow, SubscriptionRow } from "@/modules/account/billing";


const LATEST_INVOICES = 3;

/** Overview section (E): each subscription's state and renewal date, and the latest invoices, from the same one fetch as the Invoices and Payments pages. */
const RENEWAL_LABEL: Record<string, string> = { trial: "Trial ends on", trial_ended: "Trial ended on", active: "Renews on", ending: "Ends on", payment_due: "Ended on", ended_in_grace: "Ended on", locked: "Ended on" };

export function BillingSummary() {
  const state = useBilling();
  // A person with no business has no billing: the products section above already says so, so nothing is added here.
  if (state.phase === "no_business" || state.phase === "not_admin") return null;
  return (
    <Gate state={state}>
      {(b) => (
        <div className="pa-ov-bill">
          <section aria-labelledby="ov-subscription">
            <div className="pa-section-head">
              <span>
                <h2 id="ov-subscription">Your subscription</h2>
                <p className="pa-hint">Current plan and status.</p>
              </span>
              <Link href="/subscriptions" className="pa-link">
                Manage subscription <Icon name="chevronRight" size={14} />
              </Link>
            </div>
            {b.subscriptions.length === 0 ? (
              <article className="pa-card" aria-label="Subscriptions"><p className="pa-muted">No subscriptions yet. Choose a plan in the Store.</p></article>
            ) : (
              <div className="pa-stack">
                {b.subscriptions.map((s) => {
                  const end = s.current?.status === "TRIALING" ? s.current.trialEndsAt : s.current?.currentPeriodEnd;
                  return (
                    <article className="pa-card pa-sub-card" aria-label={`${s.product} subscription`} key={s.productKey}>
                      <span className="pa-quick-tile"><Icon name="layers" size={22} /></span>
                      <div className="pa-sub-card-id">
                        <h3>{s.product}{s.planName ? ` – ${s.planName}` : ""}</h3>
                        {s.current?.interval ? <p className="pa-hint">{s.current.interval === "ANNUAL" ? "Annual Plan" : "Monthly Plan"}</p> : null}
                        <Badge tone={TONE[s.display.tone]}>{s.display.label}</Badge>
                      </div>
                      {end ? (
                        <div className="pa-sub-card-date">
                          <span className="pa-hint">{RENEWAL_LABEL[s.display.state] ?? "Next billing"}</span>
                          <strong>{day(end)}</strong>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <section aria-labelledby="ov-invoices">
            <div className="pa-section-head">
              <span>
                <h2 id="ov-invoices">Recent invoices</h2>
                <p className="pa-hint">Your latest invoices and payments.</p>
              </span>
              <Link href="/invoices" className="pa-link">
                View all invoices <Icon name="chevronRight" size={14} />
              </Link>
            </div>
            <article className="pa-card" aria-label="Latest invoices">
              {b.invoices.length === 0 ? (
                <p className="pa-muted">No invoices yet. One appears here as soon as a payment is confirmed.</p>
              ) : (
                <ul className="pa-inv-list">
                  {b.invoices.slice(0, LATEST_INVOICES).map((i) => (
                    <li className="pa-inv-row" key={i.id}>
                      <Icon name="receipt" size={18} />
                      <strong>{i.invoiceNumber}</strong>
                      <span className="pa-hint">{day(i.paidAt)}</span>
                      <span className="pa-inv-amount">{inr(i.total)}</span>
                      <a className="pa-btn pa-btn-outline pa-btn-sm" href={`/api/account/invoices/${encodeURIComponent(i.id)}?product=${encodeURIComponent(i.productKey)}`} download>
                        <Icon name="download" size={14} /> Download PDF
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </div>
      )}
    </Gate>
  );
}

/** The Subscriptions page (AJ's reference, 2026-11-15): the summary and a row per product. Each row's "…" menu opens the Subscription Details page, or the history popups. */
export function SubscriptionsView({ storeOrigin }: { storeOrigin: string }) {
  // A refund request inside a popup bumps the counter, which re-reads the billing quietly.
  const [reloads, setReloads] = useState(0);
  const state = useBilling(reloads);
  return (
    <AccountShell>
      <PageHeader title="Subscriptions" lede="Manage your Platterly product subscriptions, plans and renewals." />
      <Gate state={state}>
        {(b) => <SubscriptionsOverview subscriptions={b.subscriptions} invoices={b.invoices} payments={b.payments} storeOrigin={storeOrigin} onChanged={() => setReloads((n) => n + 1)} />}
      </Gate>
    </AccountShell>
  );
}
