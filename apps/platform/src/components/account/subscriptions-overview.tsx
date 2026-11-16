"use client";

import { useState } from "react";
import type { InvoiceRow, PaymentRow, SubscriptionRow } from "@/modules/account/billing";
import type { AccountProductCard } from "@/modules/account/types";
import { useProductCards } from "./cards";
import { Icon } from "./icons";
import { SubscriptionMenu, SupportCard } from "./subscription-details";
import { Badge, type Tone } from "./ui";

const inr = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const TONE: Record<string, Tone> = { good: "success", info: "info", warn: "warning", bad: "warning", none: "neutral" };
const RENEWAL_LABEL: Record<string, string> = { trial: "Trial ends on", trial_ended: "Trial ended on", active: "Renews on", ending: "Ends on", payment_due: "Ended on", ended_in_grace: "Ended on", locked: "Ended on" };

const endOf = (s: SubscriptionRow) => (s.current?.status === "TRIALING" ? s.current.trialEndsAt : s.current?.currentPeriodEnd) ?? null;

/** How the plan is paid, as the page says it: the saved method's label when Ops sends one, else what the plan itself tells us. */
function paymentLabel(s: SubscriptionRow): string {
  const c = s.current;
  if (!c) return "—";
  if (c.status === "TRIALING") return "Free trial";
  if (c.paymentMethod) return c.paymentMethod;
  return c.autoPay ? "Auto-pay (Razorpay)" : c.interval ? "Razorpay" : "Set by Platterly";
}

function SummaryCard({ tone, icon, label, children, action }: { tone: "green" | "orange" | "violet"; icon: "layers" | "calendar" | "receipt"; label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <article className="pa-card pa-sum-card" aria-label={label}>
      <div className={`pa-sum-inner pa-sum-${tone}`}>
        <span className="pa-sum-icon"><Icon name={icon} size={28} /></span>
        <div className="pa-sum-text">
          <span>{label}</span>
          <strong>{children}</strong>
          {action}
        </div>
      </div>
    </article>
  );
}

function Logo({ card }: { card: Pick<AccountProductCard, "name" | "logoUrl"> | null; name: string; soon?: boolean }) {
  return card?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
    <img className="pa-sub-logo" src={card.logoUrl} alt="" width={48} height={48} />
  ) : (
    <span className="pa-sub-logo pa-sub-letter" aria-hidden="true">{(card?.name ?? "?").charAt(0).toUpperCase()}</span>
  );
}

/**
 * The top of Subscriptions (AJ's reference, 2026-11-15): three summary cards, "Your subscriptions" (one row per product, the names, lines and logos from Ops),
 * the benefits and the help card. Everything shown is the business's real billing; nothing is made up, and a missing value shows a dash.
 */
export function SubscriptionsOverview({ subscriptions, invoices, payments, storeOrigin, onChanged }: { subscriptions: SubscriptionRow[]; invoices: InvoiceRow[]; payments: PaymentRow[]; storeOrigin: string; onChanged: () => void }) {
  const { state } = useProductCards();
  const [now] = useState(() => Date.now()); // read once per mount, so a render never depends on the clock
  const active = subscriptions.filter((s) => s.current?.status === "ACTIVE");
  const renewals = subscriptions.map(endOf).filter((d): d is string => Boolean(d) && new Date(d as string).getTime() > now).sort();
  const last = invoices[0];
  const byKey = new Map(subscriptions.map((s) => [s.productKey, s]));

  // Ops decides which products exist and how they read; when it cannot be read the business's own subscriptions still show, by name.
  const cards: AccountProductCard[] =
    state.phase === "ready"
      ? state.cards
      : subscriptions.map((s) => ({ key: s.productKey, accountKey: s.productKey, name: s.product, tagline: null, imageUrl: null, logoUrl: null, about: null, features: [], status: "LIVE" as const, launchAt: null }));
  const firstActive = cards.find((c) => byKey.get(c.accountKey)?.current?.status === "ACTIVE")?.accountKey;

  return (
    <>
      <div className="pa-sum-grid">
        <SummaryCard tone="green" icon="layers" label="Active subscriptions">{active.length}</SummaryCard>
        <SummaryCard tone="orange" icon="calendar" label="Next renewal">{renewals[0] ? day(renewals[0]) : "—"}</SummaryCard>
        <SummaryCard
          tone="violet"
          icon="receipt"
          label="Last invoice"
          action={last ? <a className="pa-link pa-sum-link" href={`/api/account/invoices/${encodeURIComponent(last.id)}?product=${encodeURIComponent(last.productKey)}`} download>View invoice <Icon name="arrowRight" size={14} /></a> : null}
        >
          {last ? last.invoiceNumber : "None yet"}
        </SummaryCard>
      </div>

      <section aria-labelledby="sub-list-h" className="pa-stack">
        <h2 id="sub-list-h" className="pa-sub-h">Your subscriptions</h2>
        {state.phase === "loading" ? <p className="pa-muted" role="status" aria-busy="true">Loading…</p> : null}
        {cards.map((card) => {
          const s = byKey.get(card.accountKey);
          if (card.status === "UPCOMING")
            return (
              <article key={card.key} className="pa-card pa-sub-row pa-sub-row-soon" aria-label={card.name}>
                <div className="pa-sub-id">
                  <Logo card={card} name={card.name} soon />
                  <div>
                    <h3>{card.name}</h3>
                    {card.tagline ? <p>{card.tagline}</p> : null}
                    <Badge tone="neutral">Coming soon</Badge>
                  </div>
                </div>
                <p className="pa-sub-soon-text">Be the first to access {card.name} when it&apos;s available.</p>
                <button type="button" className="pa-btn pa-btn-outline" disabled title="Notifications are not stored yet.">
                  <Icon name="bell" size={16} /> Notify me
                </button>
              </article>
            );
          const end = s ? endOf(s) : null;
          return (
            <article key={card.key} className={`pa-card pa-sub-row${card.accountKey === firstActive ? " is-selected" : ""}`} aria-label={`${card.name} subscription`} data-testid={`sub-row-${card.accountKey}`}>
              <div className="pa-sub-id">
                <Logo card={card} name={card.name} />
                <div>
                  <h3>{card.name}{s?.planName ? ` – ${s.planName}` : ""}</h3>
                  {card.tagline ? <p>{card.tagline}</p> : null}
                  <span className="pa-sub-badges">
                    {s ? <Badge tone={TONE[s.display.tone] ?? "neutral"}>{s.display.label}</Badge> : <Badge tone="neutral">Not subscribed</Badge>}
                    {s?.current?.interval ? <span className="pa-sub-chip">{s.current.interval === "ANNUAL" ? "Annual Plan" : "Monthly Plan"}</span> : null}
                  </span>
                </div>
              </div>
              {s?.current ? (
                <dl className="pa-sub-facts">
                  <div><Icon name="calendar" size={18} /><dt>{RENEWAL_LABEL[s.display.state] ?? "Next billing"}</dt><dd>{day(end) || "—"}</dd></div>
                  <div><Icon name="receipt" size={18} /><dt>Plan amount</dt><dd>{s.planDetails?.total != null && s.current.interval ? `${inr(s.planDetails.total)} / ${s.current.interval === "ANNUAL" ? "year" : "month"} (incl. GST)` : "—"}</dd></div>
                  <div><Icon name="card" size={18} /><dt>Payment method</dt><dd>{paymentLabel(s)}</dd></div>
                </dl>
              ) : (
                <p className="pa-sub-soon-text">No plan yet. Choose one in the Store.</p>
              )}
              <div className="pa-sub-actions">
                <a className="pa-btn pa-btn-outline" href={`${storeOrigin}/manage/${encodeURIComponent(card.accountKey)}`} data-testid={`manage-subscription-${card.accountKey}`}>
                  {s?.current ? "Manage subscription" : "Choose a plan"}
                </a>
                {s ? <SubscriptionMenu s={s} payments={payments} onChanged={onChanged} /> : null}
              </div>
            </article>
          );
        })}
      </section>

      <div className="pa-sub-bottom">
        <h2 id="sub-benefits-h" className="pa-sub-h">Subscription benefits</h2>
        <div className="pa-card pa-benefits" aria-labelledby="sub-benefits-h">
          <div><Icon name="zap" size={28} /><strong>Access to Platterly products</strong><p>Use your subscribed products with one account.</p></div>
          <div><Icon name="refresh" size={28} /><strong>Continuous updates</strong><p>Get new features and improvements.</p></div>
          <div><Icon name="headset" size={28} /><strong>Dedicated support</strong><p>Help when you need it, across all products.</p></div>
        </div>
        <SupportCard />
      </div>
    </>
  );
}
