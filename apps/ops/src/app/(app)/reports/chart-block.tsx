"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportSeries } from "@platterly/contract";

const COLOURS = ["#FF6900", "#7C3AED", "#0E7490", "#16A34A"];
const axis = { fontSize: 12, fill: "#6B7280" };
const compact = (n: number) => (n >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(1)}Cr` : n >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(0)}k` : `₹${n}`);
const full = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** A report's chart block: a line, area or bar chart of up to four series. Values were computed by whoever built the report. */
export function ChartBlock({ kind, labels, series, title }: { kind: "line" | "area" | "bar"; labels: string[]; series: ReportSeries[]; title: string }) {
  const data = labels.map((label, i) => ({ label, ...Object.fromEntries(series.map((s) => [s.name, s.values[i]])) }));
  const money = series.every((s) => s.format === "currency");
  const tick = money ? compact : undefined;
  const tooltip = { formatter: (v: unknown, name: unknown) => [money || series.find((s) => s.name === name)?.format === "currency" ? full(Number(v)) : Number(v).toLocaleString("en-IN"), String(name)] as [string, string], contentStyle: { borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13 } };
  const common = { data, margin: { top: 8, right: 12, bottom: 0, left: money ? 0 : -12 } };
  const grid = <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />;
  const xy = (<><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} /><YAxis allowDecimals={money} tickFormatter={tick} tick={axis} tickLine={false} axisLine={false} /><Tooltip {...tooltip} />{series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /> : null}</>);
  return (
    <div className="h-72 w-full" role="img" aria-label={title}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common}>{grid}{xy}{series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={COLOURS[i % COLOURS.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}</BarChart>
        ) : kind === "line" ? (
          <LineChart {...common}>{grid}{xy}{series.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLOURS[i % COLOURS.length]} strokeWidth={2} dot={{ r: 3 }} />)}</LineChart>
        ) : (
          <AreaChart {...common}>
            <defs>{series.map((s, i) => <linearGradient key={s.name} id={`rb-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLOURS[i % COLOURS.length]} stopOpacity={0.2} /><stop offset="100%" stopColor={COLOURS[i % COLOURS.length]} stopOpacity={0} /></linearGradient>)}</defs>
            {grid}{xy}{series.map((s, i) => <Area key={s.name} type="monotone" dataKey={s.name} stroke={COLOURS[i % COLOURS.length]} strokeWidth={2} fill={`url(#rb-${i})`} dot={{ r: 3 }} />)}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
