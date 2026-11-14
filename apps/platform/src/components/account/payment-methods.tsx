"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaymentMethodsProduct } from "@/modules/account/payment-methods";
import { openRazorpayCardRegistration, openRazorpaySubscription, type RazorpayCardRegistration, type RazorpaySubscription } from "@/components/store/razorpay";
import { Icon } from "./icons";

type State = { phase: "loading" } | { phase: "error" } | { phase: "no_business" } | { phase: "not_admin" } | { phase: "ready"; businessName: string; products: PaymentMethodsProduct[] };
type Notice = { kind: "ok" | "failed"; text: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch("/api/account/payment-methods", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, json: ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {} };
}
const messageOf = (r: { json: Record<string, unknown> }, fallback: string) => (typeof r.json.message === "string" ? r.json.message : fallback);

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
    <div className="pa-narrow">
      {products.map((p) => {
        const monthly = p.interval === "MONTHLY";
        const mine = notice?.productKey === p.productKey ? notice.notice : null;
        return (
          <section key={p.productKey} className="pa-card pa-form" aria-labelledby={`pm-${p.productKey}`} data-testid={`pm-${p.productKey}`}>
            <div className="pa-section-head">
              <h2 id={`pm-${p.productKey}`}>{p.product}</h2>
              <button type="button" className="pa-btn pa-btn-outline" disabled={busy !== null} onClick={() => addCard(p.productKey)}>
                <Icon name="card" size={15} /> Add card
              </button>
            </div>
            <p className="pa-hint">
              {p.planName} plan.{" "}
              {p.autoPay && p.autoPay.status === "ACTIVE" && p.autoPay.nextChargeAt
                ? `Auto-pay is on: the next charge is on ${day(p.autoPay.nextChargeAt)}, to your primary method.`
                : monthly
                  ? "Auto-pay is not active."
                  : "This plan is paid yearly. Before it ends we email you a reminder with a link to pay."}
            </p>
            {mine && (
              <p className="pa-muted" role={mine.kind === "failed" ? "alert" : "status"}>
                {mine.text}
              </p>
            )}
            {p.methodsUnavailable && <p className="pa-muted" role="alert">We could not load your saved methods just now. Please reload the page in a few minutes.</p>}
            {!p.methodsUnavailable && p.methods.length === 0 && <p className="pa-muted">No payment method is saved yet.</p>}
            <ul className="pa-list" aria-label={`Payment methods for ${p.product}`}>
              {p.methods.map((m) => (
                <li key={m.id} className="pa-row-actions" data-testid="method-row">
                  <span>
                    {m.label} {m.isPrimary && <span className="pa-badge pa-badge-success"><span className="pa-badge-dot" />Primary</span>}
                  </span>
                  {!m.isPrimary && (
                    <span>
                      {p.autoPay && (
                        <button type="button" className="pa-btn pa-btn-outline" disabled={busy !== null} onClick={() => makePrimary(p.productKey, m.id)}>
                          Make primary
                        </button>
                      )}{" "}
                      {confirmRemove === m.id ? (
                        <>
                          <button type="button" className="pa-btn pa-btn-primary" disabled={busy !== null} onClick={() => remove(p.productKey, m.id)}>
                            Remove {m.label}
                          </button>{" "}
                          <button type="button" className="pa-btn pa-btn-outline" onClick={() => setConfirmRemove(null)}>
                            Keep it
                          </button>
                        </>
                      ) : (
                        <button type="button" className="pa-btn pa-btn-outline" disabled={busy !== null || p.methods.length < 2} onClick={() => setConfirmRemove(m.id)}>
                          Remove
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {p.autoPay && (
              <div data-testid="auto-renewal">
                <h3>Auto-renewal</h3>
                <p className="pa-hint">
                  {{
                    ACTIVE: "On. Your plan renews automatically from the primary method.",
                    PAUSED: "Paused. Nothing is charged while it is paused; your paid days keep working until they end. Resume to renew automatically.",
                    PENDING: "Your last renewal payment did not go through. Razorpay will try again; make sure your primary method is in order.",
                    HALTED: "Stopped after renewal payments failed. Choose your plan again in the Store to start auto-renewal.",
                    CANCELLED: "Stopped. Your paid days keep working until they end. To renew, choose your plan again in the Store.",
                  }[p.autoPay.status]}
                </p>
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
                ) : (
                  <p>
                    {p.autoPay.status === "ACTIVE" && (
                      <button type="button" className="pa-btn pa-btn-outline" disabled={busy !== null} onClick={() => setConfirmAuto({ productKey: p.productKey, change: "pause" })}>
                        Pause auto-renewal
                      </button>
                    )}
                    {p.autoPay.status === "PAUSED" && (
                      <button type="button" className="pa-btn pa-btn-primary" disabled={busy !== null} onClick={() => changeAutoPay(p.productKey, "resume")}>
                        Resume auto-renewal
                      </button>
                    )}{" "}
                    {(p.autoPay.status === "ACTIVE" || p.autoPay.status === "PAUSED") && (
                      <button type="button" className="pa-btn pa-btn-outline" disabled={busy !== null} onClick={() => setConfirmAuto({ productKey: p.productKey, change: "cancel" })}>
                        Stop auto-renewal
                      </button>
                    )}
                  </p>
                )}
              </div>
            )}
            <p className="pa-hint">The primary method is the only one charged. To replace it, make another method primary first; your last method cannot be removed.</p>
          </section>
        );
      })}
    </div>
  );
}
