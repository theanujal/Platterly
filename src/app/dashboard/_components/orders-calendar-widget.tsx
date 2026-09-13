import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
      <CardHeader>
        <CardTitle>{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</CardTitle>
      </CardHeader>
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
