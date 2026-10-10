import { CATEGORY_OPTIONS, normalizeCategory, normalizeUnit, UNIT_OPTIONS } from "../options";

/** Pure part of the inventory import: header mapping and row checks. No database. */
export const MAX_IMPORT_ROWS = 1000;

export const TEMPLATE_COLUMNS = ["Item Name", "Category", "Unit", "Purchase Price", "Opening Stock", "Low Stock Alert", "Storage Location"];

const ALIASES = {
  name: ["item name", "name", "item", "ingredient", "ingredient name", "product", "product name"],
  category: ["category", "categories", "group"],
  unit: ["unit", "uom", "unit of measure", "units"],
  cost: ["purchase price", "price", "cost", "cost per unit", "rate", "purchase price per unit", "unit price"],
  openingStock: ["opening stock", "stock", "quantity", "qty", "current stock", "opening quantity"],
  lowStock: ["low stock alert", "low stock", "threshold", "reorder level", "min stock", "minimum stock"],
  storage: ["storage location", "storage", "location", "store"],
} as const;

export type ColumnMap = Partial<Record<keyof typeof ALIASES, number>>;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function mapColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((h, i) => {
    for (const key of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
      if (map[key] === undefined && (ALIASES[key] as readonly string[]).includes(norm(h))) map[key] = i;
    }
  });
  return map;
}

export interface InventoryRow {
  row: number;
  name: string;
  category: string;
  unit: string;
  costPerUnit?: number;
  openingStock?: number;
  lowStockThreshold?: number;
  storageLocation?: string;
}
export interface RowError {
  row: number;
  name: string;
  reason: string;
}

const MAX_COST = 99_999_999.99; // Decimal(10,2)
const MAX_STOCK = 1_000_000_000; // the limit createInventoryItem enforces for opening stock

function parseNumber(text: string, label: string, max: number): { value?: number; error?: string } {
  const t = text.replace(/[₹,\s]/g, "");
  if (t === "") return {};
  const value = Number(t);
  if (!Number.isFinite(value) || value < 0) return { error: `${label} must be a number, zero or more.` };
  if (value > max) return { error: `${label} is too large.` };
  return { value: Math.round(value * 100) / 100 };
}

/** `table[0]` is the header. Row numbers are the spreadsheet's own (header = 1). Fully blank rows are ignored. */
export function parseInventoryRows(table: string[][]): { rows: InventoryRow[]; errors: RowError[]; missingColumns: string[] } {
  const map = mapColumns(table[0] ?? []);
  const missingColumns = [map.name === undefined ? "Item Name" : null, map.unit === undefined ? "Unit" : null].filter((c): c is string => c !== null);
  if (missingColumns.length) return { rows: [], errors: [], missingColumns };

  const cell = (r: string[], key: keyof ColumnMap) => (map[key] === undefined ? "" : (r[map[key]!] ?? "").trim());
  const rows: InventoryRow[] = [];
  const errors: RowError[] = [];
  table.slice(1).forEach((r, i) => {
    if (r.every((c) => !c?.trim())) return;
    const row = i + 2;
    const name = cell(r, "name");
    const fail = (reason: string) => errors.push({ row, name, reason });
    if (!name) return fail("Item name is missing.");
    const unit = normalizeUnit(cell(r, "unit"));
    if (!unit) return fail(`Unit must be one of: ${UNIT_OPTIONS.map((u) => u.value).join(", ")}.`);
    const categoryText = cell(r, "category");
    const category = categoryText ? normalizeCategory(categoryText) : "Other";
    if (!category) return fail(`Category must be one of: ${CATEGORY_OPTIONS.join(", ")}.`);
    const cost = parseNumber(cell(r, "cost"), "Purchase price", MAX_COST);
    if (cost.error) return fail(cost.error);
    const stock = parseNumber(cell(r, "openingStock"), "Opening stock", MAX_STOCK);
    if (stock.error) return fail(stock.error);
    const low = parseNumber(cell(r, "lowStock"), "Low stock alert", MAX_STOCK);
    if (low.error) return fail(low.error);
    const storage = cell(r, "storage");
    if (storage.length > 200) return fail("Storage location must be 200 characters or fewer.");
    rows.push({
      row,
      name,
      category,
      unit,
      costPerUnit: cost.value,
      openingStock: stock.value,
      lowStockThreshold: low.value,
      storageLocation: storage || undefined,
    });
  });
  return { rows, errors, missingColumns };
}
