import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Chunk 5 Group 5.5 — placeholder shell; Chunk 10 wires real upcoming orders.
export function UpcomingOrdersCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Orders</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">No upcoming orders yet.</p>
      </CardContent>
    </Card>
  );
}
