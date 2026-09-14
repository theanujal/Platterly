import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardCardHeader } from "./dashboard-card-header";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Chunk 5 Group 5.5 — a genuinely static layout placeholder (today's date
// highlighted, no events plotted). Chunk 13 owns the real Orders Calendar.
export function OrdersCalendarWidget() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <Card>
      <DashboardCardHeader
        icon={CalendarDays}
        title={now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        colorClassName="bg-amber-500/10 text-amber-600"
      />
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i} className="text-muted-foreground">
              {label}
            </span>
          ))}
          {cells.map((day, i) => (
            <span
              key={i}
              className={
                day === now.getDate()
                  ? "rounded-full bg-primary py-1 text-primary-foreground"
                  : "py-1 text-muted-foreground"
              }
            >
              {day ?? ""}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
