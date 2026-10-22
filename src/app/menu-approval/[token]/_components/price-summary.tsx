import { CircleCheck, ReceiptText } from "lucide-react";
import { FormCard } from "@/components/public/form-section";
import type { ApprovalPriceRow } from "@/modules/menu-approvals/approval-view";
import { cn } from "cn";
import { inr } from "@/modules/invoices/invoice-format";

/**
 * The Price Summary card: every line that makes up the total, as the team's Pricing Details card lists them, and the Grand Total.
 * The menu has been checked by the team before it reaches the customer, so this is the final amount, not an estimate (AJ, 2026-10-16).
 * `children` is the slot under the total (the Approve / Request Changes actions on the review screen).
 */
export function PriceSummary({ rows, total, children, className, footnote }: { rows: ApprovalPriceRow[]; total: number; children?: React.ReactNode; className?: string; /** Replaces the "final amount" note; `null` hides it. */ footnote?: React.ReactNode | null }) {
  return (
    <FormCard className={cn("gap-4 md:p-5", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ReceiptText className="size-5" />
        </span>
        <h2 className="text-[15px] font-semibold">Price Summary</h2>
      </div>

      {rows.length > 0 && (
        <dl className="flex flex-col text-sm" data-testid="price-rows">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 border-b border-border py-2.5 first:pt-0 last:border-b-0">
              <dt className="min-w-0">
                {row.label}
                {row.detail && <span className="block text-xs text-muted-foreground">{row.detail}</span>}
              </dt>
              <dd className={cn("shrink-0 font-medium tabular-nums", row.negative && "text-success")}>
                {row.negative ? "−" : ""}
                {inr(row.amount)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3">
        <span className="text-sm font-semibold text-accent-foreground">Grand Total</span>
        <span className="text-xl font-bold text-primary tabular-nums" data-testid="approval-total">
          {inr(total)}
        </span>
      </div>
      {footnote === undefined ? (
        <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-muted-foreground">This is your final amount. Our team has reviewed your menu and event requirements.</p>
        </div>
      ) : (
        footnote
      )}
      {children}
    </FormCard>
  );
}
