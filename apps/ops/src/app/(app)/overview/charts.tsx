"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const ORANGE = "#FF6900";
const VIOLET = "#7C3AED";
const axis = { fontSize: 12, fill: "#6B7280" };

const inr = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(0)}k` : `₹${n}`);

export function GrowthChart({ data }: { data: { label: string; total: number; paying: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Businesses over time: total and paying">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="g-total" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity={0.18} /><stop offset="100%" stopColor={ORANGE} stopOpacity={0} /></linearGradient>
            <linearGradient id="g-paying" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={VIOLET} stopOpacity={0.18} /><stop offset="100%" stopColor={VIOLET} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13 }} />
          <Area type="monotone" dataKey="total" name="Total" stroke={ORANGE} strokeWidth={2} fill="url(#g-total)" dot={{ r: 3 }} />
          <Area type="monotone" dataKey="paying" name="Paying" stroke={VIOLET} strokeWidth={2} fill="url(#g-paying)" dot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MrrChart({ data }: { data: { label: string; mrr: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Monthly recurring revenue over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="g-mrr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity={0.2} /><stop offset="100%" stopColor={ORANGE} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={inr} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "MRR"]} contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13 }} />
          <Area type="monotone" dataKey="mrr" name="MRR" stroke={ORANGE} strokeWidth={2} fill="url(#g-mrr)" dot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
