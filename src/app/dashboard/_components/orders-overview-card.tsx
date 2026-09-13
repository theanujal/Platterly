import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const STATUSES = ["Total", "Pending", "Confirmed", "Processing", "Completed", "Cancelled"];

// Chunk 5 Group 5.5 — placeholder shell; Chunk 10 wires real order counts.
export function OrdersOverviewCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders Overview</CardTitle>
      </CardHeader>
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
