"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface RevenueTrendChartProps {
  data: { date: string; value: number }[];
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(0)}`;
}

function formatDateLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Real order-value-per-day over the last 30 days (see ../_data.ts) —
// booking activity, not a decorative sparkline. Empty state instead of a
// flat zero line when the tenant has no orders yet.
export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const hasData = data.some((d) => d.value > 0);

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No order activity in the last 30 days yet.
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EA580C" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#EA580C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval={Math.ceil(data.length / 6)}
          />
          <YAxis hide domain={[0, (max: number) => (max === 0 ? 100 : max * 1.2)]} />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value ?? 0)), "Order value"]}
            labelFormatter={(label) => formatDateLabel(String(label))}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
          />
          <Area type="monotone" dataKey="value" stroke="#EA580C" strokeWidth={2} fill="url(#revenueTrendFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
