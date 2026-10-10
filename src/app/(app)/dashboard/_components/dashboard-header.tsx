import { CalendarDays } from "lucide-react";
import { NewOrderMenu } from "./new-order-menu";

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Greeting on the left; the New Order split button and today's date on the right. */
export function DashboardHeader({
  name,
  businessName,
  allowed,
}: {
  name: string;
  businessName: string;
  allowed: { order: boolean; quotation: boolean; lead: boolean; catalog: boolean };
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()}, {name} <span aria-hidden>👋</span>
        </h1>
        <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening with {businessName} today.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <NewOrderMenu allowed={allowed} />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          <CalendarDays className="size-4" />
        </p>
      </div>
    </div>
  );
}
