import { cn } from "cn";

/**
 * One "Label: value" line of an event summary, the same on Build Your Menu's Your Selection panel and the Review step
 * (AJ, 2026-10-14): muted label with a colon, bold value on the right. Put a `<SummarySeparator />` around the Total Guests row.
 */
export function SummaryRow({ label, value, testId, className }: { label: string; value: string; testId?: string; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)} data-testid={testId}>
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

export function SummarySeparator() {
  return <div role="separator" className="border-t border-border" />;
}
