import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const STATS = ["Revenue", "Total Orders", "Avg. Order Value", "Collected", "Pending", "Partially Paid"];

// Chunk 5 Group 5.5 — placeholder shell; Chunk 14 wires real payment data.
export function PaymentsOverviewCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {STATS.map((stat) => (
            <div key={stat} className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold text-muted-foreground">—</span>
              <span className="text-xs text-muted-foreground">{stat}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
