"use client";

import { useState } from "react";
import Link from "next/link";
import type { Buyer, PlanOffer } from "@platterly/contract";
import { inr, longDate, type Interval } from "@/modules/store/format";
import { checkBuyer, type BuyerField } from "@/modules/store/buyer-check";
import { changeKind, type ChangeKind, type SampleProduct } from "@/modules/store/sample-catalogue";
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
export function ManageFlow({ product, live = false }: { product: SampleProduct; live?: boolean }) {
  const sub = product.subscription;
  const currentPlan = sub ? product.plans.find((p) => p.id === sub.planId) ?? null : null;
  const [step, setStep] = useState<Step>("plans");
  const [interval, setInterval] = useState<Interval>(sub?.interval ?? "MONTHLY");
  const [chosen, setChosen] = useState<{ plan: PlanOffer; interval: Interval; kind: ChangeKind } | null>(null);
  const [buyer, setBuyer] = useState<Buyer>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<BuyerField, string>>>({});
  const [cancelling, setCancelling] = useState<"ask" | "done" | null>(null);

  const kind = chosen?.kind;
  const steps = ["Choose plan", kind === "downgrade" ? "Confirm downgrade" : "Confirm payment", "Confirmation"];
  const stepIndex = step === "plans" ? 0 : step === "confirm" ? 1 : 2;
  const price = chosen && (chosen.interval === "ANNUAL" ? chosen.plan.annual : chosen.plan.monthly);

  function choose(plan: PlanOffer) {
    setChosen({ plan, interval, kind: changeKind(product, plan) });
    setStep("confirm");
  }
  function confirm(event: React.FormEvent) {
    event.preventDefault();
    const found = checkBuyer(buyer);
    setErrors(found);
    if (Object.keys(found).length) return;
    setStep("done");
  }

  return (
    <main className="ps-page ps-manage">
      <p className="ps-back"><Link href="/">&larr; Back to Store</Link></p>
      <header className="ps-head">
        <h1>Manage your {product.name} subscription</h1>
        <p className="ps-lede">Choose a plan, confirm your payment and you are done. Prices include GST.</p>
        <p className="ps-note" role="note">{live ? "Plans and prices are live from Platterly. Payment is not connected yet: nothing is saved or charged." : "Prototype with sample data. Nothing is saved or charged."}</p>
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
          {sub && (
            <div className="ps-cancel">
              {cancelling === null && <button type="button" className="ps-linkbtn" onClick={() => setCancelling("ask")}>Cancel subscription</button>}
              {cancelling === "ask" && (
                <div role="alertdialog" aria-label="Cancel subscription" className="ps-confirmbox">
                  <p>Cancel your {product.name} subscription? Auto-pay stops now and the days you have paid for run out as usual, until {longDate(sub.nextRenewal)}.</p>
                  <button type="button" className="ps-secondary" onClick={() => setCancelling(null)}>Keep subscription</button>
                  <button type="button" className="ps-danger" onClick={() => setCancelling("done")}>Yes, cancel</button>
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
                    <p className="ps-sample-pay" role="note">Sample payment. No card or UPI is used and no money moves. Real Razorpay checkout comes in a later step.</p>
                    <p>Amount to pay today: <strong>{inr(price.total)}</strong></p>
                  </div>
                )}
                <div className="ps-actions">
                  <button type="button" className="ps-secondary" onClick={() => setStep("plans")}>Back</button>
                  <button type="submit" className="ps-cta">{kind === "downgrade" ? "Schedule downgrade" : "Simulate successful payment"}</button>
                </div>
              </form>
            )}
            {step === "done" && (
              <section className="ps-form" aria-label="Confirmation">
                <h2>{kind === "downgrade" ? "Downgrade scheduled" : kind === "upgrade" ? "Upgrade confirmed" : "Order confirmed"}</h2>
                <p>
                  {kind === "downgrade"
                    ? `You move to ${chosen.plan.name} on ${longDate(sub!.nextRenewal)}. Until then you keep ${currentPlan!.name}, and nothing is charged today.`
                    : `${product.name} ${chosen.plan.name}, billed ${chosen.interval === "ANNUAL" ? "yearly" : "monthly"}: ${inr(price.total)} would be charged today.`}
                </p>
                <p className="ps-sample-pay" role="note">Sample only. Nothing was saved or charged, and no invoice was issued.</p>
                <Link className="ps-cta" href="/">Back to Store</Link>
              </section>
            )}
          </div>
          <aside className="ps-summary" aria-label="Order summary">
            <h2>{product.name} {chosen.plan.name}</h2>
            <p className="ps-desc">{chosen.interval === "ANNUAL" ? "Billed once a year" : "Billed every month"}</p>
            <dl>
              <div><dt>Plan price</dt><dd data-testid="amount">{inr(price.amount)}</dd></div>
              <div><dt>GST ({price.gstPercent}%)</dt><dd data-testid="gst">{inr(price.gstAmount)}</dd></div>
              <div className="ps-sum-total"><dt>{kind === "downgrade" ? "Total from " + longDate(sub!.nextRenewal) : "Total today"}</dt><dd data-testid="total">{kind === "downgrade" ? inr(price.total) : inr(price.total)}</dd></div>
            </dl>
            {kind === "downgrade" && <p className="ps-hint">No charge today. This plan starts at your next renewal.</p>}
          </aside>
        </div>
      )}
    </main>
  );
}
