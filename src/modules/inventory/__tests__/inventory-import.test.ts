import { describe, it, expect } from "vitest";
import { toXlsx } from "@/lib/export/tabular";
import { parseXlsx } from "@/lib/import/read-table";
import { normalizeCategory, normalizeUnit } from "../options";
import { mapColumns, parseInventoryRows, TEMPLATE_COLUMNS } from "../import/inventory-rows";

describe("unit and category normalizing", () => {
  it("maps common spellings to the stored unit", () => {
    expect(normalizeUnit("Kilogram (kg)")).toBe("kg");
    expect(normalizeUnit(" KGS ")).toBe("kg");
    expect(normalizeUnit("Litre")).toBe("ltr");
    expect(normalizeUnit("pieces")).toBe("pcs");
    expect(normalizeUnit("Liter (ltr)")).toBe("ltr");
    expect(normalizeUnit("pkt")).toBe("packet");
    expect(normalizeUnit("bushel")).toBeNull();
  });

  it("matches a category ignoring case and '&' / 'and'", () => {
    expect(normalizeCategory("grains and cereals")).toBe("Grains & Cereals");
    expect(normalizeCategory("DAIRY")).toBe("Dairy");
    expect(normalizeCategory("Gadgets")).toBeNull();
  });
});

describe("parseInventoryRows", () => {
  it("maps the template columns and aliases", () => {
    expect(mapColumns(TEMPLATE_COLUMNS)).toEqual({ name: 0, category: 1, unit: 2, cost: 3, openingStock: 4, lowStock: 5, storage: 6 });
    expect(mapColumns(["Ingredient", "UOM", "Rate", "Qty"])).toEqual({ name: 0, unit: 1, cost: 2, openingStock: 3 });
  });

  it("returns valid rows, reports bad ones with their sheet row number, ignores blank lines", () => {
    const { rows, errors } = parseInventoryRows([
      TEMPLATE_COLUMNS,
      ["Basmati Rice", "grains and cereals", "Kilogram (kg)", "₹1,095.50", "25", "10", "Dry store"],
      ["Paneer", "Dairy", "kg", "", "", "", ""],
      ["", "Dairy", "kg", "", "", "", ""],
      ["Mystery", "Dairy", "bushel", "", "", "", ""],
      ["Salt", "Gadgets", "kg", "", "", "", ""],
      ["Oil", "Oils & Ghee", "ltr", "abc", "", "", ""],
      ["Flour", "Flours", "kg", "", "-5", "", ""],
      ["", "", "", "", "", "", ""],
      ["Sugar", "", "kg", "", "", "", ""],
    ]);
    expect(rows.map((r) => [r.row, r.name, r.category, r.unit, r.costPerUnit, r.openingStock, r.lowStockThreshold, r.storageLocation])).toEqual([
      [2, "Basmati Rice", "Grains & Cereals", "kg", 1095.5, 25, 10, "Dry store"],
      [3, "Paneer", "Dairy", "kg", undefined, undefined, undefined, undefined],
      [10, "Sugar", "Other", "kg", undefined, undefined, undefined, undefined],
    ]);
    expect(errors.map((e) => e.row)).toEqual([4, 5, 6, 7, 8]);
  });

  it("rejects numbers too large for the database columns", () => {
    const { rows, errors } = parseInventoryRows([TEMPLATE_COLUMNS, ["Rice", "Dairy", "kg", "999999999999", "", "", ""]]);
    expect(rows).toEqual([]);
    expect(errors[0].reason).toMatch(/too large/);
  });

  it("asks for the missing required columns", () => {
    expect(parseInventoryRows([["Category", "Price"]]).missingColumns).toEqual(["Item Name", "Unit"]);
  });

  it("reads back a file written like the template", () => {
    const table = parseXlsx(toXlsx([{ title: "Inventory Items", columns: TEMPLATE_COLUMNS, rows: [["Basmati Rice", "Grains & Cereals", "kg", 95, 25, 10, "Dry store"], ["Paneer", "Dairy", "kg", 320, null, null, "Cold room"]] }]));
    const { rows, errors } = parseInventoryRows(table);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.name, r.openingStock])).toEqual([["Basmati Rice", 25], ["Paneer", undefined]]);
  });
});
