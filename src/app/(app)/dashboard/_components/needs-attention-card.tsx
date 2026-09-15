import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface NeedsAttentionCardProps {
  draftOrders: number;
  outstandingOrdersCount: number;
  outstandingBalance: number;
  quotationsAwaitingResponse: number;
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

// Surfaces exactly what needs a decision today, each one a direct link to
// where that action happens — the "Actionability" principle from the
// redesign brief: no digging through the sidebar to act on something
// already visible here.
export function NeedsAttentionCard({
  draftOrders,
  outstandingOrdersCount,
  outstandingBalance,
  quotationsAwaitingResponse,
}: NeedsAttentionCardProps) {
  const items = [
    draftOrders > 0 && {
      href: "/orders?status=DRAFT",
      label: `${draftOrders} draft order${draftOrders === 1 ? "" : "s"} awaiting confirmation`,
    },
    outstandingOrdersCount > 0 && {
      href: "/orders",
      label: `${outstandingOrdersCount} order${outstandingOrdersCount === 1 ? "" : "s"} with ${formatCurrency(outstandingBalance)} balance due`,
    },
    quotationsAwaitingResponse > 0 && {
      href: "/quotations?status=SENT",
      label: `${quotationsAwaitingResponse} quotation${quotationsAwaitingResponse === 1 ? "" : "s"} awaiting customer response`,
    },
  ].filter((item): item is { href: string; label: string } => Boolean(item));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <AlertCircle className="size-4" />
          </div>
          <CardTitle>Needs Attention</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center gap-2.5 py-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            You&apos;re all caught up.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className="flex items-center justify-between gap-2 py-2.5 text-sm text-foreground/90 transition-colors first:pt-0 last:pb-0 hover:text-foreground"
              >
                <span>{item.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
