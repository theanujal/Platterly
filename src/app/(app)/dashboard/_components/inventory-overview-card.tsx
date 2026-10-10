import Link from "next/link";
import { CircleX, Hourglass, Package, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

interface InventoryOverviewCardProps {
  lowStock: number;
  expiringSoon: number;
  expired: number;
  keyItems: { id: string; name: string; stock: number; unit: string }[];
}

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg p-3", tone)}>
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  );
}

/** Inventory Status: how many items are low, about to expire, or expired, and the ones to look at first. */
export function InventoryOverviewCard({ lowStock, expiringSoon, expired, keyItems }: InventoryOverviewCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <Package className="size-4" />
          </div>
          <CardTitle className="text-lg">Inventory Status</CardTitle>
        </div>
        <CardAction>
          <Link href="/inventory" className="text-xs font-medium text-primary hover:underline">View all →</Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={TriangleAlert} label="Low Stock" value={lowStock} tone="bg-destructive/10 text-destructive" />
          <Stat icon={Hourglass} label="Expiring Soon" value={expiringSoon} tone="bg-warning/10 text-warning" />
          <Stat icon={CircleX} label="Expired" value={expired} tone="bg-muted text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Key Items</h3>
          {keyItems.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No items are low on stock.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {keyItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.stock} {item.unit} left</span>
                  <Badge variant="danger" className="px-2 py-0.5">Low</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
