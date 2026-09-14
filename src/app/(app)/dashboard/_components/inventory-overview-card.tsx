import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardCardHeader } from "./dashboard-card-header";

const STATS = ["Total Items", "In Stock", "Low Stock", "Out of Stock", "Categories", "Total Value"];

// Chunk 5 Group 5.5 — placeholder shell; Chunk 13 wires real inventory data.
export function InventoryOverviewCard() {
  return (
    <Card>
      <DashboardCardHeader icon={Package} title="Inventory Overview" colorClassName="bg-violet-500/10 text-violet-600" />
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
