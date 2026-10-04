import { strToU8, zipSync } from "fflate";

/**
 * Chunk 24 — CSV and Excel export. A report is turned into plain sheets (a title, column names, rows of text, numbers or
 * blanks) and written as either file, so the two always hold the same figures. No accounting-system integration:
 * these are files a bookkeeper opens or imports.
 */
export type Cell = string | number | null | undefined;

export interface Sheet {
  /** Shown as the Excel tab name (cleaned to Excel's rules) and as a heading line in a CSV. */
  title: string;
  columns: string[];
  rows: Cell[][];
}

export type ExportFormat = "csv" | "xlsx";

export function parseFormat(value: string | null | undefined): ExportFormat {
  return value === "xlsx" ? "xlsx" : "csv";
}

// ---------------------------------------------------------------------------------------------- CSV

/** A spreadsheet runs a cell that starts with one of these as a formula, so a typed-in value could do harm. */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (cells: Cell[]) => cells.map(csvCell).join(",");

/** One file for one or several sheets: each sheet is a title line, its columns and rows, with a blank line between. UTF-8 with a BOM so Excel reads the rupee sign. */
export function toCsv(sheets: Sheet[]): string {
  const body = sheets
    .map((sheet) => [sheet.title ? csvLine([sheet.title]) : null, csvLine(sheet.columns), ...sheet.rows.map(csvLine)].filter((l) => l !== null).join("\r\n"))
    .join("\r\n\r\n");
  return `﻿${body}\r\n`;
}

// ---------------------------------------------------------------------------------------------- XLSX

const xmlEscape = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Excel's own rules for a tab name: at most 31 characters, none of []:*?/\, not empty, and no two the same. */
export function sheetNames(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((title, i) => {
    const base = (title.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || `Sheet ${i + 1}`).slice(0, 31);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function sheetXml(sheet: Sheet): string {
  const widths = sheet.columns.map((c, i) => Math.min(60, Math.max(10, c.length + 2, ...sheet.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))));
  const cell = (value: Cell, col: number, row: number, style: number) => {
    const ref = `${columnName(col)}${row}`;
    if (value === null || value === undefined || value === "") return style === 1 ? `<c r="${ref}" s="1"/>` : "";
    if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}" s="${style === 1 ? 1 : 2}"><v>${value}</v></c>` : "";
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  };
  const header = `<row r="1">${sheet.columns.map((c, i) => cell(c, i, 1, 1)).join("")}</row>`;
  const rows = sheet.rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(v, ci, ri + 2, 0)).join("")}</row>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${header}${rows}</sheetData></worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  // 0 text, 1 bold header on grey, 2 number with thousands separators (Excel's built-in format 4: #,##0.00)
  `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** A real .xlsx (a zip of XML parts), one tab per sheet, bold grey header row frozen at the top. */
export function toXlsx(sheets: Sheet[]): Uint8Array {
  const list = sheets.length > 0 ? sheets : [{ title: "Sheet 1", columns: [], rows: [] }];
  const names = sheetNames(list.map((s) => s.title));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  list.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files);
}

// ---------------------------------------------------------------------------------------------- response

const CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** A safe file name: letters, digits, dashes, and the day it was made. */
export function exportFileName(base: string, format: ExportFormat, now: Date = new Date()): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${clean}-${now.toISOString().slice(0, 10)}.${format}`;
}

export function exportResponse(format: ExportFormat, base: string, sheets: Sheet[]): Response {
  const body = format === "xlsx" ? toXlsx(sheets) : toCsv(sheets);
  return new Response(typeof body === "string" ? body : Buffer.from(body), {
    headers: {
      "Content-Type": CONTENT_TYPE[format],
      "Content-Disposition": `attachment; filename="${exportFileName(base, format)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
