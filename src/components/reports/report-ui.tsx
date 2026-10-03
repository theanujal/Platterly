import Link from "next/link";
import { cn } from "cn";

/** Chunk 17.1 — the few building blocks the Reports pages share (kitchen view and Super Admin view). */

export function ReportTile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10" data-testid={testId}>
      <small className="text-xs text-muted-foreground">{label}</small>
      <b className="text-xl font-bold tabular-nums">{value}</b>
      {hint && <small className="text-xs text-muted-foreground">{hint}</small>}
    </div>
  );
}

export function ReportSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export interface BarRow {
  label: string;
  value: number;
  /** The figure to show at the right. */
  text: string;
  /** A smaller line under the label. */
  sub?: string;
}

/** Horizontal bars, drawn with plain CSS: the longest bar is the biggest value. No chart library. */
export function BarList({ rows, emptyText = "Nothing in this period." }: { rows: BarRow[]; emptyText?: string }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-2.5" data-testid="bar-list">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium">{row.label}</span>
            {row.sub && <span className="block truncate text-xs text-muted-foreground">{row.sub}</span>}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

export interface ReportTab {
  id: string;
  label: string;
}

/** Sales / Events tabs as real links (`?tab=`), so a tab and its date range can be shared. */
export function ReportTabs({ tabs, active, basePath, keep }: { tabs: ReportTab[]; active: string; basePath: string; keep: Record<string, string> }) {
  return (
    <div role="tablist" aria-label="Reports" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(({ id, label }) => {
        const params = new URLSearchParams({ ...keep, tab: id });
        return (
          <Link
            key={id}
            role="tab"
            aria-selected={active === id}
            href={`${basePath}?${params}`}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
