import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Guests to cook for today, by meal. The bar is each meal's share of the day. */
export function KitchenWorkloadCard({ rows, total }: { rows: { meal: string; guests: number }[]; total: number }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UtensilsCrossed className="size-4" />
          </div>
          <CardTitle className="text-lg">Kitchen Workload (Today)</CardTitle>
        </div>
        <CardAction>
          <span className="text-sm font-semibold">{total.toLocaleString("en-IN")} Guests</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
            <p className="text-sm font-medium">Nothing to cook today</p>
            <Link href="/kitchen-dashboard" className="text-xs font-medium text-primary hover:underline">Open Kitchen Dashboard</Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => {
              const percent = total === 0 ? 0 : Math.round((row.guests / total) * 100);
              return (
                <li key={row.meal} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="font-medium">{row.meal}</span>
                  <span className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{row.guests} guests</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${row.meal} share of today`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </span>
                  </span>
                  <span className="w-10 text-right text-xs text-muted-foreground">{percent}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
