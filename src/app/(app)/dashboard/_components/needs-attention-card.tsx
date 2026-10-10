import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, MessageSquareText, ShieldCheck, type LucideIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmountExact } from "@/modules/orders/order-card";

interface NeedsAttentionCardProps {
  overdue: { count: number; amount: number; top: { customerName: string; orderNumber: string | null; balance: number } | null };
  pendingReviewOrders: number;
  awaitingApprovalOrders: number;
  quotationsAwaitingResponse: number;
  showMoney: boolean;
  showOrders: boolean;
  showQuotations: boolean;
}

interface Item {
  href: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  detail?: string;
}

/** What needs a decision today, each one a direct link to where it is dealt with. */
export function NeedsAttentionCard({ overdue, pendingReviewOrders, awaitingApprovalOrders, quotationsAwaitingResponse, showMoney, showOrders, showQuotations }: NeedsAttentionCardProps) {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const items: Item[] = [
    showMoney &&
      overdue.count > 0 && {
        href: "/orders",
        icon: CalendarClock,
        tone: "bg-destructive/10 text-destructive",
        title: `${plural(overdue.count, "payment")} overdue`,
        detail: overdue.top
          ? `${formatAmountExact(overdue.amount)} balance due · ${overdue.top.customerName}${overdue.top.orderNumber ? ` (${overdue.top.orderNumber})` : ""}${overdue.count > 1 ? ` and ${overdue.count - 1} more` : ""}`
          : `${formatAmountExact(overdue.amount)} balance due`,
      },
    showOrders &&
      pendingReviewOrders > 0 && {
        href: "/orders?status=PENDING_REVIEW",
        icon: ClipboardCheck,
        tone: "bg-primary/10 text-primary",
        title: `${plural(pendingReviewOrders, "order")} awaiting confirmation`,
      },
    showQuotations &&
      quotationsAwaitingResponse > 0 && {
        href: "/quotations?status=SENT",
        icon: MessageSquareText,
        tone: "bg-info/10 text-info",
        title: `${plural(quotationsAwaitingResponse, "quotation")} awaiting customer response`,
      },
    showOrders &&
      awaitingApprovalOrders > 0 && {
        href: "/orders?status=AWAITING_CUSTOMER_APPROVAL",
        icon: ShieldCheck,
        tone: "bg-warning/10 text-warning",
        title: `${plural(awaitingApprovalOrders, "menu approval")} pending`,
        detail: "Waiting for the customer to approve the menu",
      },
  ].filter((item): item is Item => Boolean(item));

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CircleAlert className="size-4" />
          </div>
          <CardTitle className="text-lg">Needs Attention</CardTitle>
        </div>
        <CardAction>
          <Link href="/orders" className="text-xs font-medium text-primary hover:underline">View all →</Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center gap-2.5 py-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" />
            You&apos;re all caught up.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <Link key={item.href + item.title} href={item.href} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.tone}`}>
                  <item.icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.detail && <span className="truncate text-xs text-muted-foreground">{item.detail}</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
