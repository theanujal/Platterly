import type { ReportBlock } from "@platterly/contract";
import { Card } from "@/components/ui";
import { ChartBlock } from "./chart-block";

/** Shows a report document: tiles, bar lists, tables, text. Every value is plain text already formatted by whoever built the report, and React escapes it. */

const EMPTY = "Nothing in this period.";

function Tiles({ tiles }: { tiles: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex min-w-0 flex-col gap-1 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
          <small className="text-xs text-muted-foreground">{t.label}</small>
          <b className="text-xl font-bold tabular-nums">{t.value}</b>
          {t.hint ? <small className="text-xs text-muted-foreground">{t.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

export function ReportBlocks({ blocks }: { blocks: ReportBlock[] }) {
  return (
    <div className="flex flex-col gap-4" data-testid="report">
      {blocks.map((block, i) => {
        if (block.type === "tiles") return <Tiles key={i} tiles={block.tiles} />;
        if (block.type === "chart") {
          return (
            <Section key={i} title={block.title} description={block.description}>
              {block.labels.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{block.emptyText ?? EMPTY}</p> : <ChartBlock kind={block.kind} labels={block.labels} series={block.series} title={block.title} />}
            </Section>
          );
        }
        if (block.type === "text") {
          return (
            <Section key={i} title={block.title}>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">{block.lines.map((line, j) => <li key={j}>{line}</li>)}</ul>
            </Section>
          );
        }
        if (block.type === "bars") {
          const max = Math.max(...block.rows.map((r) => r.value), 1);
          return (
            <Section key={i} title={block.title} description={block.description}>
              {block.rows.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{block.emptyText ?? EMPTY}</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {block.rows.map((row, j) => (
                    <li key={j} className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.label}</span>
                        {row.sub ? <span className="block truncate text-xs text-muted-foreground">{row.sub}</span> : null}
                      </span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (Math.max(row.value, 0) / max) * 100)}%` }} />
                      </span>
                      <span className="text-right font-medium tabular-nums">{row.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          );
        }
        return (
          <Section key={i} title={block.title} description={block.description}>
            {block.rows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{block.emptyText ?? EMPTY}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {block.columns.map((c, j) => <th key={j} className={`py-2 font-bold ${j < block.columns.length - 1 ? "pr-4" : ""} ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((cells, r) => (
                      <tr key={r} className="border-t border-border">
                        {cells.map((cell, j) => <td key={j} className={`py-2 ${j < cells.length - 1 ? "pr-4" : ""} ${block.columns[j].align === "right" ? "text-right tabular-nums" : ""} ${j === 0 ? "font-medium" : ""}`}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        );
      })}
    </div>
  );
}
