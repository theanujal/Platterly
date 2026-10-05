import { describe, expect, it } from "vitest";
import { parseReportDoc } from "@platterly/contract";
import { computeSaas } from "../saas-math";
import { saasToDoc } from "../saas-doc";

const d = (iso: string) => new Date(`${iso}T10:00:00Z`);
const now = d("2026-10-20");
const payments = [
  { businessId: "biz_a", planId: "pro", planName: "Pro", interval: "MONTHLY" as const, amount: 1000, gstAmount: 180, paidAt: d("2026-10-02"), periodStart: d("2026-10-02"), periodEnd: d("2026-11-01") },
  { businessId: "biz_b", planId: "yr", planName: "Yearly", interval: "ANNUAL" as const, amount: 12000, gstAmount: 2160, paidAt: d("2026-09-10"), periodStart: d("2026-09-10"), periodEnd: d("2027-09-10") },
];

describe("the Subscriptions report as a document", () => {
  it("is a valid report document with the headline figures formatted for reading", () => {
    const saas = computeSaas({ payments, trials: [{ businessId: "biz_a", startDate: d("2026-09-25"), trialEndsAt: d("2026-10-02") }], failedPayments: 1, period: { from: d("2026-10-01"), to: d("2026-10-31") }, now });
    const doc = saasToDoc(saas, { periodChosen: true, from: "2026-10-01", to: "2026-10-31" });
    const parsed = parseReportDoc(doc);
    expect(parsed.ok, parsed.ok ? "" : parsed.error).toBe(true);
    const tiles = doc.blocks[0].type === "tiles" ? doc.blocks[0].tiles : [];
    expect(tiles.find((t) => t.label.startsWith("MRR"))?.value).toBe("₹2,000.00"); // 1000 monthly + 12000/12
    expect(tiles.find((t) => t.label.startsWith("ARR"))?.value).toBe("₹24,000.00");
    expect(tiles.find((t) => t.label === "Paying businesses")?.value).toBe("2");
    expect(tiles.find((t) => t.label === "Failed payments")?.value).toBe("1");
    expect(JSON.stringify(doc)).toContain("1 payment");
  });

  it("says what is missing instead of showing nothing: no period, no payments", () => {
    const saas = computeSaas({ payments: [], trials: [], failedPayments: 0, period: { from: null, to: null }, now });
    const doc = saasToDoc(saas, { periodChosen: false, from: null, to: null });
    expect(parseReportDoc(doc).ok).toBe(true);
    expect(JSON.stringify(doc)).toContain("Choose a period, such as This month");
    const bars = doc.blocks.find((b) => b.type === "bars" && b.title === "MRR by plan");
    expect(bars && bars.type === "bars" && bars.rows).toEqual([]);
  });
});
