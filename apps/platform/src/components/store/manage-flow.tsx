"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Buyer, PlanOffer } from "@platterly/contract";
import { inr, longDate, type Interval } from "@/modules/store/format";
import { checkBuyer, type BuyerField } from "@/modules/store/buyer-check";
import type { StoreQuote } from "@/modules/store/ops-checkout";
import { changeKind, type ChangeKind, type SampleProduct } from "@/modules/store/sample-catalogue";
import { openRazorpay, openRazorpaySubscription, type RazorpayOrder, type RazorpaySubscription } from "./razorpay";
import "./store.css";

type Step = "plans" | "confirm" | "done";
const EMPTY: Buyer = { name: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "India", gstin: "" };
const FIELDS: { key: keyof Buyer; label: string; optional?: boolean; autoComplete?: string; hint?: string }[] = [
  { key: "name", label: "Business name", autoComplete: "organization" },
  { key: "addressLine1", label: "Address line 1", autoComplete: "address-line1" },
  { key: "addressLine2", label: "Address line 2", optional: true, autoComplete: "address-line2" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "state", label: "State", autoComplete: "address-level1" },
  { key: "postalCode", label: "PIN code", autoComplete: "postal-code" },
  { key: "gstin", label: "GSTIN", optional: true, hint: "Optional. 15 characters, for a GST invoice in your business name." },
];
const BUTTON: Record<ChangeKind, string> = { current: "Current plan", upgrade: "Upgrade", downgrade: "Downgrade", new: "Subscribe" };

/** Manage one product (prototype): plans with Upgrade / Downgrade / Current plan, then Confirm order, Payment (sample) and Confirmation. Nothing is saved or charged. */
export function ManageFlow({ product, live = false, savedBuyer = null, accountUrl = null }: { product: SampleProduct; live?: boolean; savedBuyer?: Buyer | null; accountUrl?: string | null }) {
  const sub = product.subscription;
  const currentPlan = sub ? product.plans.find((p) => p.id === sub.planId) ?? null : null;
  const [step, setStep] = useState<Step>("plans");
  const [interval, setInterval] = useState<Interval>(sub?.interval ?? "MONTHLY");
  const [chosen, setChosen] = useState<{ plan: PlanOffer; interval: Interval; kind: ChangeKind } | null>(null);
  const [buyer, setBuyer] = useState<Buyer>(savedBuyer ?? EMPTY);
  const [errors, setErrors] = useState<Partial<Record<BuyerField, string>>>({});
  const [cancelling, setCancelling] = useState<"ask" | "done" | null>(null);
  // Real payment (live mode): `paying` while Ops and Razorpay are being talked to; `payError` is plain text for the person; `invoice` comes back from Ops.
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  // The price Ops works out for this business (credit for unused days on an upgrade), and the plan changes (downgrade, undo, cancel, reactivate).
  const router = useRouter();
  const [quote, setQuote] = useState<StoreQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const kind = chosen?.kind;
  const steps = ["Choose plan", kind === "downgrade" ? "Confirm downgrade" : "Confirm payment", "Confirmation"];
  const stepIndex = step === "plans" ? 0 : step === "confirm" ? 1 : 2;
  const price = chosen && (chosen.interval === "ANNUAL" ? chosen.plan.annual : chosen.plan.monthly);

  function choose(plan: PlanOffer) {
    const kind = changeKind(product, plan);
    setChosen({ plan, interval, kind });
    setStep("confirm");
    setQuote(null);
    setQuoteError(null);
    setPayError(null);
    // Live purchases show Ops's own price, with any credit for unused days. A downgrade charges nothing today, so it has no quote.
    if (live && kind !== "downgrade") {
      void fetch("/api/store/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, planId: plan.id, interval }) })
        .then(async (res) => (res.ok ? setQuote((await res.json()) as StoreQuote) : setQuoteError("We could not work out your price just now. Please go back and try again.")))
        .catch(() => setQuoteError("We could not work out your price just now. Please go back and try again."));
    }
  }

  /** Downgrade (at the end of the paid period), undo it, stop renewal, or take that back: one call to Ops through the Store, then the page reloads its data. */
  async function change(kindOfChange: "downgrade" | "undo-downgrade" | "cancel" | "reactivate", plan?: PlanOffer): Promise<boolean> {
    setChanging(true);
    setChangeError(null);
    try {
      const res = await fetch("/api/store/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ change: kindOfChange, productKey: product.key, planId: plan?.id, interval: chosen?.interval ?? interval }) });
      const answer = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setChangeError(answer.message ?? "We could not make that change just now. Please try again in a few minutes.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setChangeError("Something went wrong. Please try again.");
      return false;
    } finally {
      setChanging(false);
    }
  }
  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    const found = checkBuyer(buyer);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!live || !chosen) {
      setStep("done");
      return;
    }
    // A live downgrade is scheduled with Ops for the end of the paid period; nothing is charged. A live purchase is a real payment (one-time for yearly, auto-pay for monthly).
    if (chosen.kind === "downgrade") {
      if (await change("downgrade", chosen.plan)) setStep("done");
      return;
    }
    if (!quote) return;
    setPaying(true);
    setPayError(null);
    try {
      const started = await fetch("/api/store/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, planId: chosen.plan.id, interval: chosen.interval, buyer }) });
      const answer = (await started.json().catch(() => ({}))) as (Partial<RazorpayOrder> & Partial<RazorpaySubscription> & { kind?: string }) & { error?: string; message?: string; fields?: Partial<Record<BuyerField, string>> };
      if (!started.ok) {
        if (answer.fields) setErrors(answer.fields);
        setPayError(answer.message ?? (answer.fields ? "Please check the details marked below." : "We could not start your payment. Please try again in a few minutes."));
        return;
      }
      // Yearly plans are one payment; monthly plans are auto-pay (Razorpay charges every 30 days), so the window authorises the renewal.
      let verifyBody: Record<string, unknown>;
      if (answer.kind === "subscription") {
        const subscriptionId = answer.razorpaySubscriptionId as string;
        const paid = await openRazorpaySubscription(answer as RazorpaySubscription, { name: buyer.name });
        if (!paid) {
          // Closed before finishing: Ops marks the setup as not finished (no charge, same access) and the person can try again.
          void fetch("/api/store/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, razorpaySubscriptionId: subscriptionId, failed: { reason: "not_finished", detail: null } }) }).catch(() => undefined);
          setPayError("Your auto-pay was not set up, so you have not been charged. You can try again.");
          return;
        }
        verifyBody = { razorpaySubscriptionId: paid.razorpay_subscription_id, razorpayPaymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature };
      } else {
        const paid = await openRazorpay(answer as RazorpayOrder, { name: buyer.name });
        if (!paid) {
          setPayError("Your payment was not completed, so you have not been charged. You can try again.");
          return;
        }
        verifyBody = { razorpayOrderId: paid.razorpay_order_id, razorpayPaymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature };
      }
      const verified = await fetch("/api/store/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, ...verifyBody }) });
      const result = (await verified.json().catch(() => ({}))) as { invoiceNumber?: string | null; message?: string };
      if (!verified.ok) {
        setPayError(result.message ?? "Your payment went through but we could not confirm it yet. Please do not pay again; it will show here shortly, or contact support.");
        return;
      }
      setInvoice(result.invoiceNumber ?? null);
      setStep("done");
    } catch {
      setPayError("Something went wrong. If money left your account, please do not pay again: contact support with the time of the payment.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <main className="ps-page ps-manage">
      <p className="ps-back"><Link href="/">&larr; Back to Store</Link></p>
      <header className="ps-head">
        <h1>Manage your {product.name} subscription</h1>
        <p className="ps-lede">Choose a plan, confirm your payment and you are done. Prices include GST.</p>
        <p className="ps-note" role="note">{live ? "Plans and prices are live from Platterly. Yearly plans are one payment and monthly plans renew automatically (auto-pay), both through Razorpay (test mode until launch). A downgrade starts when your paid days end." : "Prototype with sample data. Nothing is saved or charged."}</p>
      </header>

      <ol className="ps-steps" aria-label="Progress">
        {steps.map((label, i) => (
          <li key={label} aria-current={i === stepIndex ? "step" : undefined} className={i <= stepIndex ? "ps-step-on" : undefined}>{label}</li>
        ))}
      </ol>

      {step === "plans" && (
        <>
          {sub && currentPlan && (
            <p className="ps-current">You are on <strong>{currentPlan.name}</strong>, billed {sub.interval === "ANNUAL" ? "yearly" : "monthly"}. Next renewal: {longDate(sub.nextRenewal)}.</p>
          )}
          {live && product.display && ["payment_due", "ended_in_grace", "locked", "trial_ended"].includes(product.display.state) && <p className="ps-warn" role="alert"><strong>{product.display.label}.</strong> {product.display.detail}</p>}
          {live && sub?.pending && (
            <div className="ps-current" role="status">
              A downgrade to <strong>{sub.pending.planName}</strong> ({sub.pending.interval === "ANNUAL" ? "yearly" : "monthly"}) is scheduled for {longDate(sub.nextRenewal)}.{" "}
              <button type="button" className="ps-linkbtn" disabled={changing} onClick={() => void change("undo-downgrade")}>Undo downgrade</button>
            </div>
          )}
          {live && sub?.cancelledAt && (
            <div className="ps-current" role="status">
              You stopped renewal on {longDate(sub.cancelledAt)}. Your plan stays active until {longDate(sub.nextRenewal)}.{" "}
              <button type="button" className="ps-linkbtn" disabled={changing} onClick={() => void change("reactivate")}>Reactivate</button>
            </div>
          )}
          {changeError && step === "plans" && <p className="ps-error" role="alert">{changeError}</p>}
          {product.status === "TRIAL" && <p className="ps-current">Your trial ends on {longDate(product.trialEndsAt!)}. Choose a plan to keep going.</p>}
          {product.plans.some((p) => p.annual) && (
            <div className="ps-toggle" role="group" aria-label="Billing frequency">
              {(["MONTHLY", "ANNUAL"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={interval === value} onClick={() => setInterval(value)}>{value === "MONTHLY" ? "Monthly" : "Annual"}</button>
              ))}
            </div>
          )}
          <ul className="ps-grid">
            {product.plans.map((plan) => {
              const k = changeKind(product, plan);
              const p = interval === "ANNUAL" ? plan.annual : plan.monthly;
              const disabled = k === "current" || !p;
              return (
                <li key={plan.id}>
                  <article className="ps-card" aria-label={plan.name}>
                    <h2>{plan.name}</h2>
                    {plan.description && <p className="ps-desc">{plan.description}</p>}
                    {p ? (
                      <div className="ps-price">
                        <p className="ps-total"><span data-testid="total">{inr(p.total)}</span><span className="ps-per"> / {interval === "ANNUAL" ? "year" : "month"}</span></p>
                        <p className="ps-gst">{inr(p.amount)} + {p.gstPercent}% GST ({inr(p.gstAmount)})</p>
                      </div>
                    ) : (
                      <div className="ps-price">
                        <p className="ps-total ps-unavailable">Monthly only</p>
                        <p className="ps-gst">No annual price for this plan.</p>
                      </div>
                    )}
                    <ul className="ps-highlights">{plan.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
                    <button type="button" className={k === "current" ? "ps-cta ps-current-btn" : "ps-cta"} disabled={disabled} onClick={() => choose(plan)}>{BUTTON[k]}</button>
                  </article>
                </li>
              );
            })}
          </ul>
          <details className="ps-compare">
            <summary>Compare plans in detail</summary>
            <table>
              <thead><tr><th scope="col">Plan</th><th scope="col">Monthly</th><th scope="col">Annual</th><th scope="col">Includes</th></tr></thead>
              <tbody>
                {product.plans.map((plan) => (
                  <tr key={plan.id}>
                    <th scope="row">{plan.name}</th>
                    <td>{inr(plan.monthly.total)}</td>
                    <td>{plan.annual ? inr(plan.annual.total) : "Not offered"}</td>
                    <td>{plan.highlights.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {live && sub && sub.interval === "MONTHLY" && (
            // A monthly plan renews by auto-pay: pause and stop are in the Account, next to the payment method (AJ, 2026-11-14).
            <p className="ps-note" role="note" data-testid="autopay-note">
              Your monthly plan renews automatically. To pause or stop auto-renewal, or to change the card it uses, go to {accountUrl ? <a href={`${accountUrl}/payment-methods`}>Payment method in your Account</a> : "Payment method in your Account"}.
            </p>
          )}
          {sub && !(live && sub.interval === "MONTHLY") && (
            <div className="ps-cancel">
              {cancelling === null && !(live && sub.cancelledAt) && <button type="button" className="ps-linkbtn" onClick={() => setCancelling("ask")}>Cancel subscription</button>}
              {cancelling === "ask" && (
                <div role="alertdialog" aria-label="Cancel subscription" className="ps-confirmbox">
                  <p>{live ? `Stop renewing your ${product.name} subscription? It stays active until ${longDate(sub.nextRenewal)}. Nothing is refunded, and you can reactivate any time before then.` : `Cancel your ${product.name} subscription? Auto-pay stops now and the days you have paid for run out as usual, until ${longDate(sub.nextRenewal)}.`}</p>
                  <button type="button" className="ps-secondary" onClick={() => setCancelling(null)}>Keep subscription</button>
                  <button type="button" className="ps-danger" disabled={changing} onClick={async () => { if (!live) return setCancelling("done"); setCancelling((await change("cancel")) ? null : "ask"); }}>{live ? "Yes, stop renewal" : "Yes, cancel"}</button>
                </div>
              )}
              {cancelling === "done" && <p className="ps-ok" role="status">Sample only: nothing was cancelled.</p>}
            </div>
          )}
        </>
      )}

      {step !== "plans" && chosen && price && (
        <div className="ps-checkout-grid">
          <div>
            {step === "confirm" && (
              <form className="ps-form" onSubmit={confirm} noValidate aria-label="Billing details">
                <h2>{kind === "downgrade" ? "Confirm downgrade" : "Confirm payment"}</h2>
                {FIELDS.map((field) => {
                  const id = `buyer-${field.key}`;
                  const error = errors[field.key as BuyerField];
                  return (
                    <div key={field.key} className="ps-field">
                      <label htmlFor={id}>{field.label}{field.optional && <span className="ps-optional"> (optional)</span>}</label>
                      <input id={id} value={buyer[field.key] ?? ""} autoComplete={field.autoComplete} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : field.hint ? `${id}-hint` : undefined} onChange={(event) => setBuyer({ ...buyer, [field.key]: event.target.value })} />
                      {field.hint && !error && <p id={`${id}-hint`} className="ps-hint">{field.hint}</p>}
                      {error && <p id={`${id}-error`} className="ps-error" role="alert">{error}</p>}
                    </div>
                  );
                })}
                <div className="ps-field">
                  <label htmlFor="coupon">Coupon code<span className="ps-optional"> (optional)</span></label>
                  <input id="coupon" disabled placeholder="Coupons are not switched on yet" />
                </div>
                {kind !== "downgrade" && (
                  <div className="ps-payblock" role="group" aria-label="Payment">
                    {live ? <p className="ps-hint">You pay once, by card, UPI or net banking, through Razorpay. Your plan starts as soon as the payment is confirmed.</p> : <p className="ps-sample-pay" role="note">Sample payment. No card or UPI is used and no money moves. Real Razorpay checkout comes in a later step.</p>}
                    <p>Amount to pay today: <strong>{live && quote ? inr(quote.total) : live ? "Working out your price..." : inr(price.total)}</strong></p>
                    {quoteError && <p className="ps-error" role="alert">{quoteError}</p>}
                  </div>
                )}
                {(payError ?? changeError) && <p className="ps-error" role="alert">{payError ?? changeError}</p>}
                <div className="ps-actions">
                  <button type="button" className="ps-secondary" onClick={() => setStep("plans")} disabled={paying}>Back</button>
                  <button type="submit" className="ps-cta" disabled={paying || changing || (live && kind !== "downgrade" && !quote)}>{kind === "downgrade" ? (changing ? "Please wait..." : "Schedule downgrade") : paying ? "Please wait..." : live ? (quote ? `Pay ${inr(quote.total)}` : "Pay") : "Simulate successful payment"}</button>
                </div>
              </form>
            )}
            {step === "done" && (
              <section className="ps-form" aria-label="Confirmation">
                <h2>{kind === "downgrade" ? "Downgrade scheduled" : kind === "upgrade" ? "Upgrade confirmed" : "Order confirmed"}</h2>
                <p>
                  {kind === "downgrade"
                    ? `You move to ${chosen.plan.name} on ${longDate(sub!.nextRenewal)}. Until then you keep ${currentPlan?.name ?? sub!.planName ?? "your current plan"}, and nothing is charged today.`
                    : live
                      ? `${product.name} ${chosen.plan.name}, billed ${chosen.interval === "ANNUAL" ? "yearly" : "monthly"}: ${inr((quote ?? price).total)} paid. Your plan is now active.`
                      : `${product.name} ${chosen.plan.name}, billed ${chosen.interval === "ANNUAL" ? "yearly" : "monthly"}: ${inr(price.total)} would be charged today.`}
                </p>
                {live && kind === "downgrade" ? <p role="status">You can undo this from the plans page until then.</p> : live ? <p role="status">{invoice ? `Your invoice number is ${invoice}.` : "Your invoice will be issued shortly."}</p> : <p className="ps-sample-pay" role="note">Sample only. Nothing was saved or charged, and no invoice was issued.</p>}
                <Link className="ps-cta" href="/">Back to Store</Link>
              </section>
            )}
          </div>
          <aside className="ps-summary" aria-label="Order summary">
            <h2>{product.name} {chosen.plan.name}</h2>
            <p className="ps-desc">{chosen.interval === "ANNUAL" ? "Billed once a year" : "Billed every month"}</p>
            <dl>
              {live && quote && kind !== "downgrade" ? (
                <>
                  <div><dt>Plan price</dt><dd data-testid="amount">{inr(quote.planPrice)}</dd></div>
                  {quote.credit > 0 && <div><dt>{quote.creditLabel ?? "Credit for unused days"}</dt><dd data-testid="credit">&minus;{inr(quote.credit)}</dd></div>}
                  <div><dt>GST ({quote.gstPercent}%)</dt><dd data-testid="gst">{inr(quote.gstAmount)}</dd></div>
                  <div className="ps-sum-total"><dt>Total today</dt><dd data-testid="total">{inr(quote.total)}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Plan price</dt><dd data-testid="amount">{inr(price.amount)}</dd></div>
                  <div><dt>GST ({price.gstPercent}%)</dt><dd data-testid="gst">{inr(price.gstAmount)}</dd></div>
                  <div className="ps-sum-total"><dt>{kind === "downgrade" ? "Total from " + longDate(sub!.nextRenewal) : "Total today"}</dt><dd data-testid="total">{inr(price.total)}</dd></div>
                </>
              )}
            </dl>
            {kind === "downgrade" && <p className="ps-hint">No charge today. This plan starts at your next renewal.</p>}
          </aside>
        </div>
      )}
    </main>
  );
}
