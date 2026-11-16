"use client";

import { useMemo, useState } from "react";
import type { InvoiceRow, PaymentRow } from "@/modules/account/billing";
import { Gate, day, inr, term, useBilling } from "./billing-shared";
import { useProductCards } from "./cards";
import { Icon } from "./icons";
import { AccountShell } from "./shell";
import { Badge, PageHeader, type Tone } from "./ui";

const PAGE_SIZE = 5;

/** A dropdown in the design system's field style: 40px, 8px radius, a border, the chevron on the right (and an icon on the left when it has one). */
function Select({ label, value, onChange, icon, children }: { label: string; value: string; onChange: (v: string) => void; icon?: "calendar"; children: React.ReactNode }) {
  return (
    <span className={`pa-select${icon ? " has-icon" : ""}`}>
      {icon ? <Icon name={icon} size={16} /> : null}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
      <Icon name="chevronDown" size={16} />
    </span>
  );
}
const RANGES = [
  { id: "all", label: "All time", days: null },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "180", label: "Last 6 months", days: 180 },
  { id: "365", label: "Last 12 months", days: 365 },
] as const;
const href = (i: InvoiceRow) => `/api/account/invoices/${encodeURIComponent(i.id)}?product=${encodeURIComponent(i.productKey)}`;

/** What an invoice's payment stands at: paid, or how far a refund has gone (the refund state is on the payment, not the invoice). */
function statusOf(p: PaymentRow | undefined): { tone: Tone; text: string } {
  const r = p?.refund;
  if (r?.status === "REFUNDED") return { tone: "success", text: "Refunded" };
  if (r?.status === "PARTIAL") return { tone: "info", text: "Partly refunded" };
  if (r?.status === "PENDING") return { tone: "info", text: "Refund requested" };
  return { tone: "success", text: "Paid" };
}

function Summary({ tone, icon, label, children, extra }: { tone: "green" | "orange" | "violet"; icon: "receipt" | "rupee" | "calendar"; label: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <article className="pa-card pa-sum-card" aria-label={label}>
      <div className={`pa-sum-inner pa-sum-${tone}`}>
        <span className="pa-sum-icon"><Icon name={icon} size={28} /></span>
        <div className="pa-sum-text">
          <span>{label}</span>
          <strong>{children}</strong>
          {extra}
        </div>
      </div>
    </article>
  );
}

/**
 * The Invoices page (AJ's reference, 2026-11-15): three summary cards, filters (product, date, invoice number) and a table of every GST invoice with its PDF,
 * five to a page. All of it is the business's real billing; an invoice's status follows the refund on its payment.
 */
export function InvoicesView() {
  const state = useBilling();
  return (
    <AccountShell>
      <PageHeader title="Invoices" lede="View and download your invoices for all Platterly product subscriptions." />
      <Gate state={state}>
        {(b) => (b.invoices.length === 0 ? <section className="pa-card"><p className="pa-muted">No invoices yet. One appears here as soon as a payment is confirmed.</p></section> : <InvoiceList invoices={b.invoices} payments={b.payments} />)}
      </Gate>
    </AccountShell>
  );
}

function InvoiceList({ invoices, payments }: { invoices: InvoiceRow[]; payments: PaymentRow[] }) {
  const { state } = useProductCards();
  const [product, setProduct] = useState("all");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [now] = useState(() => Date.now()); // read once per mount: the date filter must not change on every render

  const payment = useMemo(() => new Map(payments.map((p) => [p.id, p])), [payments]);
  const logos = new Map((state.phase === "ready" ? state.cards : []).map((c) => [c.accountKey, c.logoUrl]));
  const products = [...new Map(invoices.map((i) => [i.productKey, i.product])).entries()];

  // What has been paid: each invoice's total, less what has been refunded on its payment.
  const totalPaid = invoices.reduce((sum, i) => sum + i.total - (payment.get(i.id)?.refund?.refunded ?? 0), 0);
  const last = invoices[0];

  const days = RANGES.find((r) => r.id === range)!.days;
  const shown = invoices.filter((i) => (product === "all" || i.productKey === product) && (days === null || (i.paidAt && now - new Date(i.paidAt).getTime() <= days * 86_400_000)) && i.invoiceNumber.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const from = shown.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <div className="pa-sum-grid">
        <Summary tone="green" icon="receipt" label="Total invoices">{invoices.length}</Summary>
        <Summary tone="orange" icon="rupee" label="Total amount paid">{inr(totalPaid)}</Summary>
        <Summary tone="violet" icon="calendar" label="Last invoice" extra={<span className="pa-hint">{day(last.paidAt)}</span>}>{last.invoiceNumber}</Summary>
      </div>

      <section className="pa-card pa-inv-table" aria-label="Invoices">
        <div className="pa-inv-filters">
          <Select label="Product" value={product} onChange={reset(setProduct)}>
            <option value="all">All products</option>
            {products.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </Select>
          <Select label="Date range" icon="calendar" value={range} onChange={(v) => reset(setRange)(v as typeof range)}>
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
          <label className="pa-inv-search">
            <Icon name="search" size={16} />
            <input className="pa-input" type="search" placeholder="Search by invoice number" aria-label="Search by invoice number" value={query} onChange={(e) => reset(setQuery)(e.target.value)} />
          </label>
        </div>

        <div className="pa-inv-scroll">
          <table className="pa-table">
            <thead>
              <tr><th>Invoice number</th><th>Product</th><th>Plan</th><th>Invoice date</th><th className="pa-num">Amount (incl. GST)</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const status = statusOf(payment.get(i.id));
                const logo = logos.get(i.productKey);
                return (
                  <tr key={i.id} data-testid={`invoice-${i.id}`}>
                    <td><strong>{i.invoiceNumber}</strong></td>
                    <td>
                      <span className="pa-inv-product">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
                          <img src={logo} alt="" width={28} height={28} />
                        ) : (
                          <span className="pa-sub-letter pa-inv-letter" aria-hidden="true">{i.product.charAt(0).toUpperCase()}</span>
                        )}
                        <strong>{i.product}</strong>
                      </span>
                    </td>
                    <td>{i.planName} ({term(i.interval) === "yearly" ? "Annual" : "Monthly"})</td>
                    <td>{day(i.paidAt)}</td>
                    <td className="pa-num">{inr(i.total)}</td>
                    <td><Badge tone={status.tone}>{status.text}</Badge></td>
                    <td>
                      <span className="pa-inv-actions">
                        <a className="pa-btn pa-btn-outline" href={href(i)} download><Icon name="download" size={16} /> Download</a>
                        <a className="pa-btn pa-btn-outline" href={`${href(i)}&view=1`} target="_blank" rel="noopener noreferrer" data-testid={`view-${i.id}`}>View invoice</a>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? <tr><td colSpan={7} className="pa-muted">No invoices match. Clear the filters or the search.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="pa-inv-foot">
          <span className="pa-hint" data-testid="invoice-count">Showing {from}–{from === 0 ? 0 : from + rows.length - 1} of {shown.length} invoice{shown.length === 1 ? "" : "s"}</span>
          {pages > 1 ? (
            <nav className="pa-pager" aria-label="Pages">
              <button type="button" className="pa-pager-btn" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}><Icon name="chevronLeft" size={16} /></button>
              {Array.from({ length: pages }, (_, n) => n + 1).map((n) => (
                <button key={n} type="button" className={`pa-pager-btn${n === current ? " is-current" : ""}`} aria-current={n === current ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button type="button" className="pa-pager-btn" aria-label="Next page" disabled={current === pages} onClick={() => setPage(current + 1)}><Icon name="chevronRight" size={16} /></button>
            </nav>
          ) : null}
        </div>
      </section>
    </>
  );
}
