"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { annualSaving, type BillingLockReason } from "@/modules/subscriptions/billing-math";
import type { SellablePlan } from "@/modules/subscriptions/billing";
import { cancelDowngradeAction, scheduleDowngradeAction, startCheckoutAction, verifyCheckoutAction } from "../actions";

type Interval = "MONTHLY" | "ANNUAL";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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

interface Current {
  planId: string;
  planName: string;
  priceMonthly: number;
  periodEnd: string | null;
  pendingPlanName: string | null;
  pendingInterval: Interval | null;
}

export function SubscribeClient({ plans, locked, lockReason, canPay, onlineBilling, current }: { plans: SellablePlan[]; locked: boolean; lockReason: BillingLockReason | null; canPay: boolean; onlineBilling: boolean; current: Current | null }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(current?.planId ?? plans[0]?.id ?? "");
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const plan = plans.find((candidate) => candidate.id === planId);
  const interval: Interval = annual && plan?.annual ? "ANNUAL" : "MONTHLY";
  const price = plan ? (interval === "ANNUAL" ? plan.annual! : plan.monthly) : null;
  const saving = plan?.annual ? annualSaving(plan.monthly.amount, plan.annual.amount) : 0;

  // Against what the kitchen is on now: same plan renews, a dearer one upgrades, a cheaper one waits for period end.
  const mode = !current || !plan ? "pay" : plan.id === current.planId ? "renew" : plan.priceMonthly < current.priceMonthly ? "downgrade" : "upgrade";
  const heading = locked && lockReason ? HEADLINE[lockReason] : { title: current ? "Manage your plan" : "Upgrade your plan", text: "Pick a plan and billing period. You can change it again at any time." };
  const buttonLabel = !price ? "Pay" : mode === "downgrade" ? "Switch at the end of this period" : `${mode === "renew" ? "Renew" : "Pay"} ${rupees(price.total)}`;

  async function pay() {
    if (!plan) return;
    setError(null);
    setNotice(null);
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
    new window.Razorpay({
      key: started.keyId,
      amount: started.amountPaise,
      currency: "INR",
      name: started.businessName,
      description: started.description,
      order_id: started.razorpayOrderId,
      theme: { color: "#FF6900" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verified = await verifyCheckoutAction(response);
        if (!verified.ok) {
          setBusy(false);
          return setError(verified.error);
        }
        router.push("/dashboard");
        router.refresh();
      },
      modal: { ondismiss: () => setBusy(false) },
    }).open();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-14 sm:px-6 sm:py-20">
      <div className="flex flex-col gap-3">
        <Badge variant="orange" className="self-start">
          <Clock className="size-3.5" />
          {interval === "ANNUAL" ? "1-Year Access" : "30-Day Access"}
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
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No plans are open for sale yet. Please contact Platterly and we will get you set up.</p>
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
                    <span className="text-sm text-muted-foreground">{rupees(candidate.monthly.amount)} / month</span>
                  </button>
                ))}
              </div>
            )}
            {plan?.annual && (
              <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <span className={`text-sm font-medium ${annual ? "text-muted-foreground" : ""}`}>Monthly ({rupees(plan.monthly.amount)})</span>
                <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Pay yearly" />
                <span className={`flex flex-col text-sm ${annual ? "font-medium" : "text-muted-foreground"}`}>
                  <span>
                    Yearly {saving > 0 && <s className="text-xs text-muted-foreground">{rupees(plan.monthly.amount * 12)}</s>} <span className="font-semibold">{rupees(plan.annual.amount)}</span>
                  </span>
                  {saving > 0 && <span className="text-xs font-medium text-success">Save {rupees(saving)}</span>}
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
                  {(plan.highlights.length > 0 ? plan.highlights : plan.description ? [plan.description] : []).map((line) => (
                    <li key={line} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="flex flex-col gap-2 text-sm" data-testid="price-breakdown">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{plan.name}, {interval === "ANNUAL" ? "1 year" : "30 days"}</dt>
                  <dd>{rupees(price.amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GST ({price.gstPercent}%)</dt>
                  <dd>{rupees(price.gstAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{rupees(price.total)}</dd>
                </div>
              </dl>

              {current?.pendingPlanName && (
                <p className="rounded-lg bg-secondary p-3 text-sm">
                  You will move to {current.pendingPlanName} when this period ends{current.periodEnd ? ` on ${longDate(current.periodEnd)}` : ""}.{" "}
                  <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={async () => { await cancelDowngradeAction(); router.refresh(); }}>
                    Cancel that change
                  </button>
                </p>
              )}
              {!onlineBilling && mode !== "downgrade" && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">Online payment is not switched on yet. Please contact Platterly to activate your plan.</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {notice && <p role="status" className="text-sm text-success">{notice}</p>}

              <Button type="button" className="w-full" disabled={busy || !canPay || (mode !== "downgrade" && !onlineBilling)} onClick={pay}>
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
