import { describe, expect, it } from "vitest";
import type { ReportDoc } from "@platterly/contract";
import { reportToCsv } from "../csv";

const doc: ReportDoc = {
  report: "sales",
  title: "Sales",
  period: { from: "2026-10-01", to: null },
  blocks: [
    { type: "tiles", tiles: [{ label: "Revenue", value: "₹1,000", hint: "Cancelled, left out" }] },
    { type: "bars", title: "By month", rows: [{ label: "Oct 2026", value: 1, text: "₹1,000", sub: "4 orders" }] },
    { type: "table", title: "Kitchens", columns: [{ label: "Kitchen" }, { label: "Revenue", align: "right" }], rows: [['Spice "Co"', "₹1,000"], ["=HYPERLINK(\"x\")", "+5"]] },
    { type: "text", title: "Notes", lines: ["One."] },
  ],
};

describe("report as CSV", () => {
  const csv = reportToCsv(doc);
  const lines = csv.split("\r\n");

  it("writes the title, the period and every block in order with its heading", () => {
    expect(lines.slice(0, 3)).toEqual(["Sales", "Period,2026-10-01,today", ""]);
    expect(lines).toContain("Summary,Value,Note");
    expect(lines).toContain('Revenue,"₹1,000","Cancelled, left out"');
    expect(lines).toContain("By month");
    expect(lines).toContain('Oct 2026,"₹1,000",4 orders');
    expect(lines).toContain("Kitchen,Revenue");
    expect(lines).toContain("Notes");
    expect(lines).toContain("One.");
  });

  it("quotes commas and quotes, and stops a cell being read as a formula", () => {
    expect(lines).toContain('"Spice ""Co""","₹1,000"');
    expect(lines).toContain("\"'=HYPERLINK(\"\"x\"\")\",'+5");
  });
});
