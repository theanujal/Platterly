import { CircleHelp, ReceiptText } from "lucide-react";
import { FormCard } from "@/components/public/form-section";
import type { ApprovalPriceRow } from "@/modules/menu-approvals/approval-view";

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The Price Summary card: the rows that make up the total (when the version has them) and the Estimated Total. */
export function PriceSummary({ rows, total, isCustomMenu }: { rows: ApprovalPriceRow[]; total: number; isCustomMenu: boolean }) {
  return (
    <FormCard className="gap-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ReceiptText className="size-5" />
        </span>
        <h2 className="text-[15px] font-semibold">Price Summary</h2>
      </div>

      {rows.length > 0 && (
        <dl className="flex flex-col gap-2.5 text-sm" data-testid="price-rows">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">
                {row.label}
                {row.detail && <span className="block text-xs">{row.detail}</span>}
              </dt>
              <dd className="font-medium tabular-nums">{inr(row.amount)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-accent-foreground">
          {isCustomMenu ? "Total so far" : "Estimated Total"}
          <CircleHelp className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <span className="text-xl font-bold text-primary tabular-nums" data-testid="approval-total">
          {inr(total)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {isCustomMenu ? "Your custom menu is priced per plate by our team. " : ""}Final pricing is confirmed by the kitchen after reviewing your menu and event requirements.
      </p>
    </FormCard>
  );
}
