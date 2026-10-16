/** The order number, large under a customer page's title, so it is the first thing a customer can read out on a call. Nothing for an order created before numbering. */
export function OrderNumberBadge({ orderNumber }: { orderNumber: string | null }) {
  if (!orderNumber) return null;
  return (
    <p className="inline-flex items-baseline gap-2 self-center rounded-full bg-primary/10 px-4 py-1.5 text-primary" data-testid="order-number-badge">
      <span className="text-sm font-medium">Order No.</span>
      <span className="text-xl font-bold tracking-wide">{orderNumber}</span>
    </p>
  );
}
