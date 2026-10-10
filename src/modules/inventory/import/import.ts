import "server-only";
import { toCsv, toXlsx, type Sheet } from "@/lib/export/tabular";
import { readTable, UnreadableFileError } from "@/lib/import/read-table";
import { bulkAddInventory, type BulkInventoryResult } from "./bulk-add";
import { MAX_IMPORT_ROWS, parseInventoryRows, TEMPLATE_COLUMNS, type RowError } from "./inventory-rows";

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export interface InventoryImportResult extends BulkInventoryResult {
  /** Rows that could not be read (missing name, unknown unit or category, bad number), with the spreadsheet row number. */
  invalidRows: RowError[];
}

export async function importInventoryItems(
  organizationId: string,
  file: { name: string; data: Uint8Array },
  actorUserId: string,
  kitchenId: string | null,
): Promise<InventoryImportResult> {
  if (file.data.byteLength === 0) throw new UnreadableFileError("That file is empty.");
  if (file.data.byteLength > MAX_IMPORT_BYTES) throw new UnreadableFileError("The file must be 4MB or smaller.");
  const { rows, errors, missingColumns } = parseInventoryRows(readTable(file.data, file.name));
  if (missingColumns.length) throw new UnreadableFileError(`Add the missing column(s): ${missingColumns.join(", ")}. Use the template.`);
  if (rows.length === 0 && errors.length === 0) throw new UnreadableFileError("The file has no items.");
  if (rows.length + errors.length > MAX_IMPORT_ROWS) throw new UnreadableFileError(`Import at most ${MAX_IMPORT_ROWS} items at a time.`);
  const result = await bulkAddInventory(organizationId, rows, actorUserId, kitchenId);
  return { ...result, invalidRows: errors };
}

const TEMPLATE: Sheet = {
  title: "Inventory Items",
  columns: TEMPLATE_COLUMNS,
  rows: [
    ["Basmati Rice", "Grains & Cereals", "kg", 95, 25, 10, "Dry store"],
    ["Paneer", "Dairy", "kg", 320, null, null, "Cold room"],
  ],
};

export function buildInventoryTemplate(format: "csv" | "xlsx"): Uint8Array | string {
  return format === "xlsx" ? toXlsx([TEMPLATE]) : toCsv([{ ...TEMPLATE, title: "" }]);
}
