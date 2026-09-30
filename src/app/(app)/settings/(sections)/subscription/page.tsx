import type { Metadata } from "next";
import { CalendarDays, CreditCard, Download, Gift, History } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getCurrentSubscription, listSubscriptionHistory } from "@/modules/subscriptions/subscription";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// Laid out like AJ's Subscription reference (2026-09-30). There is no payment
// or transaction model yet (Chunk 20 owns real billing), so a trial shows
// ₹0 and any other row shows its plan's price; each row's invoice is a PDF
// generated from the subscription itself (invoice/[id]/route.ts).
export default async function SubscriptionPage() {
  const { organizationId } = await requireActiveOrganization();
  const [current, history] = await Promise.all([getCurrentSubscription(organizationId), listSubscriptionHistory(organizationId)]);
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
                  <dd className="font-medium">{trialing ? "Free Trial" : "Not set up yet"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Next Billing:</dt>
                  <dd className="font-medium">{trialing && current.trialEndsAt ? formatDate(current.trialEndsAt) : "—"}</dd>
                </div>
              </dl>
            </div>

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
        <InfoBox tone="neutral">
          <p>Saved payment methods and real payment amounts aren&apos;t modeled yet — a later chunk adds live billing. Invoices are generated from the subscription record.</p>
        </InfoBox>
      </SettingsPanel>
    </SettingsCard>
  );
}
