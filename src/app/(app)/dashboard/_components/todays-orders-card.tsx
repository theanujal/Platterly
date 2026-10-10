"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventDates } from "@/modules/orders/order-card";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/modules/orders/order-status";
import type { OrderStatus } from "@/generated/prisma/enums";
import { cn } from "cn";

export interface TodaysOrderRow {
  id: string;
  orderNumber: string | null;
  customerName: string;
  eventTypeName: string | null;
  eventStartDate: string;
  eventEndDate: string;
  guests: number | null;
  status: OrderStatus;
}

type TabKey = "today" | "upcoming" | "all";
const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
];

/** Today's Orders, kept small: who, what and how many, with the status. Each row opens the order. */
export function TodaysOrdersCard({ tabs }: { tabs: Record<TabKey, { count: number; rows: TodaysOrderRow[] }> }) {
  const [tab, setTab] = useState<TabKey>("today");
  const { rows } = tabs[tab];

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingCart className="size-4" />
            </div>
            <CardTitle className="text-lg">Today&apos;s Orders</CardTitle>
          </div>
          <Link href="/orders" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div role="tablist" aria-label="Orders" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                tab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("rounded-full px-1.5", tab === t.key ? "bg-primary/15" : "bg-muted")}>{tabs[t.key].count}</span>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {tab === "today" ? "No orders for today." : tab === "upcoming" ? "No upcoming orders." : "No orders yet."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} data-testid="dashboard-order-row">
                <Link href={`/orders/${row.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{row.customerName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.eventTypeName ?? "Event"}
                      {row.guests ? ` · ${row.guests} guests` : ""}
                      {tab !== "today" ? ` · ${formatEventDates(new Date(row.eventStartDate), new Date(row.eventEndDate))}` : ""}
                    </span>
                  </span>
                  <Badge variant={ORDER_STATUS_TONE[row.status]} className="px-2 py-0.5 text-[11px]">
                    {ORDER_STATUS_LABEL[row.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
