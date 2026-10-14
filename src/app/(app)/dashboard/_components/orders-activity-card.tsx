"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

export interface ActivityPoint {
  date: string;
  orders: number;
  revenue: number;
  guests: number;
}

const METRICS = [
  { key: "orders", label: "Orders" },
  { key: "revenue", label: "Revenue" },
] as const; // Guests was dropped from the chart (AJ, 2026-10-14); the Total Guests tile and the guest data stay.
const compactRupees = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

function dayLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Segmented<T extends string>({ items, value, onChange, label }: { items: { key: T; label: string }[]; value: T; onChange: (key: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={value === item.key}
          onClick={() => onChange(item.key)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === item.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Order Activity: orders or revenue per day (by the day the order was placed), over 7 days to a year. */
export function OrdersActivityCard({ activity, showMoney, rangeLabel }: { activity: ActivityPoint[]; showMoney: boolean; rangeLabel: string }) {
  const metrics = showMoney ? METRICS : METRICS.filter((m) => m.key !== "revenue");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("orders");
  // The range comes from the Dashboard's date picker (the old 7D / 30D / 3M / 1Y buttons are gone): `activity` is already that period.
  const visible = activity;
  const hasData = visible.some((p) => p[metric] > 0);
  const format = (value: number) => (metric === "revenue" ? `₹${compactRupees.format(value)}` : String(value));

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="size-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg">Order Activity</CardTitle>
            <p className="text-xs text-muted-foreground" data-testid="activity-range">By order date · {rangeLabel}</p>
          </div>
        </div>
        <CardAction className="flex flex-wrap items-center justify-end gap-2 max-sm:col-start-1 max-sm:row-start-2 max-sm:row-span-1 max-sm:mt-2 max-sm:justify-self-start">
          <Segmented items={metrics as unknown as { key: (typeof METRICS)[number]["key"]; label: string }[]} value={metric} onChange={setMetric} label="Metric" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
        {!hasData ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground xl:h-full">
            No {metric} in this date range.
          </div>
        ) : (
          <div className="h-48 w-full xl:h-full xl:min-h-48" data-testid="activity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visible} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6900" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#FF6900" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={Math.max(0, Math.ceil(visible.length / 7) - 1)} />
                <YAxis width={44} allowDecimals={false} tickFormatter={format} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} domain={[0, "auto"]} />
                <Tooltip
                  formatter={(value) => [format(Number(value ?? 0)), METRICS.find((m) => m.key === metric)?.label ?? ""]}
                  labelFormatter={(label) => dayLabel(String(label))}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Area type="monotone" dataKey={metric} stroke="#FF6900" strokeWidth={2} fill="url(#activityFill)" dot={visible.length <= 31 ? { r: 3, fill: "#FF6900", strokeWidth: 0 } : false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
