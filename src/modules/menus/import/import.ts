import "server-only";
import { toCsv, toXlsx, type Sheet } from "@/lib/export/tabular";
import { bulkAddFoodItems, type BulkResult } from "./bulk-add";
import { MAX_IMPORT_ROWS, parseFoodRows, TEMPLATE_COLUMNS, type RowError } from "./food-rows";
import { readTable, UnreadableFileError } from "./read-table";

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export interface ImportResult extends BulkResult {
  /** Rows that could not be read (bad Veg / Non-Veg, price, missing name), with the spreadsheet row number. */
  invalidRows: RowError[];
}

export async function importFoodItems(organizationId: string, file: { name: string; data: Uint8Array }, actorUserId: string): Promise<ImportResult> {
  if (file.data.byteLength === 0) throw new UnreadableFileError("That file is empty.");
  if (file.data.byteLength > MAX_IMPORT_BYTES) throw new UnreadableFileError("The file must be 4MB or smaller.");
  const { rows, errors, missingColumns } = parseFoodRows(readTable(file.data, file.name));
  if (missingColumns.length) throw new UnreadableFileError(`Add the missing column(s): ${missingColumns.join(", ")}. Use the template.`);
  if (rows.length === 0 && errors.length === 0) throw new UnreadableFileError("The file has no items.");
  if (rows.length + errors.length > MAX_IMPORT_ROWS) throw new UnreadableFileError(`Import at most ${MAX_IMPORT_ROWS} items at a time.`);
  const result = await bulkAddFoodItems(organizationId, rows, actorUserId);
  return { ...result, invalidRows: errors };
}

const TEMPLATE: Sheet = {
  title: "Food Items",
  columns: TEMPLATE_COLUMNS,
  rows: [
    ["Paneer Tikka", "Starters", "Veg", 180, "Charred cottage cheese cubes in spiced yogurt"],
    ["Chicken Biryani", "Rice & Biryani", "Non-Veg", 260, "Basmati rice layered with marinated chicken"],
  ],
};

export function buildTemplate(format: "csv" | "xlsx"): Uint8Array | string {
  return format === "xlsx" ? toXlsx([TEMPLATE]) : toCsv([{ ...TEMPLATE, title: "" }]);
}
