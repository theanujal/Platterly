import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardCardHeader } from "./dashboard-card-header";

// Chunk 5 Group 5.5 — placeholder shell; Chunk 10 wires real upcoming orders.
export function UpcomingOrdersCard() {
  return (
    <Card>
      <DashboardCardHeader icon={Clock} title="Upcoming Orders" colorClassName="bg-blue-500/10 text-blue-600" />
      <CardContent>
        <p className="text-sm text-muted-foreground">No upcoming orders yet.</p>
      </CardContent>
    </Card>
  );
}
