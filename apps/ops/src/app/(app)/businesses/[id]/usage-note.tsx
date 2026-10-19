import { formatWhen } from "@/components/ui";

/** Catering reports once per UTC day, so a report older than this (a day plus a little slack) means the daily job or the link is not running. */
export const USAGE_STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/**
 * The line under a product card: when it was last active and how fresh the usage counts are. The counts are totals that catering re-sends
 * within about a minute of a change (its scheduled job compares them with the last report) and at least once a day, so the line says
 * when they were taken, and turns to a warning when the last report is older than ~26 hours.
 */
export function UsageNote({ lastActiveAt, usageReportedAt, now, className }: { lastActiveAt: Date | null; usageReportedAt: Date | null; now: Date; className?: string }) {
  const stale = usageReportedAt !== null && now.getTime() - usageReportedAt.getTime() > USAGE_STALE_AFTER_MS;
  return (
    <div className={`text-xs text-muted-foreground ${className ?? ""}`}>
      <p>Last active {formatWhen(lastActiveAt)}</p>
      <p className={stale ? "font-medium text-warning" : undefined} data-testid="usage-note">
        {usageReportedAt
          ? stale
            ? `Usage not reported since ${formatWhen(usageReportedAt)}. Check that the catering daily job is running.`
            : `Totals as of ${formatWhen(usageReportedAt)}.`
          : "Usage has not been reported yet."}
        {!stale && " Refreshed within about a minute of any change, and at least once a day."}
      </p>
    </div>
  );
}
