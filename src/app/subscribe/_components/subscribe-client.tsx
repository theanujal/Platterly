"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { annualSaving, type BillingLockReason } from "@/modules/subscriptions/billing-math";
import type { SellablePlan } from "@/modules/subscriptions/billing";
import { cancelDowngradeAction, reportAutoPayFailedAction, scheduleDowngradeAction, startCheckoutAction, verifyCheckoutAction } from "../actions";
import { inrUpTo2 } from "@/modules/invoices/invoice-format";

type Interval = "MONTHLY" | "ANNUAL";

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const HEADLINE: Record<BillingLockReason, { title: string; text: string }> = {
  trial_ended: { title: "Your free trial has ended", text: "Choose a plan to get back into your account. Everything you built is safe and waiting." },
  period_ended: { title: "Your plan has ended", text: "Renew to get back into your account. Everything you built is safe and waiting." },
  ended: { title: "Your subscription is not active", text: "Choose a plan to get back into your account. Everything you built is safe and waiting." },
};

const TRUST = [
  { icon: ShieldCheck, title: "Secure Payment", text: "256-bit SSL encryption" },
  { icon: Lock, title: "Data Protection", text: "Your data is safe with us" },
  { icon: CreditCard, title: "Easy Payment", text: "Cards, UPI and net banking" },
];

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/** How an auto-pay setup went, as the checkout window saw it (design: "Failed or unfinished auto-pay setup"). */
type Setup = { kind: "declined"; detail: string | null } | { kind: "not_finished" } | { kind: "setting"; checks: number } | { kind: "on" };
// "Setting up auto-pay…" checks with ops every 5 seconds for a minute.
const SETUP_CHECKS = 12;

interface Current {
  planId: string;
  planName: string;
  priceMonthly: number;
  periodEnd: string | null;
  pendingPlanName: string | null;
  pendingInterval: Interval | null;
  autoPay: { status: string; nextChargeAt: string | null } | null;
}

export function SubscribeClient({ plans, locked, lockReason, canPay, onlineBilling, autoPayBilling, current }: { plans: SellablePlan[]; locked: boolean; lockReason: BillingLockReason | null; canPay: boolean; onlineBilling: boolean; autoPayBilling: boolean; current: Current | null }) {
  const router = useRouter();
  // A downgrade waiting for approval (Ops stopped the auto-pay) opens on the plan it is moving to.
  const [planId, setPlanId] = useState((current?.autoPay?.status === "CANCELLED" && plans.find((p) => p.name === current.pendingPlanName)?.id) || current?.planId || plans[0]?.id || "");
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);

  const plan = plans.find((candidate) => candidate.id === planId);
  const interval: Interval = annual && plan?.annual ? "ANNUAL" : "MONTHLY";
  const price = plan ? (interval === "ANNUAL" ? plan.annual! : plan.monthly) : null;
  // Monthly is auto-pay only when Platterly Ops takes the money; catering's own billing sells 30 days at a time.
  const monthlyAutoPay = interval === "MONTHLY" && autoPayBilling;
  const saving = plan?.annual ? annualSaving(plan.monthly.amount, plan.annual.amount) : 0;

  const autoPay = current?.autoPay ?? null;
  const autoPayOn = autoPay?.status === "ACTIVE" || autoPay?.status === "PAUSED";
  // Against what the kitchen is on now: same plan renews, a dearer one upgrades, a cheaper one waits for period end.
  // Auto-pay that failed, stopped or ended (a downgrade waiting for approval) is set up again: a new auto-pay, charged now.
  const mode = !current || !plan || (autoPay && !autoPayOn) ? "pay" : plan.id === current.planId ? "renew" : plan.priceMonthly < current.priceMonthly ? "downgrade" : "upgrade";
  // Monthly on the plan already on auto-pay: nothing to pay; the next charge is automatic.
  const alreadyOn = monthlyAutoPay && mode === "renew" && autoPayOn;
  // Auto-pay charges at once and starts 30 new days, so on the plan already paid for it waits until those days end (Sharath, 2026-10-23).
  const waitUntil = monthlyAutoPay && mode === "renew" && !autoPayOn && current?.periodEnd && new Date(current.periodEnd) > new Date() ? current.periodEnd : null;
  const heading = locked && lockReason ? HEADLINE[lockReason] : { title: current ? "Manage your plan" : "Upgrade your plan", text: "Pick a plan and billing period. You can change it again at any time." };
  const buttonLabel = !price
    ? "Pay"
    : mode === "downgrade"
      ? "Switch at the end of this period"
      : !monthlyAutoPay
        ? `${mode === "renew" ? "Renew" : "Pay"} ${inrUpTo2(price.total)}`
        : alreadyOn
          ? "Auto-pay is on"
          : waitUntil
            ? `Set up auto-pay from ${longDate(waitUntil)}`
            : `${autoPay ? "Set up auto-pay again and pay" : "Set up auto-pay and pay"} ${inrUpTo2(price.total)}`;

  // Paid, but ops waits for Razorpay's webhook: ask again until the auto-pay shows as on.
  const settingUp = setup?.kind === "setting" && !autoPayOn;
  useEffect(() => {
    if (setup?.kind !== "setting" || autoPayOn || setup.checks >= SETUP_CHECKS) return;
    const timer = setTimeout(() => {
      setSetup({ kind: "setting", checks: setup.checks + 1 });
      router.refresh();
    }, 5000);
    return () => clearTimeout(timer);
  }, [setup, autoPayOn, router]);

  async function pay() {
    if (!plan) return;
    setError(null);
    setNotice(null);
    setSetup(null);
    setBusy(true);
    if (mode === "downgrade") {
      const result = await scheduleDowngradeAction(plan.id, interval);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      setNotice(`Done. You stay on ${current?.planName} until ${current?.periodEnd ? longDate(current.periodEnd) : "the end of this period"}, then move to ${plan.name}.`);
      return router.refresh();
    }
    const started = await startCheckoutAction(plan.id, interval);
    if (!started.ok) {
      setBusy(false);
      return setError(started.error);
    }
    if (!(await loadCheckout()) || !window.Razorpay) {
      setBusy(false);
      return setError("Could not load the payment window. Please check your connection and try again.");
    }
    // Monthly is a Razorpay subscription (auto-pay); yearly and catering's own billing are an order.
    const subscriptionId = "razorpaySubscriptionId" in started ? started.razorpaySubscriptionId : null;
    const window_ = "razorpaySubscriptionId" in started ? { subscription_id: started.razorpaySubscriptionId } : { amount: started.amountPaise, currency: "INR", order_id: started.razorpayOrderId };
    // Razorpay's window can stay open after a decline for another try, so closing it says "not finished" only when nothing else was said.
    let settled = false;
    const checkout = new window.Razorpay({
      key: started.keyId,
      name: started.businessName,
      description: started.description,
      ...window_,
      theme: { color: "#FF6900" },
      handler: async (response: { razorpay_order_id?: string; razorpay_subscription_id?: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        settled = true;
        const verified = await verifyCheckoutAction(response);
        if (!verified.ok) {
          setBusy(false);
          return setError(verified.error);
        }
        if (!subscriptionId) {
          router.push("/settings/subscription?paid=1");
          return router.refresh();
        }
        // Never "charged" until ops has confirmed the payment. Ops has already recorded a mandate that failed.
        setBusy(false);
        setSetup(verified.failed ? { kind: "not_finished" } : verified.confirmed ? { kind: "on" } : { kind: "setting", checks: 0 });
        router.refresh();
      },
      modal: {
        ondismiss: () => {
          setBusy(false);
          if (!subscriptionId || settled) return;
          setSetup({ kind: "not_finished" });
          void reportAutoPayFailedAction(subscriptionId, "not_finished", null);
        },
      },
    });
    if (subscriptionId) {
      // Razorpay can send the same failure twice (seen in test mode, 2026-10-23): report each payment once.
      let lastFailed: string | undefined;
      checkout.on("payment.failed", (response) => {
        const paymentId = response.error?.metadata?.payment_id;
        if (paymentId && paymentId === lastFailed) return;
        lastFailed = paymentId;
        settled = true;
        const detail = response.error?.description ?? null;
        setSetup({ kind: "declined", detail });
        void reportAutoPayFailedAction(subscriptionId, "declined", detail);
      });
    }
    checkout.open();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-14 sm:px-6 sm:py-20">
      <div className="flex flex-col gap-3">
        <Badge variant="orange" className="self-start">
          <Clock className="size-3.5" />
          {interval === "ANNUAL" ? "1-Year Access" : monthlyAutoPay ? "Auto-pay every 30 days" : "30-Day Access"}
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="subscribe-title">
          {heading.title}
        </h1>
        <p className="text-base text-muted-foreground">{heading.text}</p>
      </div>

      {!canPay && (
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
          Only the account owner can pay for the plan. Please ask them to sign in and renew.
        </p>
      )}

      {plans.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No plans are open for sale yet. Please contact Platterly at{" "}
          <a className="font-medium text-foreground underline" href="mailto:hello@platterly.in">hello@platterly.in</a> and we will get you set up.</p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-center text-lg font-semibold">Choose Your Plan</h2>
            {plans.length > 1 && (
              <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-2">
                {plans.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="radio"
                    aria-checked={candidate.id === planId}
                    onClick={() => setPlanId(candidate.id)}
                    className={`rounded-xl border bg-card p-4 text-left transition-colors ${candidate.id === planId ? "border-primary ring-2 ring-primary/20" : "border-border hover:bg-muted"}`}
                  >
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {candidate.name}
                      {current?.planId === candidate.id && <Badge variant="success">Current</Badge>}
                    </span>
                    <span className="text-sm text-muted-foreground">{inrUpTo2(candidate.monthly.amount)} / month</span>
                  </button>
                ))}
              </div>
            )}
            {plan?.annual && (
              <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <span className={`text-sm font-medium ${annual ? "text-muted-foreground" : ""}`}>Monthly ({inrUpTo2(plan.monthly.amount)})</span>
                <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Pay yearly" />
                <span className={`flex flex-col text-sm ${annual ? "font-medium" : "text-muted-foreground"}`}>
                  <span>
                    Yearly {saving > 0 && <s className="text-xs text-muted-foreground">{inrUpTo2(plan.monthly.amount * 12)}</s>} <span className="font-semibold">{inrUpTo2(plan.annual.amount)}</span>
                  </span>
                  {saving > 0 && <span className="text-xs font-medium text-success">Save {inrUpTo2(saving)}</span>}
                </span>
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </section>

          {plan && price && (
            <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
                <h2 className="text-xl font-semibold">{plan.name} Benefits</h2>
                <ul className="flex flex-col gap-3">
                  {(plan.highlights.length > 0 ? plan.highlights : plan.description ? [plan.description] : []).map((line, i) => (
                    // By position too: a plan saved before Ops dropped repeated lines can still list one twice (issue 91).
                    <li key={`${i}-${line}`} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="flex flex-col gap-2 text-sm" data-testid="price-breakdown">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{plan.name}, {interval === "ANNUAL" ? "1 year" : "30 days"}</dt>
                  <dd>{inrUpTo2(price.amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GST ({price.gstPercent}%)</dt>
                  <dd>{inrUpTo2(price.gstAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{inrUpTo2(price.total)}</dd>
                </div>
              </dl>

              {monthlyAutoPay && !setup && (
                <p className="rounded-lg bg-secondary p-3 text-sm" data-testid="autopay-note">
                  {alreadyOn
                    ? `Auto-pay is on${autoPay?.nextChargeAt ? `. Next charge ${inrUpTo2(price.total)} on ${longDate(autoPay.nextChargeAt)}` : ""}. You can pause it in Settings → Subscription.`
                    : waitUntil
                      ? `${inrUpTo2(price.total)} every 30 days, auto-pay. You can set it up when your paid days end on ${longDate(waitUntil)}, so you keep the days you have paid for.`
                      : `${inrUpTo2(price.total)} now, then every 30 days, auto-pay. Pause at any time in Settings → Subscription.`}
                </p>
              )}

              {current?.pendingPlanName && (
                <p className="rounded-lg bg-secondary p-3 text-sm">
                  You will move to {current.pendingPlanName} when this period ends{current.periodEnd ? ` on ${longDate(current.periodEnd)}` : ""}.{" "}
                  {/* Ops refuses the undo once auto-pay is stopping for it (Task 8). */}
                  {!autoPay ? (
                    <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={async () => { await cancelDowngradeAction(); router.refresh(); }}>
                      Cancel that change
                    </button>
                  ) : null}
                </p>
              )}
              {!onlineBilling && mode !== "downgrade" && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">Online payment is not switched on yet. Please contact Platterly to activate your plan.</p>}
              {setup && (setup.kind === "declined" || setup.kind === "not_finished") && (
                <div role="alert" className="flex flex-col gap-2 rounded-lg bg-destructive/10 p-3 text-sm" data-testid="autopay-setup">
                  <p>
                    {setup.kind === "declined"
                      ? "Your payment didn't go through, so you weren't charged and auto-pay isn't set up. Try again, or use another bank account or card."
                      : "Auto-pay wasn't set up. If any money left your account, your bank returns it automatically."}
                  </p>
                  {setup.kind === "declined" && setup.detail && <p className="text-muted-foreground">{setup.detail}</p>}
                  <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={pay}>
                    Try again
                  </Button>
                </div>
              )}
              {setup && (setup.kind === "on" || setup.kind === "setting") && (
                <p role="status" className="rounded-lg bg-secondary p-3 text-sm" data-testid="autopay-setup">
                  {!settingUp
                    ? `Auto-pay is on.${autoPay?.nextChargeAt ? ` Next charge ${inrUpTo2(price.total)} on ${longDate(autoPay.nextChargeAt)}.` : ""}`
                    : setup.kind === "setting" && setup.checks < SETUP_CHECKS
                      ? "Setting up auto-pay… this can take a minute."
                      : "Auto-pay is still being set up. Settings → Subscription will show it once it is on."}
                </p>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {notice && <p role="status" className="text-sm text-success">{notice}</p>}

              <Button type="button" className="w-full" disabled={busy || alreadyOn || !!waitUntil || !canPay || (mode !== "downgrade" && !onlineBilling)} onClick={pay}>
                {busy ? "Please wait…" : buttonLabel}
              </Button>
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" />
                Payments secured by Razorpay
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
