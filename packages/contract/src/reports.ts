import { fail, isRecord, ok, type ParseResult } from "./result";

/**
 * A report a product publishes for the platform team (GET {product}/api/ops/reports/{key}?from=YYYY-MM-DD&to=YYYY-MM-DD,
 * signed like every ops read). It is a display-ready document, not raw data: the product has already formatted every number
 * (currency, dates, percentages), so ops can show any product's reports without knowing what an order or a recipe is.
 * Product-wide figures only, never one customer's details (docs/ops-contract.md section 3).
 */
export const REPORT_LIMITS = { blocks: 40, tiles: 24, rows: 500, columns: 12, text: 500 } as const;

export interface ReportTile {
  label: string;
  value: string;
  hint?: string;
}
export interface ReportBarRow {
  label: string;
  /** Only used to size the bar; the text is what is shown. */
  value: number;
  text: string;
  sub?: string;
}
export interface ReportColumn {
  label: string;
  align?: "left" | "right";
}

export type ReportBlock =
  | { type: "tiles"; tiles: ReportTile[] }
  | { type: "bars"; title: string; description?: string; rows: ReportBarRow[]; emptyText?: string }
  | { type: "table"; title: string; description?: string; columns: ReportColumn[]; rows: string[][]; emptyText?: string }
  | { type: "text"; title: string; lines: string[] };

export interface ReportDoc {
  report: string;
  title: string;
  /** The period the figures cover, as the product understood the request. */
  period: { from: string | null; to: string | null };
  blocks: ReportBlock[];
}

/** One report a product offers, as listed in its manifest. */
export interface ReportListing {
  key: string;
  label: string;
}

const short = (value: unknown, max: number = REPORT_LIMITS.text): string | null => (typeof value === "string" && value.length <= max ? value : null);
const optional = (value: unknown): string | undefined | null => (value === undefined ? undefined : short(value));

/**
 * Checks a report document received from a product before ops shows it. Unknown fields are dropped, sizes are capped, and
 * every value must be plain text or a number, so a product can never make ops render markup or an unbounded page.
 */
export function parseReportDoc(input: unknown): ParseResult<ReportDoc> {
  if (!isRecord(input)) return fail("report must be an object");
  const report = short(input.report, 64);
  const title = short(input.title, 200);
  if (!report || !title) return fail("report needs a key and a title");
  const period = isRecord(input.period) ? input.period : {};
  const from = period.from === null || period.from === undefined ? null : short(period.from, 10);
  const to = period.to === null || period.to === undefined ? null : short(period.to, 10);
  if (period.from !== undefined && period.from !== null && from === null) return fail("period.from is invalid");
  if (period.to !== undefined && period.to !== null && to === null) return fail("period.to is invalid");
  if (!Array.isArray(input.blocks) || input.blocks.length > REPORT_LIMITS.blocks) return fail(`report needs 0 to ${REPORT_LIMITS.blocks} blocks`);

  const blocks: ReportBlock[] = [];
  for (const [i, raw] of input.blocks.entries()) {
    const where = `block ${i + 1}`;
    if (!isRecord(raw)) return fail(`${where} must be an object`);
    switch (raw.type) {
      case "tiles": {
        if (!Array.isArray(raw.tiles) || raw.tiles.length > REPORT_LIMITS.tiles) return fail(`${where}: too many tiles`);
        const tiles: ReportTile[] = [];
        for (const t of raw.tiles) {
          const label = isRecord(t) ? short(t.label, 120) : null;
          const value = isRecord(t) ? short(t.value, 60) : null;
          const hint = isRecord(t) ? optional(t.hint) : null;
          if (!label || value === null || hint === null) return fail(`${where}: a tile needs a label and a value`);
          tiles.push({ label, value, ...(hint ? { hint } : {}) });
        }
        blocks.push({ type: "tiles", tiles });
        break;
      }
      case "bars": {
        const title = short(raw.title, 200);
        const description = optional(raw.description);
        const emptyText = optional(raw.emptyText);
        if (!title || description === null || emptyText === null) return fail(`${where}: a bar list needs a title`);
        if (!Array.isArray(raw.rows) || raw.rows.length > REPORT_LIMITS.rows) return fail(`${where}: too many rows`);
        const rows: ReportBarRow[] = [];
        for (const r of raw.rows) {
          const label = isRecord(r) ? short(r.label, 200) : null;
          const text = isRecord(r) ? short(r.text, 120) : null;
          const sub = isRecord(r) ? optional(r.sub) : null;
          if (!label || text === null || sub === null || !isRecord(r) || typeof r.value !== "number" || !Number.isFinite(r.value)) return fail(`${where}: a row needs a label, a number and a text`);
          rows.push({ label, value: r.value, text, ...(sub ? { sub } : {}) });
        }
        blocks.push({ type: "bars", title, ...(description ? { description } : {}), rows, ...(emptyText ? { emptyText } : {}) });
        break;
      }
      case "table": {
        const title = short(raw.title, 200);
        const description = optional(raw.description);
        const emptyText = optional(raw.emptyText);
        if (!title || description === null || emptyText === null) return fail(`${where}: a table needs a title`);
        if (!Array.isArray(raw.columns) || raw.columns.length === 0 || raw.columns.length > REPORT_LIMITS.columns) return fail(`${where}: a table needs 1 to ${REPORT_LIMITS.columns} columns`);
        const columns: ReportColumn[] = [];
        for (const c of raw.columns) {
          const label = isRecord(c) ? short(c.label, 120) : null;
          if (!label || !isRecord(c) || (c.align !== undefined && c.align !== "left" && c.align !== "right")) return fail(`${where}: a column needs a label`);
          columns.push({ label, ...(c.align ? { align: c.align as "left" | "right" } : {}) });
        }
        if (!Array.isArray(raw.rows) || raw.rows.length > REPORT_LIMITS.rows) return fail(`${where}: too many rows`);
        const rows: string[][] = [];
        for (const r of raw.rows) {
          if (!Array.isArray(r) || r.length !== columns.length) return fail(`${where}: every row needs one cell per column`);
          const cells = r.map((cell) => short(cell));
          if (cells.some((cell) => cell === null)) return fail(`${where}: every cell must be short text`);
          rows.push(cells as string[]);
        }
        blocks.push({ type: "table", title, ...(description ? { description } : {}), columns, rows, ...(emptyText ? { emptyText } : {}) });
        break;
      }
      case "text": {
        const title = short(raw.title, 200);
        if (!title || !Array.isArray(raw.lines) || raw.lines.length > 40 || !raw.lines.every((l) => short(l) !== null)) return fail(`${where}: a text block needs a title and short lines`);
        blocks.push({ type: "text", title, lines: raw.lines as string[] });
        break;
      }
      default:
        return fail(`${where} has an unknown type`);
    }
  }
  return ok({ report, title, period: { from, to }, blocks });
}
