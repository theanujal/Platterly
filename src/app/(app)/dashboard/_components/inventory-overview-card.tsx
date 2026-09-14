import Link from "next/link";
import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DashboardCardHeader } from "./dashboard-card-header";
import { getInventoryOverviewStats } from "@/modules/inventory/inventory";

// Chunk 5 Group 5.5 placeholder shell, wired to real data in Chunk 7
// (Inventory, Basic) — the low-stock count doubles as the "low-stock flag"
// the chunk plan calls for.
export async function InventoryOverviewCard({ organizationId }: { organizationId: string }) {
  const stats = await getInventoryOverviewStats(organizationId);
  const items: { label: string; value: string }[] = [
    { label: "Total Items", value: String(stats.totalItems) },
    { label: "In Stock", value: String(stats.inStock) },
    { label: "Low Stock", value: String(stats.lowStock) },
    { label: "Out of Stock", value: String(stats.outOfStock) },
    { label: "Categories", value: String(stats.categories) },
    { label: "Total Value", value: `₹${stats.totalValue.toFixed(2)}` },
  ];

  return (
    <Card>
      <DashboardCardHeader icon={Package} title="Inventory Overview" colorClassName="bg-violet-500/10 text-violet-600" />
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <span className={item.label === "Low Stock" && stats.lowStock > 0 ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>
                {item.value}
              </span>
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" render={<Link href="/inventory" />} nativeButton={false} className="self-start">
          Manage inventory
        </Button>
      </CardContent>
    </Card>
  );
}
