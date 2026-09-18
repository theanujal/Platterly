import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getCurrentSubscription, listSubscriptionHistory } from "@/modules/subscriptions/subscription";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Subscription — Platterly",
  robots: { index: false, follow: false },
};

function formatLimit(value: number | null): string {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function formatPrice(value: unknown, currency: string): string {
  if (value === null || value === undefined) return "—";
  return `${currency} ${Number(value).toLocaleString()}`;
}

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

// Chunk 5 Group 5.3 — read-only. Billing info, actual payment amounts, and
// invoice download are plainly labeled "not yet available" below rather
// than faked: no billing-address, payment-method, or invoice/transaction
// model exists anywhere in the schema yet (Chunk 20 owns real billing).
export default async function SubscriptionPage() {
  const { organizationId } = await requireActiveOrganization();
  const [current, history] = await Promise.all([
    getCurrentSubscription(organizationId),
    listSubscriptionHistory(organizationId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageBreadcrumb
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: "Subscription" }]}
      />
      <div>
        <h1 className="text-2xl font-semibold">Subscription</h1>
        <p className="text-sm text-muted-foreground">Your current plan and subscription history.</p>
      </div>

      {current ? (
        <div className="flex max-w-lg flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{current.subscriptionPlan.name}</h2>
            <Badge variant={current.status === "TRIALING" ? "info" : "success"}>{current.status}</Badge>
          </div>
          {current.status === "TRIALING" && current.trialEndsAt && (
            <p className="text-sm text-muted-foreground">
              Trial ends {current.trialEndsAt.toLocaleDateString()} ({daysUntil(current.trialEndsAt)} days left)
            </p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Monthly price</dt>
            <dd>{formatPrice(current.subscriptionPlan.priceMonthly, current.subscriptionPlan.currency)}</dd>
            <dt className="text-muted-foreground">Annual price</dt>
            <dd>{formatPrice(current.subscriptionPlan.priceAnnual, current.subscriptionPlan.currency)}</dd>
            <dt className="text-muted-foreground">Team members</dt>
            <dd>{formatLimit(current.subscriptionPlan.maxUsers)}</dd>
            <dt className="text-muted-foreground">Events</dt>
            <dd>{formatLimit(current.subscriptionPlan.maxEvents)}</dd>
            <dt className="text-muted-foreground">Orders</dt>
            <dd>{formatLimit(current.subscriptionPlan.maxOrders)}</dd>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No active subscription.</p>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">History</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.subscriptionPlan.name}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.startDate.toLocaleDateString()}</TableCell>
                <TableCell>{row.endDate ? row.endDate.toLocaleDateString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Not yet available</p>
        <p>Billing address, saved payment method, real payment amounts, and invoice download aren&apos;t modeled yet — a later chunk adds live billing.</p>
      </div>
    </div>
  );
}
