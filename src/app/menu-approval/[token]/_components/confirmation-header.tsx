import { CircleCheck } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";

/**
 * The top of the Confirmation page (AJ, 2026-10-17): the order number large and in the brand colour with a copy button, one line
 * about the event, and the "Menu approved" status on the right. Older orders without a number read "Your order".
 */
export function ConfirmationHeader({ orderNumber, summary, availableUntil }: { orderNumber: string | null; summary: string; availableUntil: string | null }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-foreground md:text-4xl" data-testid="order-number-badge">
          {orderNumber ? (
            <>
              <span>Order</span>
              <span className="text-primary">{orderNumber}</span>
              <CopyButton value={orderNumber} label="Copy order number" iconOnly />
            </>
          ) : (
            "Your order"
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        {availableUntil && <p className="mt-1 text-xs text-muted-foreground">Keep this page: it works until {availableUntil}.</p>}
      </div>
      <div role="status" className="flex shrink-0 items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 md:max-w-sm" data-testid="venue-confirmation">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="text-sm">
          <h2 className="text-base font-semibold">Thank You!</h2>
          <p className="text-muted-foreground">Your menu is approved. It is final and our kitchen is getting ready.</p>
        </div>
      </div>
    </div>
  );
}
