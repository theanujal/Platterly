import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { describeSubscription, type BillingView, type PlanOffer } from "@platterly/contract";
import { Badge } from "@/components/ui/badge";
import { canSee, hasPermission, requireActiveOrganization } from "@/lib/auth/require-session";
import { storeManageUrl } from "@/lib/platform/config";
import { loadPlanBilling } from "@/modules/ops-link/plan-billing";
import { Detail, DetailGrid, InfoBox, SettingsCard, SettingsPanel, SettingsSection } from "../../_components/settings-ui";

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

  return (
    <SettingsCard title="Subscription" description="Your Platterly plan, its invoices and payments. View only.">
      {page.state === "off" ? (
        <InfoBox tone="neutral">Your plan and billing are managed in Platterly.</InfoBox>
      ) : page.state === "unavailable" ? (
        <InfoBox tone="warning" title="We could not load your subscription">Please reload the page in a few minutes.</InfoBox>
      ) : (
        <Loaded view={page.view} plans={page.plans} isAdmin={isAdmin} />
      )}
    </SettingsCard>
  );
}

function Loaded({ view, plans, isAdmin }: { view: BillingView; plans: PlanOffer[]; isAdmin: boolean }) {
  const sub = view.subscription;
  const display = describeSubscription(sub ? { status: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd, cancelledAt: sub.cancelledAt ?? null, autoPay: sub.autoPay ?? null } : null);
  const offer = sub ? plans.find((p) => p.id === sub.plan.id) : undefined;
  const price = sub?.billingInterval === "ANNUAL" ? offer?.annual : sub?.billingInterval === "MONTHLY" ? offer?.monthly : null;
  const trialing = sub?.status === "TRIALING";

  return (
    <div className="flex flex-col gap-6">
      <SettingsPanel>
        <SettingsSection title="Current subscription" description={sub ? (trialing ? "You are on a free trial." : "Your current plan.") : "No active subscription."}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-semibold" data-testid="plan-name">{sub?.plan.name ?? "No plan"}</p>
            <Badge variant={TONE[display.tone]} data-testid="plan-status">{display.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="plan-detail">{display.detail}</p>
          {sub ? (
            <DetailGrid>
              <Detail label="Billing" value={trialing ? "Free trial" : sub.autoPay ? "Auto-pay every 30 days" : sub.billingInterval ? "Paid once" : "Set by Platterly"} />
              {price && sub.billingInterval ? <Detail label="Plan price" value={`${inr(price.total)} ${sub.billingInterval === "ANNUAL" ? "a year" : "a month"}, GST included`} /> : null}
              {sub.autoPay ? <Detail label="Auto-renewal" value={`${AUTO_PAY[sub.autoPay.status]}${sub.autoPay.nextChargeAt ? `, next charge ${day(sub.autoPay.nextChargeAt)}` : ""}`} /> : null}
              <Detail label="Next billing" value={day(trialing ? sub.trialEndsAt : sub.currentPeriodEnd) || "—"} />
              {sub.pending ? <Detail label="Next plan" value={`${sub.pending.planName} (from the next payment)`} /> : null}
            </DetailGrid>
          ) : null}
          {offer && offer.highlights.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold">What your plan includes</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="plan-includes">
                {offer.highlights.map((h) => <li key={h}>{h}</li>)}
              </ul>
            </div>
          ) : null}
          {isAdmin ? (
            <p>
              <Link href={storeManageUrl()} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="manage-in-store">Manage in your Platterly Account</Link>
            </p>
          ) : (
            <InfoBox tone="neutral">Plan changes and payments are made by your Business Admin.</InfoBox>
          )}
        </SettingsSection>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsSection title="Subscription history">
          {view.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscription history yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {[...view.history].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2"><span>{h.planName}</span><span className="text-muted-foreground">{day(h.startDate)}{h.endDate ? ` to ${day(h.endDate)}` : " to now"}</span></li>
              ))}
            </ul>
          )}
        </SettingsSection>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsSection title="Payments">
          {view.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="payments-list">
              {view.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`payment-${p.id}`}>
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
        </SettingsSection>
      </SettingsPanel>
    </div>
  );
}
