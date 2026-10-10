import { describe, it, expect } from "vitest";
import { toXlsx } from "@/lib/export/tabular";
import { parseCsv, parseXlsx, readTable, UnreadableFileError } from "../import/read-table";
import { mapColumns, parseFoodRows, parseFoodType, TEMPLATE_COLUMNS } from "../import/food-rows";

describe("readTable", () => {
  it("reads quoted CSV cells, a BOM and Windows line endings", () => {
    expect(parseCsv('﻿Name,Note\r\n"Sharma, Asha","Said ""yes"""\r\nPlain,\r\n')).toEqual([
      ["Name", "Note"],
      ["Sharma, Asha", 'Said "yes"'],
      ["Plain", ""],
    ]);
  });

  it("reads back an .xlsx written by the exporter", () => {
    const data = toXlsx([{ title: "Food Items", columns: ["Item Name", "Price"], rows: [["Paneer Tikka & Co", 180], ["Dal", null]] }]);
    expect(parseXlsx(data)).toEqual([["Item Name", "Price"], ["Paneer Tikka & Co", "180"], ["Dal"]]);
  });

  it("refuses other file types and broken Excel files", () => {
    expect(() => readTable(new Uint8Array([1]), "items.pdf")).toThrow(UnreadableFileError);
    expect(() => readTable(new Uint8Array([1, 2, 3]), "items.xlsx")).toThrow(UnreadableFileError);
  });
});

describe("parseFoodRows", () => {
  it("maps the template columns and aliases", () => {
    expect(mapColumns(TEMPLATE_COLUMNS)).toEqual({ name: 0, category: 1, foodType: 2, price: 3, description: 4 });
    expect(mapColumns(["Dish", "Course", "Veg", "Rate"])).toEqual({ name: 0, category: 1, foodType: 2, price: 3 });
  });

  it("accepts veg / non-veg spellings", () => {
    expect(parseFoodType("Veg")).toBe("VEGETARIAN");
    expect(parseFoodType(" non veg ")).toBe("NON_VEGETARIAN");
    expect(parseFoodType("maybe")).toBeNull();
  });

  it("returns valid rows, reports bad ones with their sheet row number, ignores blank lines", () => {
    const { rows, errors } = parseFoodRows([
      TEMPLATE_COLUMNS,
      ["Paneer Tikka", "Starters; Popular", "Veg", "₹1,180", "Smoky"],
      ["", "Starters", "Veg", "10", ""],
      ["Mystery", "Mains", "Fish?", "10", ""],
      ["Dal", "", "veg", "abc", ""],
      ["", "", "", "", ""],
      ["Raita", "", "Veg", "", ""],
    ]);
    expect(rows.map((r) => [r.row, r.name, r.price, r.categoryNames])).toEqual([[2, "Paneer Tikka", 1180, ["Starters", "Popular"]], [7, "Raita", 0, []]]);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5]);
  });

  it("asks for the missing required columns", () => {
    expect(parseFoodRows([["Category", "Price"]]).missingColumns).toEqual(["Item Name", "Veg / Non-Veg"]);
  });
});
