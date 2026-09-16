"use client";

import { useMemo, useState } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "cn";

interface RevenueTrendPoint {
  date: string;
  totalValue: number;
  completedValue: number;
  pendingValue: number;
}

interface RevenueTrendChartProps {
  /** Dense, one row per day, oldest first — up to 365 days (see ../_data.ts). */
  data: RevenueTrendPoint[];
}

const RANGES = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(0)}`;
}

function formatDateLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Real order-value-per-day (see ../_data.ts) — booking activity, not a
// decorative sparkline. Total value stays the filled "hero" area; Completed
// and Pending are two thinner overlay lines so the split is visible without
// competing with the total for attention. 1M/3M/6M/1Y just slice the same
// pre-fetched year of data client-side — no extra request per range.
export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const [range, setRange] = useState<RangeKey>("1M");
  const days = RANGES.find((r) => r.key === range)!.days;
  const visible = useMemo(() => data.slice(-days), [data, days]);
  const hasData = visible.some((d) => d.totalValue > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Revenue trend</p>
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                range === r.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {!hasData ? (
        <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No order activity in this period yet.
        </div>
      ) : (
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visible} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                interval={Math.ceil(visible.length / 6)}
              />
              <YAxis hide domain={[0, (max: number) => (max === 0 ? 100 : max * 1.2)]} />
              <Tooltip
                formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name]}
                labelFormatter={(label) => formatDateLabel(String(label))}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
              <Area
                type="monotone"
                dataKey="totalValue"
                name="Order value"
                stroke="#2563EB"
                strokeWidth={2}
                fill="url(#revenueTrendFill)"
              />
              <Line type="monotone" dataKey="completedValue" name="Completed value" stroke="#16A34A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pendingValue" name="Pending value" stroke="#D97706" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
