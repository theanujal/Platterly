"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PaymentRow, SubscriptionRow } from "@/modules/account/billing";
import { AUTO_PAY_LABEL, AutoRenewalControls, Gate, RefundRequest, TONE, daysLeft, day, inr, label, paymentBadge, term, useBilling } from "./billing-shared";
import { useProductCards } from "./cards";
import { Icon } from "./icons";
import { AccountShell, HELP_URL, useLeafCrumb } from "./shell";
import { Badge, PageHeader } from "./ui";

/** A popup: a dialog over the page, closed with the button, the backdrop or Escape. */
export function Modal({ title, subtitle, onClose, children, testId }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; testId?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pa-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pa-modal" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="pa-modal-head">
          <span>
            <h2>{title}</h2>
            {subtitle ? <p className="pa-hint">{subtitle}</p> : null}
          </span>
          <button ref={closeRef} type="button" className="pa-icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="pa-modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Every subscription this product has had, newest first. */
export function HistoryBody({ s }: { s: SubscriptionRow }) {
  if (s.history.length === 0) return <p className="pa-muted">No subscription history yet.</p>;
  return (
    <ul className="pa-sessions" aria-label={`Subscription history, ${s.product}`}>
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
  );
}

/** What has been paid for the product's plan, each payment with its invoice and the refund request. */
export function PaymentsBody({ payments, onChanged }: { payments: PaymentRow[]; onChanged: () => void }) {
  if (payments.length === 0) return <p className="pa-muted">No payments yet. Once you pay for a plan, each payment and its invoice shows here.</p>;
  return (
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
            {p.status === "PAID" ? <RefundRequest payment={p} onChanged={onChanged} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type Popup = "history" | "payments" | null;

/** The two popups of one product's subscription. */
export function SubscriptionPopups({ s, payments, open, onClose, onChanged }: { s: SubscriptionRow; payments: PaymentRow[]; open: Popup; onClose: () => void; onChanged: () => void }) {
  if (open === "history") return <Modal title="Subscription History" subtitle={`Every ${s.product} plan you have had`} onClose={onClose} testId="history-popup"><HistoryBody s={s} /></Modal>;
  if (open === "payments") return <Modal title="Payment History" subtitle="What you have paid, GST included, with each invoice" onClose={onClose} testId="payments-popup"><PaymentsBody payments={payments.filter((p) => p.productKey === s.productKey)} onChanged={onChanged} /></Modal>;
  return null;
}

/** The "…" on a subscription row: the details page, and the two popups. */
export function SubscriptionMenu({ s, payments, onChanged }: { s: SubscriptionRow; payments: PaymentRow[]; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const close = () => setMenu(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  const choose = (p: Popup) => {
    setMenu(false);
    setPopup(p);
  };
  return (
    <div className="pa-menu-wrap" ref={root}>
      <button type="button" className="pa-btn pa-btn-outline pa-more" aria-haspopup="menu" aria-expanded={menu} aria-label={`More about the ${s.product} subscription`} data-testid={`sub-menu-${s.productKey}`} onClick={(e) => {
        // The menu is placed from the button, so a scrolling table around it cannot clip it.
        const r = e.currentTarget.getBoundingClientRect();
        setAt({ top: r.bottom + 6, right: window.innerWidth - r.right });
        setMenu((v) => !v);
      }}>
        <Icon name="more" size={18} />
      </button>
      {menu && at ? (
        <div className="pa-menu" role="menu" style={{ top: at.top, right: at.right }}>
          <Link role="menuitem" href={`/subscriptions/${encodeURIComponent(s.productKey)}`} onClick={() => setMenu(false)}><Icon name="receipt" size={16} /> Subscription Details</Link>
          <button type="button" role="menuitem" onClick={() => choose("history")}><Icon name="history" size={16} /> Subscription History</button>
          <button type="button" role="menuitem" onClick={() => choose("payments")}><Icon name="card" size={16} /> Payment History</button>
        </div>
      ) : null}
      <SubscriptionPopups s={s} payments={payments} open={popup} onClose={() => setPopup(null)} onChanged={onChanged} />
    </div>
  );
}

/** The help card at the foot of Subscriptions and of each subscription's details. */
export function SupportCard({ blurb = "Have questions about plans, renewals or billing? We're here to help." }: { blurb?: string }) {
  return (
    <aside className="pa-card pa-sub-help" aria-label="Help with your subscription">
      <span className="pa-sub-help-icon"><Icon name="helpCircle" size={22} /></span>
      <div>
        <strong>Need help with your subscription?</strong>
        <p>{blurb}</p>
      </div>
      <a className="pa-btn pa-btn-outline" href={HELP_URL} target="_blank" rel="noopener noreferrer">Contact Support <Icon name="arrowRight" size={16} /></a>
    </aside>
  );
}

function Fact({ icon, label: name, children }: { icon: "box" | "refresh" | "card" | "calendar" | "layers"; label: string; children: ReactNode }) {
  return (
    <div className="pa-detail-row">
      <Icon name={icon} size={20} />
      <span>{name}</span>
      <div>{children}</div>
    </div>
  );
}

function ActionRow({ icon, title, text, onClick, href, testId, highlight }: { icon: "layers" | "x" | "history"; title: string; text: string; onClick?: () => void; href?: string; testId?: string; highlight?: boolean }) {
  const body = (
    <>
      <span className="pa-detail-tile"><Icon name={icon} size={22} /></span>
      <span className="pa-act-text"><strong>{title}</strong><span>{text}</span></span>
      <Icon name="chevronRight" size={18} />
    </>
  );
  const cls = `pa-act${highlight ? " is-highlight" : ""}`;
  return href ? <a className={cls} href={href} data-testid={testId}>{body}</a> : <button type="button" className={cls} onClick={onClick} data-testid={testId}>{body}</button>;
}

/**
 * The right-hand cards of a subscription (AJ's reference, 2026-11-15): "Manage your plan" and "Payment method", with the popups they open. The Subscription
 * Details page and the product's own page both show exactly this, so the two read the same.
 */
export function ManageAndPayment({ s, payments, storeOrigin, onChanged }: { s: SubscriptionRow; payments: PaymentRow[]; storeOrigin: string; onChanged: () => void }) {
  const [popup, setPopup] = useState<Popup | "renewal">(null);
  const c = s.current;
  const trialing = c?.status === "TRIALING";
  return (
    <div className="pa-stack" data-testid={`manage-${s.productKey}`}>
      <section className="pa-card" aria-label="Manage your plan">
        <h2>Manage your plan</h2>
        <ActionRow icon="layers" title={trialing || !c ? "Upgrade plan" : "Change plan"} text="Upgrade or switch to a different plan" href={`${storeOrigin}/manage/${encodeURIComponent(s.productKey)}`} testId="manage-plan" highlight />
        {c?.autoPay && !c.pendingPlan && (c.autoPay.status === "ACTIVE" || c.autoPay.status === "PAUSED") ? (
          <ActionRow icon="x" title="Cancel subscription" text="Pause or stop auto-renewal; your paid days keep working" onClick={() => setPopup("renewal")} testId="cancel-subscription" />
        ) : null}
        <ActionRow icon="history" title="View billing history" text="See past payments and invoices" onClick={() => setPopup("payments")} testId="billing-history" />
        <button type="button" className="pa-link pa-act-sub" onClick={() => setPopup("history")} data-testid="subscription-history-link">Subscription history</button>
      </section>
      <section className="pa-card" aria-label="Billing information">
        <h2>Payment method</h2>
        <div className="pa-pay-box">
          <Icon name="card" size={22} />
          <span className="pa-pay-text">
            <strong>{trialing ? "Free trial" : c?.paymentMethod ?? (c?.autoPay ? "Auto-pay (Razorpay)" : c?.interval ? "Razorpay" : "Set by Platterly")}</strong>
            <span className="pa-hint">{trialing ? "No payment method needed yet" : c?.autoPay ? "Auto-pay every 30 days (Razorpay)" : c?.interval ? "Razorpay, paid once (card, UPI or net banking)" : "Set by Platterly"}</span>
          </span>
          <Link href="/payment-methods" className="pa-btn pa-btn-outline"><Icon name="pencil" size={16} /> Update</Link>
        </div>
      </section>
      <SubscriptionPopups s={s} payments={payments} open={popup === "history" || popup === "payments" ? popup : null} onClose={() => setPopup(null)} onChanged={onChanged} />
      {popup === "renewal" && c?.autoPay ? (
        <Modal title="Auto-renewal" subtitle={`Your ${s.product} plan renews automatically every 30 days`} onClose={() => setPopup(null)} testId="renewal-popup">
          <AutoRenewalControls productKey={s.productKey} status={c.autoPay.status} onChanged={onChanged} />
        </Modal>
      ) : null}
    </div>
  );
}

/** One subscription's page (AJ's reference, 2026-11-15): the plan, how to change or stop it, the payment method and help. */
export function SubscriptionDetailsView({ productKey, storeOrigin }: { productKey: string; storeOrigin: string }) {
  return (
    <AccountShell>
      <SubscriptionDetails productKey={productKey} storeOrigin={storeOrigin} />
    </AccountShell>
  );
}

function SubscriptionDetails({ productKey, storeOrigin }: { productKey: string; storeOrigin: string }) {
  const [reloads, setReloads] = useState(0);
  const state = useBilling(reloads);
  const cards = useProductCards().state;
  const found = state.phase === "ready" ? state.subscriptions.find((x) => x.productKey === productKey) : undefined;
  useLeafCrumb(found?.product ?? null);
  const card = cards.phase === "ready" ? cards.cards.find((c) => c.accountKey === productKey) : undefined;
  return (
    <Gate state={state}>
      {(b) => {
        const s = b.subscriptions.find((x) => x.productKey === productKey);
        if (!s) return <section className="pa-card"><p className="pa-muted">There is no subscription for this product. <Link href="/subscriptions" className="pa-link">Back to Subscriptions</Link></p></section>;
        const c = s.current;
        const trialing = c?.status === "TRIALING";
        const end = c ? (trialing ? c.trialEndsAt : c.currentPeriodEnd) : null;
        const onChanged = () => setReloads((n) => n + 1);
        return (
          <div className="pa-stack" data-testid={`subscription-${s.productKey}`}>
            <PageHeader title={`${s.product} Subscription`} lede={`Manage your ${s.product} subscription, plan and billing.`} />

            <section className="pa-card pa-sd-hero" aria-label={`${s.product} plan`}>
              {card?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
                <img className="pa-sub-logo pa-sd-logo" src={card.logoUrl} alt="" width={64} height={64} />
              ) : (
                <span className="pa-sub-logo pa-sd-logo pa-sub-letter" aria-hidden="true">{s.product.charAt(0).toUpperCase()}</span>
              )}
              <div>
                <h2>{s.product}{s.planName ? ` – ${s.planName}` : ""}</h2>
                {card?.tagline ? <p className="pa-hint">{card.tagline}</p> : null}
                {c ? <p className="pa-hint">{s.display.detail}</p> : null}
              </div>
              <Badge tone={TONE[s.display.tone]}>{s.display.label}</Badge>
            </section>

            <div className="pa-detail-grid">
              <div className="pa-stack">
                <section className="pa-card" aria-label={`Current subscription, ${s.product}`}>
                  <h2>Subscription overview</h2>
                  {c ? (
                    <>
                      <Fact icon="box" label="Current plan"><strong>{s.product}{s.planName ? ` – ${s.planName}` : ""}</strong></Fact>
                      <Fact icon="refresh" label="Billing cycle"><strong>{c.interval === "ANNUAL" ? "Annual" : c.interval === "MONTHLY" ? "Monthly" : "—"}</strong></Fact>
                      {s.planDetails?.total != null && c.interval ? <Fact icon="card" label="Plan amount"><strong data-testid="plan-price">{inr(s.planDetails.total)} / {c.interval === "ANNUAL" ? "year" : "month"} (incl. GST)</strong></Fact> : null}
                      <Fact icon="calendar" label="Started on"><strong>{day(c.startDate) || "—"}</strong></Fact>
                      <Fact icon="calendar" label={trialing ? "Trial ends on" : "Renews on"}><strong>{day(end) || "—"}{trialing && c.trialEndsAt ? ` (${daysLeft(c.trialEndsAt)} days left)` : ""}</strong></Fact>
                      {c.autoPay ? <Fact icon="refresh" label="Auto-renewal"><strong data-testid="autopay-status">{AUTO_PAY_LABEL[c.autoPay.status] ?? c.autoPay.status}{c.autoPay.nextChargeAt ? `, next charge ${day(c.autoPay.nextChargeAt)}` : ""}</strong></Fact> : null}
                      {c.pendingPlan ? <Fact icon="layers" label="Next plan"><strong>{c.pendingPlan} (from the next payment)</strong></Fact> : null}
                      <Fact icon="layers" label="Status"><Badge tone={TONE[s.display.tone]}>{s.display.label}</Badge></Fact>
                      {s.planDetails && s.planDetails.highlights.length > 0 ? (
                        <div className="pa-sd-includes">
                          <h3>What your plan includes</h3>
                          <ul className="pa-plan-list" data-testid="plan-includes">{s.planDetails.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="pa-muted">No active subscription.</p>
                  )}
                </section>
                <SupportCard blurb="Have questions about plans, payments or renewals? We're here to help." />
              </div>

              <ManageAndPayment s={s} payments={b.payments} storeOrigin={storeOrigin} onChanged={onChanged} />
            </div>

          </div>
        );
      }}
    </Gate>
  );
}
