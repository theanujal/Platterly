import Link from "next/link";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevenueTrendChart } from "./revenue-trend-chart";

interface RevenueTrendPoint {
  date: string;
  totalValue: number;
  completedValue: number;
  pendingValue: number;
}

interface OrdersActivityCardProps {
  revenueTrend: RevenueTrendPoint[];
  totalOrders: number;
}

// The dashboard's dominant module — a real revenue trend (order value per
// day). AJ, 2026-09-26: the recent-orders list under the graph was removed;
// the full list lives on /orders ("View all"). Status breakdown lives in the
// KPI grid above this card, so it isn't repeated here.
export function OrdersActivityCard({ revenueTrend, totalOrders }: OrdersActivityCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-4" />
          </div>
          <CardTitle>Orders</CardTitle>
        </div>
        <CardAction>
          <Link href="/orders" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            View all
            <ArrowRight className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {totalOrders === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShoppingCart className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">No orders yet</p>
              <p className="text-xs text-muted-foreground">Orders you create will show up here.</p>
            </div>
            <Button size="md" render={<Link href="/orders/new" />} nativeButton={false}>
              Create an order
            </Button>
          </div>
        ) : (
          <RevenueTrendChart data={revenueTrend} />
        )}
      </CardContent>
    </Card>
  );
}
