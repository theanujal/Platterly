import type { ReportDoc } from "@platterly/contract";

/** One CSV cell, quoted when it needs to be. A cell starting with = + - @ is prefixed so a spreadsheet never runs it as a formula. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const line = (cells: string[]) => cells.map(cell).join(",");

/** A report document as a CSV file: every tile, bar list, table and text block in order, with its title above it. */
export function reportToCsv(doc: ReportDoc): string {
  const rows: string[] = [line([doc.title]), line(["Period", doc.period.from ?? "start", doc.period.to ?? "today"]), ""];
  for (const block of doc.blocks) {
    if (block.type === "tiles") {
      rows.push(line(["Summary", "Value", "Note"]), ...block.tiles.map((t) => line([t.label, t.value, t.hint ?? ""])));
    } else if (block.type === "bars") {
      rows.push(line([block.title]), line(["Item", "Value", "Note"]), ...block.rows.map((r) => line([r.label, r.text, r.sub ?? ""])));
    } else if (block.type === "table") {
      rows.push(line([block.title]), line(block.columns.map((c) => c.label)), ...block.rows.map((r) => line(r)));
    } else {
      rows.push(line([block.title]), ...block.lines.map((l) => line([l])));
    }
    rows.push("");
  }
  return rows.join("\r\n");
}
