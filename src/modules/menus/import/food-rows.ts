import type { FoodType } from "@/generated/prisma/enums";

/** Pure part of the food item import: header mapping and row checks. No database. */
export const MAX_IMPORT_ROWS = 1000;

export const TEMPLATE_COLUMNS = ["Item Name", "Category", "Veg / Non-Veg", "Price", "Description"];

const ALIASES: Record<"name" | "category" | "foodType" | "price" | "description", string[]> = {
  name: ["item name", "name", "food item", "dish", "dish name", "item"],
  category: ["category", "categories", "course"],
  foodType: ["veg / non-veg", "veg/non-veg", "veg non veg", "veg or non veg", "type", "food type", "menu type", "veg"],
  price: ["price", "rate", "cost", "amount", "price per plate"],
  description: ["description", "details", "about"],
};

export type ColumnMap = Partial<Record<keyof typeof ALIASES, number>>;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function mapColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((h, i) => {
    for (const key of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
      if (map[key] === undefined && ALIASES[key].includes(norm(h))) map[key] = i;
    }
  });
  return map;
}

export function parseFoodType(value: string): FoodType | null {
  const v = norm(value);
  if (["veg", "v", "vegetarian", "pure veg"].includes(v)) return "VEGETARIAN";
  if (["non-veg", "non veg", "nonveg", "nv", "non-vegetarian", "non vegetarian"].includes(v)) return "NON_VEGETARIAN";
  return null;
}

export interface FoodRow {
  row: number;
  name: string;
  categoryNames: string[];
  foodType: FoodType;
  price: number;
  description?: string;
}
export interface RowError {
  row: number;
  name: string;
  reason: string;
}

/** `table[0]` is the header. Row numbers are the spreadsheet's own (header = 1). Rows that are fully blank are ignored. */
export function parseFoodRows(table: string[][]): { rows: FoodRow[]; errors: RowError[]; missingColumns: string[] } {
  const map = mapColumns(table[0] ?? []);
  const missingColumns = [
    map.name === undefined ? "Item Name" : null,
    map.foodType === undefined ? "Veg / Non-Veg" : null,
  ].filter((c): c is string => c !== null);
  if (missingColumns.length) return { rows: [], errors: [], missingColumns };

  const cell = (r: string[], key: keyof ColumnMap) => (map[key] === undefined ? "" : (r[map[key]!] ?? "").trim());
  const rows: FoodRow[] = [];
  const errors: RowError[] = [];
  table.slice(1).forEach((r, i) => {
    if (r.every((c) => !c?.trim())) return;
    const row = i + 2;
    const name = cell(r, "name");
    const fail = (reason: string) => errors.push({ row, name, reason });
    if (!name) return fail("Item name is missing.");
    const foodType = parseFoodType(cell(r, "foodType"));
    if (!foodType) return fail('Veg / Non-Veg must be "Veg" or "Non-Veg".');
    const priceText = cell(r, "price").replace(/[₹,\s]/g, "");
    const price = priceText === "" ? 0 : Number(priceText);
    if (!Number.isFinite(price) || price < 0) return fail("Price must be a number, zero or more.");
    rows.push({
      row,
      name,
      foodType,
      price,
      categoryNames: cell(r, "category").split(/[;,|]/).map((c) => c.trim()).filter(Boolean),
      description: cell(r, "description") || undefined,
    });
  });
  return { rows, errors, missingColumns };
}
