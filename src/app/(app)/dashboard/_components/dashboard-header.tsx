import { NewOrderMenu } from "./new-order-menu";
import { DashboardRangePicker } from "./dashboard-range-picker";
import type { DateRange } from "@/lib/time/date-range";

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Greeting on the left; the date range picker and the New Order split button on the right. */
export function DashboardHeader({
  name,
  businessName,
  allowed,
  range,
  todayIso,
}: {
  name: string;
  businessName: string;
  range: DateRange;
  todayIso: string;
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
        <DashboardRangePicker range={range} todayIso={todayIso} />
        <NewOrderMenu allowed={allowed} />
      </div>
    </div>
  );
}
