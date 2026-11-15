"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Buyer, PlanOffer, ProductBillingProfileRecord } from "@platterly/contract";
import { Icon } from "@/components/account/icons";
import { inr, longDate, type Interval } from "@/modules/store/format";
import { checkBuyer, type BuyerField } from "@/modules/store/buyer-check";
import { billingComplete } from "@/modules/store/profile-ready";
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
const TONE = { good: "success", info: "info", warn: "warning", bad: "warning", none: "neutral" } as const;

/** Manage one product (prototype): plans with Upgrade / Downgrade / Current plan, then Confirm order, Payment (sample) and Confirmation. Nothing is saved or charged. */
/** A paid-plan sign-up arrives with the plan it chose (and, after paying, where to go back to the product). */
export type InitialChoice = { planCode: string; interval: "MONTHLY" | "ANNUAL" };

export function ManageFlow({ product, live = false, savedBuyer = null, accountUrl = null, initialChoice = null, continueUrl = null, hasLogo = false, profile = null, profileState = "ok", collectDetails = false, editUrl = null }: { product: SampleProduct; live?: boolean; savedBuyer?: Buyer | null; accountUrl?: string | null; initialChoice?: InitialChoice | null; continueUrl?: string | null; hasLogo?: boolean; profile?: ProductBillingProfileRecord | null; profileState?: "ok" | "unavailable"; collectDetails?: boolean; editUrl?: string | null }) {
  const sub = product.subscription;
  const currentPlan = sub ? product.plans.find((p) => p.id === sub.planId) ?? null : null;
  // A paid-plan sign-up arrives with its plan chosen, so the page opens on the confirm step (its price is fetched once, below).
  const startPlan = initialChoice ? product.plans.find((p) => p.code === initialChoice.planCode) ?? null : null;
  const [step, setStep] = useState<Step>(startPlan ? "confirm" : "plans");
  const [interval, setInterval] = useState<Interval>(startPlan && initialChoice ? initialChoice.interval : sub?.interval ?? "MONTHLY");
  const [chosen, setChosen] = useState<{ plan: PlanOffer; interval: Interval; kind: ChangeKind } | null>(startPlan && initialChoice ? { plan: startPlan, interval: initialChoice.interval, kind: changeKind(product, startPlan) } : null);
  const [buyer, setBuyer] = useState<Buyer>(savedBuyer ?? EMPTY);
  const [errors, setErrors] = useState<Partial<Record<BuyerField, string>>>({});
  const [cancelling, setCancelling] = useState<"ask" | "done" | null>(null);
  // Real payment (live mode): `paying` while Ops and Razorpay are being talked to; `payError` is plain text for the person; `invoice` comes back from Ops.
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  // What the confirmation page shows about the payment: Razorpay's payment id, Ops's payment id (for the invoice download) and the time Ops confirmed it.
  const [receipt, setReceipt] = useState<{ razorpayPaymentId: string | null; opsPaymentId: string | null; paidAt: string } | null>(null);
  // The price Ops works out for this business (credit for unused days on an upgrade), and the plan changes (downgrade, undo, cancel, reactivate).
  const router = useRouter();
  const [quote, setQuote] = useState<StoreQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // A coupon (yearly plans only for now): what was typed, the code Ops accepted, and Ops's plain reason when it did not.
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const kind = chosen?.kind;
  // The invoice goes to the saved billing profile. A payment needs it complete; a downgrade charges nothing today, so it can go ahead without it.
  const profileReady = collectDetails || billingComplete(profile);
  const blockedByProfile = kind !== "downgrade" && !profileReady;
  const price = chosen && (chosen.interval === "ANNUAL" ? chosen.plan.annual : chosen.plan.monthly);

  /** Live purchases show Ops's own price, with any credit for unused days. A downgrade charges nothing today, so it has no quote. */
  function fetchQuote(plan: PlanOffer, chosenInterval: Interval) {
    if (!live || changeKind(product, plan) === "downgrade") return;
    void fetch("/api/store/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, planId: plan.id, interval: chosenInterval }) })
      .then(async (res) => (res.ok ? setQuote((await res.json()) as StoreQuote) : setQuoteError("We could not work out your price just now. Please go back and try again.")))
      .catch(() => setQuoteError("We could not work out your price just now. Please go back and try again."));
  }

  /** Prices the plan again with a typed code, or without one (`code` null). A refused code keeps the last good price and says why. */
  async function applyCoupon(code: string | null) {
    if (!chosen || !live) return;
    setCouponBusy(true);
    setCouponMessage(null);
    try {
      const res = await fetch("/api/store/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, planId: chosen.plan.id, interval: chosen.interval, ...(code ? { couponCode: code } : {}) }) });
      const answer = (await res.json().catch(() => ({}))) as Partial<StoreQuote> & { message?: string };
      if (!res.ok) return setCouponMessage(answer.message ?? "We could not check that coupon just now. Please try again.");
      setQuote(answer as StoreQuote);
      setCouponApplied(code ? (answer.couponCode ?? code) : null);
      if (!code) setCouponInput("");
    } catch {
      setCouponMessage("We could not check that coupon just now. Please try again.");
    } finally {
      setCouponBusy(false);
    }
  }

  function choose(plan: PlanOffer) {
    const kind = changeKind(product, plan);
    setChosen({ plan, interval, kind });
    setStep("confirm");
    setCouponInput("");
    setCouponApplied(null);
    setCouponMessage(null);
    setQuote(null);
    setQuoteError(null);
    setPayError(null);
    fetchQuote(plan, interval);
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
  useEffect(() => {
    if (startPlan && initialChoice && live) fetchQuote(startPlan, initialChoice.interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // After "Edit billing details" in the Account (another tab), coming back here reloads the saved profile.
  useEffect(() => {
    if (step !== "confirm" || collectDetails) return;
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [step, collectDetails, router]);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (collectDetails) {
      const found = checkBuyer(buyer);
      setErrors(found);
      if (Object.keys(found).length) return;
    } else if (blockedByProfile) return;
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
      const started = await fetch("/api/store/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, planId: chosen.plan.id, interval: chosen.interval, ...(collectDetails ? { buyer } : {}), ...(couponApplied ? { couponCode: couponApplied } : {}) }) });
      const answer = (await started.json().catch(() => ({}))) as (Partial<RazorpayOrder> & Partial<RazorpaySubscription> & { kind?: string }) & { error?: string; message?: string; fields?: Partial<Record<BuyerField, string>> };
      if (!started.ok) {
        if (answer.fields) setErrors(answer.fields);
        setPayError(answer.message ?? (answer.fields ? "Please check the details marked below." : "We could not start your payment. Please try again in a few minutes."));
        return;
      }
      // Yearly plans are one payment; monthly plans are auto-pay (Razorpay charges every 30 days), so the window authorises the renewal.
      let verifyBody: Record<string, unknown>;
      let razorpayPaymentId: string | null = null;
      if (answer.kind === "subscription") {
        const subscriptionId = answer.razorpaySubscriptionId as string;
        const paid = await openRazorpaySubscription(answer as RazorpaySubscription, { name: buyer.name });
        if (!paid) {
          // Closed before finishing: Ops marks the setup as not finished (no charge, same access) and the person can try again.
          void fetch("/api/store/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, razorpaySubscriptionId: subscriptionId, failed: { reason: "not_finished", detail: null } }) }).catch(() => undefined);
          setPayError("Your auto-pay was not set up, so you have not been charged. You can try again.");
          return;
        }
        razorpayPaymentId = paid.razorpay_payment_id;
        verifyBody = { razorpaySubscriptionId: paid.razorpay_subscription_id, razorpayPaymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature };
      } else {
        const paid = await openRazorpay(answer as RazorpayOrder, { name: buyer.name });
        if (!paid) {
          setPayError("Your payment was not completed, so you have not been charged. You can try again.");
          return;
        }
        razorpayPaymentId = paid.razorpay_payment_id;
        verifyBody = { razorpayOrderId: paid.razorpay_order_id, razorpayPaymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature };
      }
      const verified = await fetch("/api/store/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: product.key, ...verifyBody }) });
      const result = (await verified.json().catch(() => ({}))) as { invoiceNumber?: string | null; paymentId?: string | null; message?: string };
      if (!verified.ok) {
        setPayError(result.message ?? "Your payment went through but we could not confirm it yet. Please do not pay again; it will show here shortly, or contact support.");
        return;
      }
      setInvoice(result.invoiceNumber ?? null);
      setReceipt({ razorpayPaymentId, opsPaymentId: result.paymentId ?? null, paidAt: new Date().toISOString() });
      setStep("done");
    } catch {
      setPayError("Something went wrong. If money left your account, please do not pay again: contact support with the time of the payment.");
    } finally {
      setPaying(false);
    }
  }

  const cycle = sub?.interval === "ANNUAL" ? "Yearly" : "Monthly";
  const currentPrice = currentPlan && sub ? (sub.interval === "ANNUAL" ? currentPlan.annual : currentPlan.monthly) : null;
  const saveMore = product.plans.some((p) => p.annual && p.annual.total < p.monthly.total * 12);
  const tone = product.display ? TONE[product.display.tone] ?? "neutral" : "success";
  const logo = hasLogo ? (
    // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
    <img className="pm-logo" src={`/api/product-logo/${encodeURIComponent(product.key)}`} alt="" width={64} height={64} />
  ) : (
    <span className="pm-logo pm-logo-letter" aria-hidden="true">{product.name[0]}</span>
  );

  /** What the person is told will happen, from the plan, the dates and (live) Ops's quote. */
  function nextSteps(): string[] {
    if (!chosen || !price) return [];
    const date = longDate(sub?.nextRenewal ?? "");
    const per = chosen.interval === "ANNUAL" ? "year" : "month";
    if (kind === "downgrade") {
      return [
        `Your current ${currentPlan?.name ?? sub?.planName ?? "plan"} plan will remain active until ${date}.`,
        `From ${date}, your plan will change to ${chosen.plan.name}.`,
        "No payment is required now.",
        chosen.interval === "ANNUAL" ? `Your next payment will be ${inr(price.total)} (${inr(price.amount)} + ${price.gstPercent}% GST), due on ${date}, for the next ${per}.` : `From ${date} you will be charged ${inr(price.total)} (${inr(price.amount)} + ${price.gstPercent}% GST) a ${per}, by auto-pay.`,
      ];
    }
    const today = live && quote ? quote.total : price.total;
    return [
      `Your ${chosen.plan.name} plan starts as soon as your payment is confirmed.`,
      `You pay ${inr(today)} today${live && quote && quote.credit > 0 ? `, after a credit of ${inr(quote.credit)} for your unused days` : ""}.`,
      ...(live && quote && quote.renewalTotal !== null && quote.renewalFrom ? [`From ${longDate(quote.renewalFrom)} it renews at ${inr(quote.renewalTotal)} a month.`] : []),
      "Your invoice is issued to the billing profile shown on this page.",
    ];
  }

  return (
    <main className="ps-page ps-manage">
      <p className="ps-back"><Link href="/"><Icon name="arrowLeft" size={16} /> Back to Store</Link></p>
      <header className="ps-head">
        <h1>Manage your {product.name} subscription</h1>
        <p className="ps-lede">{step === "plans" ? "View your current plan, explore other plans and make changes as needed." : step === "done" ? (kind === "downgrade" ? "Your plan change has been scheduled successfully." : "Your plan change is complete.") : "Review and confirm your plan change."}</p>
        {!live ? <p className="ps-note" role="note">Prototype with sample data. Nothing is saved or charged.</p> : step !== "plans" ? <p className="ps-note" role="note">Plans and prices are live from Platterly. Yearly plans are one payment and monthly plans renew automatically (auto-pay), both through Razorpay (test mode until launch). A downgrade starts when your paid days end.</p> : null}
      </header>

      {step === "plans" && (
        <>
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

          {sub && (
            <section className="pm-current" aria-label="Your current subscription">
              <div className="pm-current-id">
                {logo}
                <div>
                  <p className="pm-eyebrow">Your current subscription</p>
                  <h2>{currentPlan?.name ?? sub.planName ?? "Your plan"}</h2>
                  <p className="pm-muted">{product.name} &middot; {cycle} plan</p>
                </div>
              </div>
              <dl className="pm-current-facts">
                <div><Icon name="calendar" size={22} /><dt>Next renewal</dt><dd>{longDate(sub.nextRenewal)}</dd></div>
                {currentPrice && <div><Icon name="rupee" size={22} /><dt>Renewal amount</dt><dd>{inr(currentPrice.total)}</dd><dd className="pm-sub">({inr(currentPrice.amount)} + {currentPrice.gstPercent}% GST)</dd></div>}
                <div><Icon name="card" size={22} /><dt>Billing cycle</dt><dd>{cycle}</dd><dd className="pm-sub">{sub.interval === "ANNUAL" ? "One-time payment" : "Auto-pay"}</dd></div>
              </dl>
              <span className={`ps-badge ps-badge-${tone} pm-status`}>{tone === "success" ? <Icon name="check" size={14} /> : null}{product.display?.label ?? "Active"}</span>
            </section>
          )}

          <div className="pm-plans-head">
            <div>
              <h2 className="ps-h2">Available plans</h2>
              <p className="ps-sub">Choose a plan that best fits your business. You can upgrade, downgrade or change your billing cycle.</p>
            </div>
            {product.plans.some((p) => p.annual) && (
              <div className="pm-cycle">
                <span>Choose billing cycle</span>
                <div className="ps-toggle" role="group" aria-label="Billing frequency">
                  <button type="button" aria-pressed={interval === "MONTHLY"} onClick={() => setInterval("MONTHLY")}>Monthly</button>
                  <span className="pm-annual">
                    <button type="button" aria-pressed={interval === "ANNUAL"} onClick={() => setInterval("ANNUAL")}>Annual</button>
                    {saveMore && <span className="ps-badge ps-badge-success pm-save" aria-hidden="true">Save more</span>}
                  </span>
                </div>
              </div>
            )}
          </div>

          <ul className="pm-plans">
            {product.plans.map((plan) => {
              const k = changeKind(product, plan);
              const p = interval === "ANNUAL" ? plan.annual : plan.monthly;
              const disabled = k === "current" || !p;
              return (
                <li key={plan.id}>
                  <article className={`pm-plan${k === "current" ? " is-current" : ""}`} aria-label={plan.name}>
                    <div className="pm-plan-head">
                      <h3>{plan.name}</h3>
                      {k === "current" && <span className="ps-badge ps-badge-success"><Icon name="check" size={14} />Current plan</span>}
                    </div>
                    {plan.description && <p className="pm-muted">{plan.description}</p>}
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
                    <ul className="pm-feats">{plan.highlights.map((h) => <li key={h}><Icon name="check" size={16} />{h}</li>)}</ul>
                    {k === "current" ? (
                      <button type="button" className="pm-btn pm-btn-current" aria-label="Current plan" disabled>You are currently subscribed to this plan.</button>
                    ) : (
                      <button type="button" className={`pm-btn ${k === "downgrade" ? "pm-btn-outline" : "pm-btn-solid"}`} disabled={disabled} onClick={() => choose(plan)}>{BUTTON[k]} to {plan.name}</button>
                    )}
                    {k === "downgrade" && sub?.nextRenewal && <p className="pm-note"><Icon name="info" size={16} />Takes effect after your current paid period ends ({longDate(sub.nextRenewal)}).</p>}
                  </article>
                </li>
              );
            })}
          </ul>

          <section className="pm-compare" aria-label="Compare plans">
            <span className="pm-compare-icon" aria-hidden="true"><Icon name="scale" size={24} /></span>
            <div>
              <h2>Compare all plan features</h2>
              <p>See a detailed, side-by-side comparison of {product.plans.map((pl) => pl.name).join(" and ")}.</p>
            </div>
            <button type="button" className="ps-outline" aria-expanded={compare} onClick={() => setCompare(!compare)}>Compare plans <Icon name="arrowRight" size={16} /></button>
          </section>
          {compare && (
            <div className="ps-compare">
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
            </div>
          )}
          {live && sub && sub.interval === "MONTHLY" && (
            // A monthly plan renews by auto-pay: pause and stop are in the Account, next to the payment method (AJ, 2026-11-14).
            <p className="ps-note" role="note" data-testid="autopay-note">
              Your monthly plan renews automatically. To pause or stop auto-renewal, or to change the card it uses, go to {accountUrl ? <a href={`${accountUrl}/payment-methods`}>Payment method in your Account</a> : "Payment method in your Account"}.
            </p>
          )}
          <div className="pm-foot">
            {sub && !(live && sub.interval === "MONTHLY") && !(live && sub.cancelledAt) && cancelling === null ? (
              <button type="button" className="pm-cancel" onClick={() => setCancelling("ask")}><Icon name="trash" size={18} /> Cancel subscription</button>
            ) : <span />}
            <p className="pm-foot-note"><Icon name="info" size={18} />Changes to your plan or billing cycle will apply to future invoices only. Previously issued invoices will remain unchanged.</p>
          </div>
          {sub && !(live && sub.interval === "MONTHLY") && (
            <div className="ps-cancel">
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

      {step === "confirm" && chosen && price && (
        <form className="pm-confirm" onSubmit={confirm} noValidate aria-label={collectDetails ? "Billing details" : "Review changes"}>
          <div className="ps-checkout-grid">
            <div>
              {step === "confirm" && (
                <section className="ps-form pm-form" aria-label="Confirm change">
                  <div className="pm-form-head">
                    <span className="pm-h-icon pm-h-icon-lg" aria-hidden="true"><Icon name={kind === "downgrade" ? "calendar" : "receipt"} size={26} /></span>
                    <div>
                      <h2>{kind === "downgrade" ? "Confirm downgrade" : "Confirm payment"}</h2>
                      <p className="pm-muted">Review the changes to your subscription and confirm.</p>
                    </div>
                  </div>

                  <div className="pm-compare-plans">
                    {currentPlan && sub ? (
                      <PlanMini logo={logo} tag="Current plan" name={currentPlan.name} price={sub.interval === "ANNUAL" ? currentPlan.annual : currentPlan.monthly} interval={sub.interval} />
                    ) : null}
                    {currentPlan && sub ? <Icon name="arrowRight" size={28} className="pm-arrow" /> : null}
                    <PlanMini logo={logo} tag={kind === "downgrade" ? `New plan (after ${longDate(sub!.nextRenewal)})` : currentPlan ? "New plan" : "Your plan"} tagTone="green" name={chosen.plan.name} price={price} interval={chosen.interval} />
                  </div>

                  <div className="pm-next">
                    <h3><Icon name="info" size={22} />What happens next?</h3>
                    <ul>{nextSteps().map((line) => <li key={line}>{line}</li>)}</ul>
                  </div>

                  {kind !== "downgrade" && (
                    <dl className="pm-pay-rows" aria-label="Payment summary">
                      {live && quote ? (
                        <>
                          <div><dt>Plan price</dt><dd data-testid="amount">{inr(quote.planPrice)}</dd></div>
                          {quote.credit > 0 && <div><dt>{quote.creditLabel ?? "Credit for unused days"}</dt><dd data-testid="credit">&minus;{inr(quote.credit)}</dd></div>}
                          {quote.discount > 0 && <div><dt>Coupon {quote.couponCode}</dt><dd data-testid="discount">&minus;{inr(quote.discount)}</dd></div>}
                          <div><dt>GST ({quote.gstPercent}%)</dt><dd data-testid="gst">{inr(quote.gstAmount)}</dd></div>
                          <div className="ps-sum-total"><dt>Total today</dt><dd data-testid="total">{inr(quote.total)}</dd></div>
                          {quote.renewalTotal !== null && quote.renewalFrom && <div><dt>Then, from {longDate(quote.renewalFrom)}</dt><dd data-testid="renewal">{inr(quote.renewalTotal)} a month</dd></div>}
                        </>
                      ) : (
                        <>
                          <div><dt>Plan price</dt><dd data-testid="amount">{inr(price.amount)}</dd></div>
                          <div><dt>GST ({price.gstPercent}%)</dt><dd data-testid="gst">{inr(price.gstAmount)}</dd></div>
                          <div className="ps-sum-total"><dt>Total today</dt><dd data-testid="total">{inr(price.total)}</dd></div>
                        </>
                      )}
                    </dl>
                  )}

                  {collectDetails && (
                    <>
                      <p className="pm-muted">Enter your billing details once. They appear on your first invoice, and you can change them later in your Account.</p>
                      <div className="pm-fields">
                        {FIELDS.map((field) => {
                          const id = `buyer-${field.key}`;
                          const error = errors[field.key as BuyerField];
                          return (
                            <div key={field.key} className={`ps-field${["name", "addressLine1", "addressLine2"].includes(field.key) ? " pm-wide" : ""}`}>
                              <label htmlFor={id}>{field.label}{field.optional && <span className="ps-optional"> (optional)</span>}</label>
                              <input id={id} value={buyer[field.key] ?? ""} autoComplete={field.autoComplete} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : field.hint ? `${id}-hint` : undefined} onChange={(event) => setBuyer({ ...buyer, [field.key]: event.target.value })} />
                              {field.hint && !error && <p id={`${id}-hint`} className="ps-hint">{field.hint}</p>}
                              {error && <p id={`${id}-error`} className="ps-error" role="alert">{error}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {kind !== "downgrade" && (
                    <div className="ps-field">
                      <label htmlFor="coupon">Coupon code<span className="ps-optional"> (optional)</span></label>
                      {!live ? (
                        <input id="coupon" disabled placeholder="Coupons are not switched on yet" />
                      ) : couponApplied ? (
                        <p data-testid="coupon-applied" className="ps-hint">
                          Coupon <strong>{couponApplied}</strong> applied.{" "}
                          <button type="button" className="ps-link" onClick={() => void applyCoupon(null)} disabled={couponBusy || paying}>Remove</button>
                        </p>
                      ) : (
                        <div className="ps-coupon-row">
                          <input id="coupon" value={couponInput} autoComplete="off" maxLength={64} onChange={(event) => setCouponInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (couponInput.trim()) void applyCoupon(couponInput.trim()); } }} />
                          <button type="button" className="ps-secondary" disabled={couponBusy || paying || !couponInput.trim() || !quote} onClick={() => void applyCoupon(couponInput.trim())}>{couponBusy ? "Checking..." : "Apply"}</button>
                        </div>
                      )}
                      {couponMessage && <p className="ps-error" role="alert" data-testid="coupon-message">{couponMessage}</p>}
                    </div>
                  )}
                  {kind !== "downgrade" && (
                    <div className="ps-payblock" role="group" aria-label="Payment">
                      {live ? <p className="ps-hint">You pay once, by card, UPI or net banking, through Razorpay. Your plan starts as soon as the payment is confirmed.</p> : <p className="ps-sample-pay" role="note">Sample payment. No card or UPI is used and no money moves. Real Razorpay checkout comes in a later step.</p>}
                      <p>Amount to pay today: <strong>{live && quote ? inr(quote.total) : live ? "Working out your price..." : inr(price.total)}</strong></p>
                      {quoteError && <p className="ps-error" role="alert">{quoteError}</p>}
                    </div>
                  )}
                  {(payError ?? changeError) && <p className="ps-error" role="alert">{payError ?? changeError}</p>}
                </section>
              )}
            </div>

            <aside className="pm-side" aria-label="Billing and invoice details">
              {!collectDetails && (
                <section className="pm-side-card">
                  <h2><span className="pm-h-icon" aria-hidden="true"><Icon name="fileText" size={20} /></span>Billing &amp; invoice details</h2>
                  {profileState === "unavailable" ? (
                    <p className="ps-warn" role="alert">We could not load your billing details just now. Please refresh in a few minutes.</p>
                  ) : profile && billingComplete(profile) ? (
                    <>
                      <p className="pm-muted">Invoices will be issued to the following billing profile:</p>
                      <p className="pm-bill-name">{profile.name}</p>
                      <ul className="pm-bill">
                        <li><Icon name="mapPin" size={18} /><span>{[profile.addressLine1, profile.addressLine2, profile.city, [profile.state, profile.postalCode].filter(Boolean).join(" – ")].filter(Boolean).join(", ")}</span></li>
                        {profile.gstin && <li><Icon name="receipt" size={18} /><span>GSTIN: {profile.gstin}</span></li>}
                        {profile.contactEmail && <li><Icon name="mail" size={18} /><span>Billing email: <strong>{profile.contactEmail}</strong></span></li>}
                        {profile.contactPhone && <li><Icon name="phone" size={18} /><span>Billing phone: <strong>{profile.contactPhone}</strong></span></li>}
                      </ul>
                    </>
                  ) : (
                    <p className="ps-warn" role="alert">
                      {kind === "downgrade" ? `This product has no complete billing details yet. Your downgrade can go ahead, but add them before ${longDate(sub?.nextRenewal ?? "")} so your next invoice can be issued.` : "This product has no complete billing details yet. Add them in your Account before you pay, so the invoice can be issued."}
                    </p>
                  )}
                  {editUrl && profileState !== "unavailable" && (
                    <a className="pm-edit" href={editUrl} target="_blank" rel="noopener noreferrer">{profile && billingComplete(profile) ? "Edit billing details" : "Set up billing details"} <Icon name="externalLink" size={16} /></a>
                  )}
                </section>
              )}
              <section className="pm-side-card pm-safety">
                <span className="pm-h-icon" aria-hidden="true"><Icon name="shield" size={22} /></span>
                <div>
                  <h2>Invoice safety</h2>
                  <p className="pm-muted">Changes apply to future invoices only. Previously issued invoices will remain unchanged.</p>
                </div>
              </section>
            </aside>
          </div>

          {step === "confirm" && (
            <div className="pm-bar">
              <Link href="/" className="pm-cancel-link">Cancel</Link>
              <div className="pm-bar-actions">
                <button type="button" className="ps-secondary" onClick={() => setStep("plans")} disabled={paying}>Back</button>
                <button type="submit" className="ps-cta" disabled={paying || changing || blockedByProfile || (live && kind !== "downgrade" && !quote)}>{kind === "downgrade" ? (changing ? "Please wait..." : "Schedule downgrade") : paying ? "Please wait..." : live ? (quote ? `Pay ${inr(quote.total)}` : "Pay") : "Simulate successful payment"}</button>
              </div>
            </div>
          )}
        </form>
      )}

      {step === "done" && chosen && price && (
        <section className="pm-done-page" aria-label="Confirmation">
          <div className="pm-hero">
            <span className="pm-done-icon" aria-hidden="true"><Icon name="check" size={40} /></span>
            <h2>{kind === "downgrade" ? "Downgrade scheduled" : kind === "upgrade" ? "Upgrade successful" : "Order confirmed"}</h2>
            {kind === "downgrade" ? (
              <p>Your subscription will change from <strong>{currentPlan?.name ?? sub?.planName ?? "your current plan"} to {chosen.plan.name}</strong> on <strong className="pm-hero-date">{longDate(sub?.nextRenewal ?? "")}</strong>.</p>
            ) : (
              <p>{currentPlan && kind === "upgrade" ? <>Your subscription has been upgraded from <strong>{currentPlan.name}</strong> to <strong>{chosen.plan.name}</strong>.</> : <><strong>{product.name} {chosen.plan.name}</strong> is now your plan.</>}</p>
            )}
            {kind === "downgrade" ? (
              live ? <p role="status" className="pm-muted">You can undo this from the plans page until then.</p> : <p className="ps-sample-pay" role="note">Sample only. Nothing was saved or charged, and no invoice was issued.</p>
            ) : live ? (
              <p role="status" className="pm-muted">{invoice ? `Your invoice number is ${invoice}.` : "Your invoice will be issued shortly."}</p>
            ) : (
              <p className="ps-sample-pay" role="note">Sample only. Nothing was saved or charged, and no invoice was issued.</p>
            )}
          </div>

          <div className="pm-done-grid">
            <section className="pm-side-card pm-detail">
              <h2><span className="pm-h-icon" aria-hidden="true"><Icon name={kind === "downgrade" ? "calendar" : "layers"} size={20} /></span>Plan change details</h2>
              <div className="pm-compare-plans">
                {currentPlan && sub ? <PlanMini logo={logo} tag={kind === "downgrade" ? `Current plan (until ${longDate(sub.nextRenewal)})` : "Previous plan"} name={currentPlan.name} price={sub.interval === "ANNUAL" ? currentPlan.annual : currentPlan.monthly} interval={sub.interval} /> : null}
                {currentPlan && sub ? <Icon name="arrowRight" size={28} className="pm-arrow" /> : null}
                <PlanMini logo={logo} tagTone="green" tag={kind === "downgrade" ? `New plan (from ${longDate(sub?.nextRenewal ?? "")})` : "New plan (active now)"} name={chosen.plan.name} price={price} interval={chosen.interval} />
              </div>
            </section>

            {kind === "downgrade" ? (
              <section className="pm-side-card pm-next">
                <h3><Icon name="info" size={22} />What happens next?</h3>
                <ul className="pm-ticks">
                  {(() => {
                    const n = nextSteps();
                    return [n[0], n[1], "No payment is collected today.", n[3], "Previously issued invoices remain unchanged."];
                  })().map((line) => <li key={line}>{line}</li>)}
                </ul>
              </section>
            ) : (
              <section className="pm-side-card">
                <h2>
                  <span className="pm-h-icon" aria-hidden="true"><Icon name="card" size={20} /></span>Payment details
                  {live && receipt ? <span className="ps-badge ps-badge-success pm-paid"><Icon name="check" size={14} />Paid</span> : null}
                </h2>
                <dl className="pm-rows">
                  <div><dt>Amount paid</dt><dd>{inr(live && quote ? quote.total : price.total)}</dd></div>
                  <div><dt>Payment mode</dt><dd>{live ? "Razorpay" : "Sample (no money moved)"}</dd></div>
                  {receipt?.razorpayPaymentId && <div><dt>Transaction ID</dt><dd>{receipt.razorpayPaymentId}</dd></div>}
                  {receipt && <div><dt>Payment date</dt><dd>{new Date(receipt.paidAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</dd></div>}
                </dl>
              </section>
            )}
          </div>

          {kind !== "downgrade" && (
            <section className="pm-strip" aria-label="What happens next">
              <h3><Icon name="info" size={22} />What happens next?</h3>
              <div className="pm-strip-cols">
                <div><span className="pm-tick" aria-hidden="true"><Icon name="check" size={18} /></span><p><strong>{kind === "upgrade" ? "Upgrade" : "Your plan"} is active now</strong><span>You can now use all the features of the {chosen.plan.name} plan.</span></p></div>
                <div><Icon name="fileText" size={28} /><p><strong>Next renewal</strong>{live && quote?.renewalFrom ? <><b>{longDate(quote.renewalFrom)}</b><span>{inr(quote.renewalTotal ?? price.total)} / {chosen.interval === "ANNUAL" ? "year" : "month"}</span></> : <span>{inr(price.total)} / {chosen.interval === "ANNUAL" ? "year" : "month"}, one year after today. The exact date is on your subscription page.</span>}</p></div>
                <div><Icon name="shield" size={28} /><p><strong>Your invoices</strong><span>Previously issued invoices remain unchanged.</span></p></div>
              </div>
            </section>
          )}

          <div className="pm-bar">
            <div className="pm-bar-actions">
              {accountUrl && <a className="ps-outline" href={`${accountUrl}/subscriptions/${encodeURIComponent(product.key)}`} target="_blank" rel="noopener noreferrer">View subscription <Icon name="externalLink" size={16} /></a>}
              {live && kind !== "downgrade" && receipt?.opsPaymentId && <a className="ps-outline" href={`/api/store/invoice/${encodeURIComponent(receipt.opsPaymentId)}?product=${encodeURIComponent(product.key)}`}>Download invoice <Icon name="download" size={16} /></a>}
            </div>
            {continueUrl ? <a className="ps-cta pm-main" href={continueUrl}>Continue to {product.name}</a> : <Link className="ps-cta pm-main" href="/">Back to Store</Link>}
          </div>
        </section>
      )}
    </main>
  );
}

function PlanMini({ logo, tag, tagTone = "blue", name, price, interval }: { logo: React.ReactNode; tag: string; tagTone?: "blue" | "green"; name: string; price: PlanOffer["monthly"] | null; interval: Interval }) {
  return (
    <div className="pm-mini">
      <span className={`pm-tag pm-tag-${tagTone}`}>{tag}</span>
      <div className="pm-mini-id">{logo}<h3>{name}</h3></div>
      {price ? (
        <>
          <p className="ps-total"><span>{inr(price.total)}</span><span className="ps-per"> / {interval === "ANNUAL" ? "year" : "month"}</span></p>
          <p className="ps-gst">{inr(price.amount)} + {price.gstPercent}% GST</p>
        </>
      ) : null}
    </div>
  );
}
