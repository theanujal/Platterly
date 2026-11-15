import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Gift, History, Receipt, Sparkles } from "lucide-react";
import { describeSubscription, type BillingView, type PlanOffer } from "@platterly/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canSee, hasPermission, requireActiveOrganization } from "@/lib/auth/require-session";
import { storeManageUrl } from "@/lib/platform/config";
import { getEntitlements, limitOf } from "@/modules/ops-link/entitlements";
import { loadPlanBilling } from "@/modules/ops-link/plan-billing";
import { InfoBox, PanelHeader, SettingsCard, SettingsPanel } from "../../_components/settings-ui";

export const metadata: Metadata = {
  title: "Subscription — Caterly",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const inr = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "");
const term = (interval: "MONTHLY" | "ANNUAL") => (interval === "ANNUAL" ? "yearly" : "monthly");
const TONE = { good: "success", info: "info", warn: "warning", bad: "danger", none: "neutral" } as const;
const REFUND = { PENDING: "Refund requested", REJECTED: "Refund declined", PARTIAL: "Partly refunded", REFUNDED: "Refunded" } as const;
const AUTO_PAY = { ACTIVE: "On", PENDING: "Payment failed, retrying", PAUSED: "Paused", HALTED: "Stopped", CANCELLED: "Off" } as const;

/**
 * The Subscription page, read-only (AJ, 2026-11-15; docs/caterly-billing-view-plan.md). Anyone whose role has "Billing and Plan" may look; only the Business Admin gets the
 * button to the Store. Plans, payments, refunds and auto-renewal are changed in the Platterly Account and Store, never here. The data is Platterly Ops's.
 */
export default async function SubscriptionPage() {
  const { organizationId } = await requireActiveOrganization();
  if (!(await canSee("planBilling", organizationId))) redirect("/dashboard");
  const isAdmin = await hasPermission({ tenant: ["edit"] }, organizationId);
  const page = await loadPlanBilling(organizationId);
  const entitlements = page.state === "ok" ? await getEntitlements(organizationId) : null;
  const limits = {
    team: entitlements ? (limitOf(entitlements, "maxUsers") ?? null) : null,
    events: entitlements ? (limitOf(entitlements, "maxEvents") ?? null) : null,
    orders: entitlements ? (limitOf(entitlements, "maxOrders") ?? null) : null,
  };

  return (
    <SettingsCard title="Subscription" description="Your current plan and subscription history.">
      {page.state === "off" ? (
        <InfoBox tone="neutral">Your plan and billing are managed in Platterly.</InfoBox>
      ) : page.state === "unavailable" ? (
        <InfoBox tone="warning" title="We could not load your subscription">Please reload the page in a few minutes.</InfoBox>
      ) : (
        <Loaded view={page.view} plans={page.plans} isAdmin={isAdmin} limits={limits} />
      )}
    </SettingsCard>
  );
}

/** One label and value with the rule under it, the rows of the plan's price and limits. */
function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

const limitText = (limit: number | null) => (limit === null ? "Unlimited" : limit.toLocaleString("en-IN"));

function Loaded({ view, plans, isAdmin, limits }: { view: BillingView; plans: PlanOffer[]; isAdmin: boolean; limits: { team: number | null; events: number | null; orders: number | null } }) {
  const sub = view.subscription;
  const display = describeSubscription(sub ? { status: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd, cancelledAt: sub.cancelledAt ?? null, autoPay: sub.autoPay ?? null } : null);
  const offer = sub ? plans.find((p) => p.id === sub.plan.id) : undefined;
  const trialing = sub?.status === "TRIALING";
  const paymentMethod = trialing ? "Free trial" : sub?.paymentMethod ?? "Set by Platterly";
  const priceOf = (planName: string) => {
    const paid = view.payments.find((p) => p.planName === planName);
    return paid ? `${inr(paid.total)} ${paid.interval === "ANNUAL" ? "a year" : "a month"}` : "—";
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelHeader icon={Gift} title="Current Subscription" description={sub ? (trialing ? "You are on a free trial." : "Your current plan") : "No active subscription."} />
          <Badge variant={TONE[display.tone]} data-testid="plan-status">{display.label}</Badge>
        </div>
        <div>
          <p className="text-xl font-semibold" data-testid="plan-name">{sub?.plan.name ?? "No plan"}</p>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="plan-detail">{display.detail}</p>
        </div>
        {sub ? (
          <div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm" data-testid="billing-information">
            <h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-4" />Billing Information</h3>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Payment Method:</span><span data-testid="payment-method">{paymentMethod}</span></div>
            {sub.autoPay ? <div className="flex justify-between gap-3"><span className="text-muted-foreground">Auto-renewal:</span><span>{AUTO_PAY[sub.autoPay.status]}</span></div> : null}
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Next Billing:</span><span>{day(trialing ? sub.trialEndsAt : sub.currentPeriodEnd) || "—"}</span></div>
            {sub.pending ? <div className="flex justify-between gap-3"><span className="text-muted-foreground">Next plan:</span><span>{sub.pending.planName} (from the next payment)</span></div> : null}
          </div>
        ) : null}
        {isAdmin ? (
          <div>
            <Button size="md" render={<Link href={storeManageUrl()} data-testid="manage-in-store" />}>
              <Sparkles /> Renew or change plan
            </Button>
          </div>
        ) : (
          <InfoBox tone="neutral">Plan changes and payments are made by your Business Admin.</InfoBox>
        )}
        <dl className="grid grid-cols-1 gap-x-12 sm:grid-cols-2">
          <Row label="Monthly price" value={offer ? inr(offer.monthly.total) : "—"} />
          <Row label="Annual price" value={offer?.annual ? inr(offer.annual.total) : "—"} />
          <Row label="Team members" value={limitText(limits.team)} />
          <Row label="Events" value={limitText(limits.events)} />
          <Row label="Orders" value={limitText(limits.orders)} />
        </dl>
        {offer && offer.highlights.length > 0 ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold">What your plan includes</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="plan-includes">
              {offer.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </div>
        ) : null}
      </SettingsPanel>

      <SettingsPanel>
        <PanelHeader icon={History} title="Subscription History" description="View all your subscription payments and download invoices" />
        {view.history.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">No subscription history yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {[...view.history].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((h) => (
              <li key={h.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="info">{h.planName}</Badge>
                  <span className="font-medium">{day(h.startDate)} – {h.endDate ? day(h.endDate) : "ongoing"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>Plan price: {priceOf(h.planName)}</span>
                  <Badge variant="neutral">{h.endDate ? "Ended" : "Active"}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsPanel>

      <SettingsPanel>
        <PanelHeader icon={Receipt} title="Payments" description="What you have paid for your plan, GST included" />
        {view.payments.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">No plan payments yet. Once you pay for a plan, each payment and its invoice number shows here.</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="payments-list">
            {view.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-4 text-sm" data-testid={`payment-${p.id}`}>
                <span className="flex flex-col">
                  <span className="font-medium">{p.planName}, {term(p.interval)} · {inr(p.total)}</span>
                  <span className="text-xs text-muted-foreground">{day(p.paidAt)}{p.invoiceNumber ? ` · invoice ${p.invoiceNumber}` : ""}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {p.refund ? <Badge variant={p.refund.status === "REFUNDED" ? "success" : p.refund.status === "REJECTED" ? "neutral" : "info"}>{REFUND[p.refund.status]}{p.refund.status === "PARTIAL" ? ` ${inr(p.refund.refunded)}` : ""}</Badge> : null}
                  {p.invoiceNumber ? <a className="underline underline-offset-2" href={`/settings/subscription/invoice/${encodeURIComponent(p.id)}`}>Invoice</a> : null}
                  {(p.creditNotes ?? []).map((n) => <a key={n.id} className="underline underline-offset-2" href={`/settings/subscription/credit-note/${encodeURIComponent(n.id)}`}>Credit note {n.number}</a>)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsPanel>
    </div>
  );
}
