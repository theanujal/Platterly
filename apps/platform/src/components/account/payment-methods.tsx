"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaymentMethodsProduct } from "@/modules/account/payment-methods";
import { openRazorpayCardRegistration, openRazorpaySubscription, type RazorpayCardRegistration, type RazorpaySubscription } from "@/components/store/razorpay";
import type { PaymentMethodView } from "@platterly/contract";
import { Icon } from "./icons";
import { HELP_URL } from "./shell";
import { Badge } from "./ui";

type State = { phase: "loading" } | { phase: "error" } | { phase: "no_business" } | { phase: "not_admin" } | { phase: "ready"; businessName: string; products: PaymentMethodsProduct[] };
type Notice = { kind: "ok" | "failed"; text: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch("/api/account/payment-methods", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, json: ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {} };
}
const messageOf = (r: { json: Record<string, unknown> }, fallback: string) => (typeof r.json.message === "string" ? r.json.message : fallback);


/** A saved method's two lines: "•••• 8246" over "Mastercard" for a card, the UPI id over "UPI". Only what the label says; no expiry is held here. */
function describe(m: PaymentMethodView): { title: string; sub: string; brand: "mastercard" | "visa" | "upi" | "other" } {
  const card = /^(.+?) ending (\d{4})$/i.exec(m.label);
  if (card) {
    const name = card[1];
    return { title: `•••• ${card[2]}`, sub: name, brand: /master/i.test(name) ? "mastercard" : /visa/i.test(name) ? "visa" : "other" };
  }
  if (m.kind === "UPI") return { title: m.label, sub: "UPI", brand: "upi" };
  return { title: m.label, sub: m.kind === "EMANDATE" ? "Bank mandate" : "Card", brand: "other" };
}

/** The little brand picture in a method's tile, drawn here (no outside image). */
function BrandMark({ brand }: { brand: ReturnType<typeof describe>["brand"] }) {
  if (brand === "mastercard") return <svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true"><circle cx="11" cy="10" r="9" fill="#EB001B" /><circle cx="21" cy="10" r="9" fill="#F79E1B" fillOpacity="0.9" /></svg>;
  if (brand === "visa") return <span className="pa-pm-word pa-pm-visa" aria-hidden="true">VISA</span>;
  if (brand === "upi") return <span className="pa-pm-word pa-pm-upi" aria-hidden="true">UPI</span>;
  return <Icon name="card" size={22} />;
}

/** A small menu placed from its button, so nothing clips it: the "…" on a method, and "Add payment method". */
function Menu({ label, items, triggerClass, children }: { label: string; items: { text: string; onClick: () => void; icon?: "card"; word?: string; disabled?: boolean; note?: string }[]; triggerClass: string; children: React.ReactNode }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setAt(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    const close = () => setAt(null);
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
  }, [at]);
  if (items.length === 0) return null;
  return (
    <div className="pa-menu-wrap" ref={root}>
      <button type="button" className={triggerClass} aria-haspopup="menu" aria-expanded={at !== null} aria-label={label} onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setAt(at ? null : { top: r.bottom + 6, right: window.innerWidth - r.right });
      }}>
        {children}
      </button>
      {at ? (
        <div className="pa-menu" role="menu" style={{ top: at.top, right: at.right }}>
          {items.map((i) => (
            <button key={i.text} type="button" role="menuitem" disabled={i.disabled} title={i.note} onClick={() => { setAt(null); i.onClick(); }}>
              {i.icon ? <Icon name={i.icon} size={16} /> : <span className="pa-pm-word pa-pm-upi pa-menu-word" aria-hidden="true">{i.word}</span>}
              {i.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const AUTO_TEXT: Record<string, string> = {
  ACTIVE: "On. Your subscriptions renew automatically using your primary payment method.",
  PAUSED: "Paused. Nothing is charged while it is paused; your paid days keep working until they end. Resume to renew automatically.",
  PENDING: "Your last renewal payment did not go through. Razorpay will try again; make sure your primary method is in order.",
  HALTED: "Stopped after renewal payments failed. Choose your plan again in the Store to start auto-renewal.",
  CANCELLED: "Stopped. Your paid days keep working until they end. To renew, choose your plan again in the Store.",
};

/**
 * The Account's Payment method page: per product, the saved methods (labels only), which one is the primary, and Add card, Make primary and Remove. Only the
 * business's Admin can open it; Ops does the work and Razorpay's own window takes the card, so card numbers never reach Platterly.
 */
export function PaymentMethods() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ productKey: string; notice: Notice } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState<{ productKey: string; change: "pause" | "cancel" } | null>(null);

  // A change reloads the list by bumping this counter; the effect below is the only place that reads it.
  const [reloads, setReloads] = useState(0);
  const load = useCallback(async () => setReloads((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/payment-methods", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (res.status === 401) return window.location.replace("/auth/start?next=%2Fpayment-methods");
        const body = (await res.json().catch(() => null)) as { status?: string; businessName?: string; products?: PaymentMethodsProduct[] } | null;
        if (!alive) return;
        if (res.status === 409) return setState({ phase: "no_business" });
        if (res.status === 403) return setState({ phase: "not_admin" });
        setState(res.ok && body?.status === "ok" ? { phase: "ready", businessName: body.businessName ?? "", products: body.products ?? [] } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloads]);

  if (state.phase === "loading") return <p className="pa-muted" role="status" aria-busy="true">Loading your payment methods…</p>;
  if (state.phase === "error") return <p className="pa-muted" role="alert">We could not load your payment methods just now. Please reload the page in a few minutes.</p>;
  if (state.phase === "no_business") return <p className="pa-muted" role="status">You have not set up a business yet, so there is no payment method to show.</p>;
  if (state.phase === "not_admin") return <p className="pa-muted" role="status">Payment methods are available to the business Admin only.</p>;
  const { businessName, products } = state;
  if (products.length === 0) return <p className="pa-muted" role="status">You have no subscription yet. Choose a plan in the Store and your payment method will appear here.</p>;

  const say = (productKey: string, kind: Notice["kind"], text: string) => setNotice({ productKey, notice: { kind, text } });

  async function addCard(productKey: string) {
    setBusy(`add:${productKey}`);
    setNotice(null);
    try {
      const started = await post({ action: "add", productKey });
      if (!started.ok) return say(productKey, "failed", messageOf(started, "We could not start saving your card. Please try again in a few minutes."));
      const paid = await openRazorpayCardRegistration(started.json as unknown as RazorpayCardRegistration, { name: businessName });
      if (!paid) return say(productKey, "failed", "Your card was not saved. Nothing was charged.");
      const verified = await post({ action: "add-verify", productKey, razorpayOrderId: paid.razorpay_order_id, razorpayPaymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature });
      if (!verified.ok) return say(productKey, "failed", messageOf(verified, "We could not confirm your card. Please try again."));
      await load();
      say(productKey, "ok", `${String(verified.json.label ?? "Your card")} was saved. The ₹5 taken to verify it is refunded.`);
    } catch {
      say(productKey, "failed", "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function makePrimary(productKey: string, methodId: string) {
    setBusy(`primary:${methodId}`);
    setNotice(null);
    try {
      const started = await post({ action: "primary", productKey, methodId });
      if (!started.ok) return say(productKey, "failed", messageOf(started, "We could not change your primary method. Nothing was changed."));
      const sub = { ...started.json, amountPaise: 0, businessName } as unknown as RazorpaySubscription;
      const paid = await openRazorpaySubscription(sub, { name: businessName });
      if (!paid) return say(productKey, "failed", "The new payment method was not authorised, so nothing was changed.");
      const verified = await post({ action: "primary-verify", productKey, razorpaySubscriptionId: paid.razorpay_subscription_id, razorpayPaymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature });
      if (!verified.ok) return say(productKey, "failed", messageOf(verified, "We could not confirm the change. Nothing was changed."));
      await load();
      say(productKey, "ok", `${String(verified.json.label ?? "Your card")} is now your primary method. Your next renewal is charged to it.`);
    } catch {
      say(productKey, "failed", "Something went wrong. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(productKey: string, methodId: string) {
    setBusy(`remove:${methodId}`);
    setNotice(null);
    setConfirmRemove(null);
    try {
      const done = await post({ action: "remove", productKey, methodId });
      if (!done.ok) return say(productKey, "failed", messageOf(done, "We could not remove this method. Nothing was changed."));
      await load();
      say(productKey, "ok", "The payment method was removed.");
    } catch {
      say(productKey, "failed", "Something went wrong. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  async function changeAutoPay(productKey: string, change: "pause" | "resume" | "cancel") {
    setBusy(`auto:${productKey}`);
    setNotice(null);
    setConfirmAuto(null);
    try {
      const done = await post({ action: `autopay-${change}`, productKey });
      if (!done.ok) return say(productKey, "failed", messageOf(done, "We could not change your auto-renewal. Nothing was changed."));
      await load();
      say(productKey, "ok", change === "pause" ? "Auto-renewal is paused. Nothing more will be charged until you resume it." : change === "resume" ? "Auto-renewal is back on." : "Auto-renewal is stopped. Your paid days keep working until they end.");
    } catch {
      say(productKey, "failed", "Something went wrong. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pa-detail-grid" data-testid="payment-methods">
      <div className="pa-stack">
        {products.map((p) => {
          const monthly = p.interval === "MONTHLY";
          const mine = notice?.productKey === p.productKey ? notice.notice : null;
          return (
            <div key={p.productKey} className="pa-stack" data-testid={`pm-${p.productKey}`}>
              <section className="pa-card" aria-labelledby={`pm-${p.productKey}`}>
                <div className="pa-pm-head">
                  <span>
                    <h2 id={`pm-${p.productKey}`}>{products.length > 1 ? `Your payment methods · ${p.product}` : "Your payment methods"}</h2>
                    <p className="pa-hint">These methods can be used to pay for your subscriptions.</p>
                  </span>
                  <Menu
                    label="Add payment method"
                    triggerClass="pa-btn pa-btn-primary"
                    items={[
                      { text: "Add card", icon: "card", onClick: () => addCard(p.productKey), disabled: busy !== null },
                      { text: "Add UPI", word: "UPI", onClick: () => {}, disabled: true, note: "Adding a UPI id on its own is not available yet." },
                    ]}
                  >
                    <Icon name="plus" size={16} /> Add payment method
                  </Menu>
                </div>
                {mine && (
                  <p className="pa-muted" role={mine.kind === "failed" ? "alert" : "status"}>
                    {mine.text}
                  </p>
                )}
                {p.methodsUnavailable && <p className="pa-muted" role="alert">We could not load your saved methods just now. Please reload the page in a few minutes.</p>}
                {!p.methodsUnavailable && p.methods.length === 0 && <p className="pa-muted">No payment method is saved yet.</p>}
                <ul className="pa-pm-list" aria-label={`Payment methods for ${p.product}`}>
                  {p.methods.map((m) => {
                    const d = describe(m);
                    const canRemove = !m.isPrimary && p.methods.length >= 2;
                    return (
                      <li key={m.id} className={`pa-pm-row${m.isPrimary ? " is-primary" : ""}`} data-testid="method-row">
                        <span className="pa-pm-tile"><BrandMark brand={d.brand} /></span>
                        <span className="pa-pm-id">
                          <strong>{d.title}</strong>
                          <span>{d.sub}</span>
                        </span>
                        <span className="pa-pm-actions">
                          {m.isPrimary ? (
                            <Badge tone="success">Primary</Badge>
                          ) : p.autoPay ? (
                            <button type="button" className="pa-btn pa-btn-outline pa-pm-primary" disabled={busy !== null} onClick={() => makePrimary(p.productKey, m.id)}>
                              <span className="pa-pm-radio" aria-hidden="true" /> Make primary
                            </button>
                          ) : null}
                          <Menu label={`More about ${m.label}`} triggerClass="pa-btn pa-btn-outline pa-more" items={canRemove ? [{ text: "Remove", onClick: () => setConfirmRemove(m.id) }] : []}>
                            <Icon name="more" size={18} />
                          </Menu>
                        </span>
                        {confirmRemove === m.id && (
                          <span className="pa-pm-confirm" role="alertdialog" aria-label={`Remove ${m.label}`}>
                            <button type="button" className="pa-btn pa-btn-primary" disabled={busy !== null} onClick={() => remove(p.productKey, m.id)}>
                              Remove {m.label}
                            </button>{" "}
                            <button type="button" className="pa-btn pa-btn-outline" onClick={() => setConfirmRemove(null)}>
                              Keep it
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="pa-hint">The primary method is the only one charged. To replace it, make another method primary first; your last method cannot be removed.</p>
              </section>

              <section className="pa-card pa-pm-auto" aria-label="Automatic renewals" data-testid="auto-renewal">
                <span className="pa-pm-auto-icon"><Icon name="calendar" size={22} /></span>
                <div className="pa-pm-auto-text">
                  <h3>Automatic renewals{products.length > 1 ? ` · ${p.product}` : ""}</h3>
                  <p className="pa-hint">
                    {p.autoPay
                      ? AUTO_TEXT[p.autoPay.status]
                      : monthly
                        ? "Auto-pay is not active."
                        : "This plan is paid yearly. Before it ends we email you a reminder with a link to pay."}
                    {p.autoPay?.status === "ACTIVE" && p.autoPay.nextChargeAt ? ` The next charge is on ${day(p.autoPay.nextChargeAt)}.` : ""}
                  </p>
                  {p.autoPay && (p.autoPay.status === "ACTIVE" || p.autoPay.status === "PAUSED") && confirmAuto?.productKey !== p.productKey ? (
                    <button type="button" className="pa-link pa-pm-stop" disabled={busy !== null} onClick={() => setConfirmAuto({ productKey: p.productKey, change: "cancel" })}>
                      Stop auto-renewal
                    </button>
                  ) : null}
                  {confirmAuto?.productKey === p.productKey ? (
                    <div role="alertdialog" aria-label={confirmAuto.change === "pause" ? "Pause auto-renewal" : "Stop auto-renewal"}>
                      <p className="pa-muted">
                        {confirmAuto.change === "pause"
                          ? "Pause auto-renewal? Nothing is charged while it is paused. Your paid days keep working; if they run out before you resume, your account is locked after the 7-day grace."
                          : "Stop auto-renewal for good? Your paid days keep working, then the 7-day grace and the lock apply. Nothing is refunded, and you start again from the Store."}
                      </p>
                      <button type="button" className="pa-btn pa-btn-primary" disabled={busy !== null} onClick={() => changeAutoPay(p.productKey, confirmAuto.change)}>
                        {confirmAuto.change === "pause" ? "Yes, pause" : "Yes, stop auto-renewal"}
                      </button>{" "}
                      <button type="button" className="pa-btn pa-btn-outline" onClick={() => setConfirmAuto(null)}>
                        Keep it on
                      </button>
                    </div>
                  ) : null}
                </div>
                {p.autoPay && (p.autoPay.status === "ACTIVE" || p.autoPay.status === "PAUSED") ? (
                  <button
                    type="button"
                    role="switch"
                    className="pa-toggle"
                    aria-checked={p.autoPay.status === "ACTIVE"}
                    aria-label={p.autoPay.status === "ACTIVE" ? "Pause auto-renewal" : "Resume auto-renewal"}
                    disabled={busy !== null}
                    onClick={() => (p.autoPay!.status === "ACTIVE" ? setConfirmAuto({ productKey: p.productKey, change: "pause" }) : changeAutoPay(p.productKey, "resume"))}
                  />
                ) : null}
              </section>
            </div>
          );
        })}
      </div>

      <div className="pa-stack pa-detail-side">
        <section className="pa-card" aria-label="How payment methods are used">
          <h2>How payment methods are used</h2>
          <ul className="pa-detail-features">
            <li><span className="pa-detail-tile"><Icon name="refresh" size={22} /></span><div><strong>Subscription renewals</strong><p>Your active plans are renewed automatically.</p></div></li>
            <li><span className="pa-detail-tile"><Icon name="card" size={22} /></span><div><strong>Plan changes</strong><p>Used when you upgrade or change a plan.</p></div></li>
            <li><span className="pa-detail-tile"><Icon name="receipt" size={22} /></span><div><strong>Future subscriptions</strong><p>Also used for any new Platterly products you subscribe to.</p></div></li>
          </ul>
        </section>
        <aside className="pa-card pa-sub-help" aria-label="Help with payment methods">
          <span className="pa-sub-help-icon"><Icon name="helpCircle" size={22} /></span>
          <div>
            <strong>Need help?</strong>
            <p>Have questions about payment methods or billing?</p>
          </div>
          <a className="pa-btn pa-btn-outline" href={HELP_URL} target="_blank" rel="noopener noreferrer">Contact Support <Icon name="arrowRight" size={16} /></a>
        </aside>
      </div>
    </div>
  );
}
