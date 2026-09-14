import { ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardCardHeader } from "./dashboard-card-header";

const STATUSES = ["Total", "Pending", "Confirmed", "Processing", "Completed", "Cancelled"];

// Chunk 5 Group 5.5 — placeholder shell; Chunk 10 wires real order counts.
export function OrdersOverviewCard() {
  return (
    <Card>
      <DashboardCardHeader icon={ShoppingBag} title="Orders Overview" colorClassName="bg-primary/10 text-primary" />
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {STATUSES.map((status) => (
            <div key={status} className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold text-muted-foreground">0</span>
              <span className="text-xs text-muted-foreground">{status}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
