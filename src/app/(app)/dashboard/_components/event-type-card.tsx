"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Orange first (the brand), then the status hues the design system already uses; grey is always "Other".
const COLORS = ["#FF6900", "#16A34A", "#2563EB", "#7C3AED"];
const OTHER = "#9CA3AF";

export function EventTypeCard({ rows, total }: { rows: { name: string; count: number }[]; total: number }) {
  const color = (row: { name: string }, index: number) => (row.name === "Other" ? OTHER : COLORS[index % COLORS.length]);
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
            <FileText className="size-4" />
          </div>
          <CardTitle className="text-lg">Event Type Distribution</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">No events yet.</div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-5 sm:flex-nowrap">
            <div className="relative size-36 shrink-0" data-testid="event-type-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} dataKey="count" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={1} stroke="none">
                    {rows.map((row, index) => (
                      <Cell key={row.name} fill={color(row, index)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} event${Number(value) === 1 ? "" : "s"}`, name]} contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold">{total}</span>
                <span className="text-xs text-muted-foreground">Events</span>
              </div>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-2.5 text-sm">
              {rows.map((row, index) => (
                <li key={row.name} className="flex items-center gap-2.5">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color(row, index) }} />
                  <span className="flex-1">{row.name}</span>
                  <span className="text-muted-foreground">{Math.round((row.count / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
