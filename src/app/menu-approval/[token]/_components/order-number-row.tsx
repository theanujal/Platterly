import { CopyButton } from "@/components/ui/copy-button";

/** "Order No. ORD-0002" with a small copy button, the first row of the event cards. Nothing for an order created before numbering. */
export function OrderNumberRow({ orderNumber }: { orderNumber: string | null }) {
  if (!orderNumber) return null;
  return (
    <div className="flex items-center gap-2" data-testid="order-number">
      <span className="text-sm text-muted-foreground">Order No.</span>
      <span className="text-lg font-bold">{orderNumber}</span>
      <CopyButton value={orderNumber} label="Copy order number" iconOnly />
    </div>
  );
}
