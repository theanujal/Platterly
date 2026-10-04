import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CreditCard, Download, Gift, History, Receipt, Sparkles } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getCurrentSubscription, listSubscriptionHistory } from "@/modules/subscriptions/subscription";
import { listSubscriptionPayments } from "@/modules/subscriptions/billing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { InfoBox, PanelHeader, SettingsCard, SettingsPanel } from "../../_components/settings-ui";

export const metadata: Metadata = {
  title: "Subscription — Platterly",
  robots: { index: false, follow: false },
};

function formatLimit(value: number | null): string {
  return value === null ? "Unlimited" : value.toLocaleString();
}

const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const formatMoney = (value: unknown, currency: string) => (value === null || value === undefined ? "—" : `${currency} ${Number(value).toLocaleString("en-IN")}`);

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

// Raw enum values (TRIALING) read badly in a badge.
const STATUS_LABEL: Record<string, string> = { TRIALING: "Trial Active", ACTIVE: "Active", CANCELLED: "Cancelled", EXPIRED: "Expired", PAST_DUE: "Past Due" };
const statusLabel = (status: string) => STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");

// Laid out like AJ's Subscription reference (2026-09-30). Real payments (Chunk 20) are listed in their own panel;
// the history rows still show the plan's list price, and each row's invoice is a PDF
// generated from the subscription itself (invoice/[id]/route.ts).
export default async function SubscriptionPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const [current, history, payments] = await Promise.all([getCurrentSubscription(organizationId), listSubscriptionHistory(organizationId), listSubscriptionPayments(organizationId)]);
  const pendingPlan = current?.pendingPlanId ? await prisma.subscriptionPlan.findUnique({ where: { id: current.pendingPlanId }, select: { name: true } }) : null;
  const trialing = current?.status === "TRIALING" && current.trialEndsAt;

  return (
    <SettingsCard title="Subscription" description="Your current plan and subscription history.">
      <SettingsPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelHeader
            icon={Gift}
            title="Current Subscription"
            description={current ? (trialing ? "You are currently on a free trial" : "Your current plan") : "No active subscription."}
          />
          {current && <Badge variant={trialing ? "orange" : "success"}>{statusLabel(current.status)}</Badge>}
        </div>

        {current && (
          <>
            <div>
              <p className="text-lg font-semibold">
                {current.subscriptionPlan.name}
                {trialing && current.trialEndsAt && <span className="ml-2 text-sm font-medium text-tone-orange">({daysUntil(current.trialEndsAt)} days left)</span>}
              </p>
              {trialing && current.trialEndsAt && (
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="size-4" />
                  Trial expires on {formatDate(current.trialEndsAt)}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-lg bg-secondary p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="size-4" />
                Billing Information
              </h3>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Payment Method:</dt>
                  <dd className="font-medium">{trialing ? "Free Trial" : current.billingInterval ? "Razorpay (card, UPI or net banking)" : "Set by Platterly"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Next Billing:</dt>
                  <dd className="font-medium">{trialing && current.trialEndsAt ? formatDate(current.trialEndsAt) : current.currentPeriodEnd ? formatDate(current.currentPeriodEnd) : "—"}</dd>
                </div>
                {pendingPlan && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Next plan:</dt>
                    <dd className="font-medium">{pendingPlan.name} (from the next payment)</dd>
                  </div>
                )}
              </dl>
            </div>

            <Button size="md" className="self-start" render={<Link href="/subscribe" />} nativeButton={false} data-testid="manage-plan">
              <Sparkles data-icon="inline-start" />
              {trialing ? "Upgrade plan" : "Renew or change plan"}
            </Button>

            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ["Monthly price", formatMoney(current.subscriptionPlan.priceMonthly, current.subscriptionPlan.currency)],
                ["Annual price", formatMoney(current.subscriptionPlan.priceAnnual, current.subscriptionPlan.currency)],
                ["Team members", formatLimit(current.subscriptionPlan.maxUsers)],
                ["Events", formatLimit(current.subscriptionPlan.maxEvents)],
                ["Orders", formatLimit(current.subscriptionPlan.maxOrders)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-border pb-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </SettingsPanel>

      <SettingsPanel>
        <PanelHeader icon={History} title="Subscription History" description="View all your subscription payments and download invoices" />
        <ul className="flex flex-col gap-2">
          {history.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-3">
                  <Badge variant="info">{row.subscriptionPlan.name}</Badge>
                  <span className="font-medium">
                    {formatDate(row.startDate)} – {row.endDate ? formatDate(row.endDate) : row.trialEndsAt && row.status === "TRIALING" ? formatDate(row.trialEndsAt) : "ongoing"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  {row.status === "TRIALING" ? "Payment: ₹0" : `Plan price: ${formatMoney(row.subscriptionPlan.priceMonthly, row.subscriptionPlan.currency)}`}
                  {row.status === "TRIALING" && <span>Free Trial</span>}
                  <Badge variant={row.status === "TRIALING" ? "warning" : "neutral"}>{row.status === "TRIALING" ? "Trial" : statusLabel(row.status)}</Badge>
                </span>
              </div>
              <Button variant="outline" size="md" render={<a href={`/settings/subscription/invoice/${row.id}`} download />} nativeButton={false}>
                <Download data-icon="inline-start" />
                Invoice
              </Button>
            </li>
          ))}
          {history.length === 0 && <li className="text-sm text-muted-foreground">No subscription history yet.</li>}
        </ul>
      </SettingsPanel>

      <SettingsPanel>
        <PanelHeader icon={Receipt} title="Payments" description="What you have paid for your plan, GST included" />
        {payments.length === 0 ? (
          <InfoBox tone="neutral">
            <p>No plan payments yet. Once you pay for a plan, each payment and its invoice number shows here.</p>
          </InfoBox>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="payments-list">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {payment.subscriptionPlan.name}, {payment.interval === "ANNUAL" ? "1 year" : "30 days"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {payment.invoiceNumber} · {payment.paidAt ? formatDate(payment.paidAt) : ""}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="flex flex-col items-end">
                    <span className="font-semibold">{formatMoney(payment.total, "INR")}</span>
                    <span className="text-xs text-muted-foreground">includes GST {formatMoney(payment.gstAmount, "INR")}</span>
                  </span>
                  <Button variant="outline" size="md" render={<a href={`/settings/subscription/payment-invoice/${payment.id}`} download />} nativeButton={false}>
                    <Download data-icon="inline-start" />
                    Invoice
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsPanel>
    </SettingsCard>
  );
}
