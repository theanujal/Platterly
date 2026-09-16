import { Wallet, Hourglass, Clock } from "lucide-react";
import { getPartialPaymentsOverview } from "@/modules/orders/order";
import { StatusOverviewCard } from "./status-overview-card";

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  PARTIALLY_PAID: "Partial",
  UNPAID: "Unpaid",
};

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

// New card (AJ, 2026-09-16) — same StatusOverviewCard shell as the redesigned
// Inventory Status card, covering Orders with money still owed. Deliberately
// scoped to PARTIALLY_PAID/UNPAID orders specifically (not every order with
// a balance regardless of status) — Needs Attention already covers the
// broader "balance due" signal; this card is about payment collection.
export async function PartialPaymentsCard({ organizationId }: { organizationId: string }) {
  const overview = await getPartialPaymentsOverview(organizationId);
  const totalValue = overview.totalDue + overview.totalCollected;

  return (
    <StatusOverviewCard
      tone="indigo"
      title="Partial Payments"
      icon={Wallet}
      primaryLabel="Balance Due"
      primaryValue={formatCurrency(overview.totalDue)}
      progressPercent={totalValue === 0 ? 0 : (overview.totalCollected / totalValue) * 100}
      redChip={{ icon: Hourglass, label: "Partially Paid", value: overview.partialCount }}
      orangeChip={{ icon: Clock, label: "Overdue", value: overview.overdueCount }}
      rows={overview.orders.slice(0, 2).map((order) => ({
        key: order.id,
        title: order.customerName,
        subtitle: `${order.orderNumber ?? "—"} · ${formatCurrency(order.balance)} due`,
        badgeLabel: PAYMENT_STATUS_BADGE[order.paymentStatus] ?? order.paymentStatus,
      }))}
      emptyMessage="No orders with a pending balance."
      footerHref="/orders"
      footerLabel="View orders"
    />
  );
}
