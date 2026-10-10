import { strFromU8, unzipSync } from "fflate";

/** Reads the first sheet of an .xlsx or a .csv into rows of text. No spreadsheet library: .xlsx is a zip of XML (fflate is already used for export). */
export class UnreadableFileError extends Error {}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e]!);

const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/g, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

export function parseXlsx(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name === "xl/sharedStrings.xml" || f.name === "xl/worksheets/sheet1.xml" });
  } catch {
    throw new UnreadableFileError("That is not a valid Excel (.xlsx) file.");
  }
  const sheet = files["xl/worksheets/sheet1.xml"];
  if (!sheet) throw new UnreadableFileError("That is not a valid Excel (.xlsx) file.");
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];
  const rows: string[][] = [];
  for (const row of strFromU8(sheet).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      const value = type === "s" ? (shared[Number(raw)] ?? "") : type === "inlineStr" ? textOf(body) : unescapeXml(raw);
      cells[ref ? columnIndex(ref) : cells.length] = value;
    }
    rows.push(Array.from(cells, (v) => v ?? ""));
  }
  return rows;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function readTable(data: Uint8Array, fileName: string): string[][] {
  const isXlsx = /\.xlsx$/i.test(fileName);
  if (!isXlsx && !/\.csv$/i.test(fileName)) throw new UnreadableFileError("Upload an Excel (.xlsx) or CSV (.csv) file.");
  return isXlsx ? parseXlsx(data) : parseCsv(new TextDecoder().decode(data));
}
