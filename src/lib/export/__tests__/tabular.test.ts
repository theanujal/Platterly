import { describe, it, expect } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { exportFileName, exportResponse, parseFormat, sheetNames, toCsv, toXlsx, type Sheet } from "../tabular";

const sheet: Sheet = { title: "Revenue by month", columns: ["Month", "Orders", "Revenue (₹)"], rows: [["Sep 2026", 3, 45000], ["Oct 2026", 2, 75000.5]] };

describe("CSV", () => {
  it("writes a BOM, a title line, the columns and the rows with Windows line endings", () => {
    const csv = toCsv([sheet]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["﻿Revenue by month", "Month,Orders,Revenue (₹)", "Sep 2026,3,45000", "Oct 2026,2,75000.5", ""]);
  });

  it("quotes commas, quotes and line breaks, and keeps blanks empty", () => {
    const csv = toCsv([{ title: "", columns: ["Name", "Note"], rows: [["Sharma, Asha", 'Said "yes"'], ["Line\nbreak", null], [undefined, ""]] }]);
    expect(csv).toContain('"Sharma, Asha","Said ""yes"""');
    expect(csv).toContain('"Line\nbreak",');
    expect(csv.split("\r\n")).toContain(",");
    expect(csv.startsWith("﻿Name,Note")).toBe(true); // no title line when the title is empty
  });

  it("stops a typed value from running as a spreadsheet formula, but leaves real numbers alone", () => {
    const csv = toCsv([{ title: "t", columns: ["a", "b", "c", "d", "e"], rows: [["=HYPERLINK(\"http://evil\")", "+1", "-1", "@SUM(A1)", -5]] }]);
    const row = csv.split("\r\n")[2];
    expect(row).toBe(`"'=HYPERLINK(""http://evil"")",'+1,'-1,'@SUM(A1),-5`);
  });

  it("separates several sheets with a blank line", () => {
    const parts = toCsv([sheet, { title: "Second", columns: ["x"], rows: [[1]] }]).split("\r\n\r\n");
    expect(parts).toHaveLength(2);
    expect(parts[1].startsWith("Second\r\nx\r\n1")).toBe(true);
  });
});

describe("Excel", () => {
  const files = (sheets: Sheet[]) => {
    const zip = unzipSync(toXlsx(sheets));
    return Object.fromEntries(Object.entries(zip).map(([name, data]) => [name, strFromU8(data)]));
  };

  it("is a zip with the parts Excel needs and one worksheet per sheet", () => {
    const f = files([sheet, { title: "Second", columns: ["x"], rows: [[1]] }]);
    expect(Object.keys(f).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
    expect(f["xl/workbook.xml"]).toContain('name="Revenue by month"');
    expect(f["xl/workbook.xml"]).toContain('name="Second"');
  });

  it("stores text as text and numbers as numbers, with a styled frozen header", () => {
    const xml = files([sheet])["xl/worksheets/sheet1.xml"];
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Month</t></is></c>');
    expect(xml).toContain('<c r="B2" s="2"><v>3</v></c>');
    expect(xml).toContain('<c r="C3" s="2"><v>75000.5</v></c>');
    expect(xml).toContain('state="frozen"');
  });

  it("escapes markup and drops control characters, so a name cannot break the file", () => {
    const xml = files([{ title: "t", columns: ["n"], rows: [['<b>"Tom" & Jerry</b>\u0001']] }])["xl/worksheets/sheet1.xml"];
    expect(xml).toContain("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
    expect(xml).not.toContain("\u0001");
  });

  it("makes tab names legal and unique", () => {
    expect(sheetNames(["Sales/Orders: 2026", "Sales/Orders: 2026", "", "x".repeat(40)])).toEqual(["Sales Orders 2026", "Sales Orders 2026 2", "Sheet 3", "x".repeat(31)]);
  });

  it("writes an empty workbook rather than failing", () => {
    expect(Object.keys(files([]))).toContain("xl/worksheets/sheet1.xml");
  });
});

describe("response", () => {
  it("names the file safely and sets download headers", async () => {
    expect(parseFormat("xlsx")).toBe("xlsx");
    expect(parseFormat("anything")).toBe("csv");
    expect(parseFormat(null)).toBe("csv");
    expect(exportFileName("Sales & Events / 2026!", "csv", new Date("2026-10-04T10:00:00Z"))).toBe("sales-events-2026-2026-10-04.csv");
    const res = exportResponse("csv", "Reports", [sheet]);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="reports-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await res.text()).includes("Sep 2026")).toBe(true);
    const x = exportResponse("xlsx", "Reports", [sheet]);
    expect(x.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(new Uint8Array(await x.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });
});
