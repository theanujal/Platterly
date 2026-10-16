"use client";

import { Wallet } from "lucide-react";
import { SummaryCard } from "@/app/(app)/orders/_components/order-form-parts";
import { formatCurrency } from "./approval-format";

/** "Pricing Summary": the live totals of the planner draft (computed by the one pricing rule) and the change since the last version sent. */
export function ApprovalPricingCard({
  menuAmount,
  extrasAmount,
  childrenCharge,
  chargesAndDiscount,
  total,
  sinceLastSent,
  lastSentTotal,
  dirty,
}: {
  menuAmount: number;
  extrasAmount: number;
  childrenCharge: number;
  chargesAndDiscount: number;
  total: number;
  /** Total minus the last version sent, or null before the first send. */
  sinceLastSent: number | null;
  lastSentTotal: number | null;
  /** The planner has edits that are not saved yet. */
  dirty: boolean;
}) {
  return (
    <SummaryCard icon={Wallet} title="Pricing Summary">
      <div className="flex flex-col gap-2.5 text-sm">
        {[
          { label: "Menu Amount", amount: menuAmount },
          { label: "Extras & Add-ons", amount: extrasAmount },
          { label: "Children Charges", amount: childrenCharge },
          { label: "Charges & Discount", amount: chargesAndDiscount },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium">{formatCurrency(row.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-foreground">
        <span>Grand Total</span>
        <span className="text-lg">{formatCurrency(total)}</span>
      </div>
      {sinceLastSent !== null && (
        <p className="text-xs text-muted-foreground">
          {sinceLastSent === 0
            ? "Same as the last version sent."
            : `${sinceLastSent > 0 ? "+" : "−"}${formatCurrency(Math.abs(sinceLastSent))} since the last version sent (${formatCurrency(lastSentTotal ?? 0)}).`}
        </p>
      )}
      {dirty && <p className="text-xs text-warning">Unsaved changes. Save to update the order.</p>}
    </SummaryCard>
  );
}
