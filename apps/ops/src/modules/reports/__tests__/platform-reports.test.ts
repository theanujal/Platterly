import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseReportDoc } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { PLATFORM_REPORTS, REPORT_CATEGORIES, platformReport, type ReportContext } from "../platform-reports";
import { reportToCsv } from "../csv";

const KEY = "platrep";
const ids = [1, 2, 3].map((n) => `biz_${String(n + 1).repeat(32)}`);
const now = new Date("2026-10-15T10:00:00Z");
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);
const all: ReportContext = { range: { from: null, to: null }, now };
const scoped: ReportContext = { ...all, productKey: KEY };

async function clean() {
  await prisma.messageLog.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

beforeAll(async () => {
  await clean();
  await prisma.product.create({ data: { key: KEY, name: "Plat Rep", baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x" } });
  const trial = await prisma.plan.create({ data: { productKey: KEY, code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7 } });
  const pro = await prisma.plan.create({ data: { productKey: KEY, code: "pro", name: "Pro", priceMonthly: 1000 } });
  for (const [i, id] of ids.entries()) await prisma.business.create({ data: { id, name: `Plat Rep Biz ${i + 1}`, createdAt: at(120 - i * 30), products: { create: { productKey: KEY, lastActiveAt: at(2), usage: { counts: { orders: 10 * (i + 1) } } } } } });
  const snapshot = { seller: {}, buyer: { name: "B", gstin: "29ABCDE1234F1Z5" }, gst: { kind: "INTRA", lines: [{ label: "CGST (9%)", amount: 90 }, { label: "SGST (9%)", amount: 90 }] }, highlights: [] };
  const pay = (n: number, businessId: string, paidDaysAgo: number, periodDays: number, status: "PAID" | "FAILED" = "PAID") =>
    prisma.subscriptionPayment.create({ data: { id: `pay_${String(n).repeat(32)}`, businessId, productKey: KEY, planId: pro.id, interval: "MONTHLY", amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, status, ...(status === "PAID" ? { paidAt: at(paidDaysAgo), periodStart: at(paidDaysAgo), periodEnd: new Date(at(paidDaysAgo).getTime() + periodDays * DAY), invoiceNumber: `PR-${n}`, invoiceSnapshot: snapshot } : { createdAt: at(paidDaysAgo) }) } });
  await pay(1, ids[0], 70, 400);
  await pay(2, ids[1], 20, 30);
  await pay(3, ids[2], 60, 30); // lapsed
  await pay(4, ids[2], 40, 0, "FAILED");
  await prisma.subscription.create({ data: { id: "sub_" + "1".repeat(32), businessId: ids[2], productKey: KEY, planId: trial.id, status: "TRIALING", startDate: at(100), trialEndsAt: at(93) } });
  await prisma.messageLog.create({ data: { businessId: ids[2], productKey: KEY, template: "trial_ended", variables: {}, status: "FAILED", toEmail: "x@y.example", error: "boom" } });
});
afterAll(clean);

describe("platform reports", () => {
  it("lists every report once, in a known category", () => {
    expect(new Set(PLATFORM_REPORTS.map((r) => r.key)).size).toBe(PLATFORM_REPORTS.length);
    for (const r of PLATFORM_REPORTS) expect(REPORT_CATEGORIES).toContain(r.category);
    expect(platformReport("nope")).toBeUndefined();
    expect(["export", "product"].some((k) => platformReport(k))).toBe(false); // those are real routes
  });

  it.each(PLATFORM_REPORTS.map((r) => r.key))("%s builds a document the contract accepts, for one product and for all, and exports to CSV", async (key) => {
    const report = platformReport(key)!;
    for (const ctx of [scoped, all, { ...scoped, range: { from: at(30), to: now } }]) {
      const doc = await report.build(ctx);
      const parsed = parseReportDoc(JSON.parse(JSON.stringify(doc)));
      expect(parsed.ok, parsed.ok ? "" : parsed.error).toBe(true);
      expect(doc.report).toBe(key);
      expect(reportToCsv(doc).length).toBeGreaterThan(20);
    }
  });

  it("works out MRR, churn, failed payments, GST and email figures from the fixture", async () => {
    const tile = (doc: Awaited<ReturnType<NonNullable<ReturnType<typeof platformReport>>["build"]>>, label: string) => (doc.blocks.find((b) => b.type === "tiles" && b.tiles.some((t) => t.label === label)) as { tiles: { label: string; value: string }[] }).tiles.find((t) => t.label === label)!.value;
    expect(tile(await platformReport("revenue-trend")!.build(scoped), "MRR today")).toBe("₹2,000.00");
    const failed = await platformReport("failed-payments")!.build(scoped);
    expect(tile(failed, "Failed in the period")).toBe("1");
    expect(tile(failed, "Recovered")).toBe("0");
    expect(tile(failed, "Still unpaid")).toBe("1");
    const gst = await platformReport("gst")!.build(scoped);
    expect(tile(gst, "Invoices")).toBe("3");
    expect(tile(gst, "CGST + SGST")).toBe("₹540.00");
    expect(tile(gst, "IGST")).toBe("₹0.00");
    const mail = await platformReport("email-delivery")!.build(scoped);
    expect(tile(mail, "Failed")).toBe("1");
    const top = await platformReport("top-businesses")!.build(scoped);
    const table = top.blocks[0] as { rows: string[][] };
    expect(table.rows.map((r) => r[0]).slice(0, 2).sort()).toEqual(["Plat Rep Biz 1", "Plat Rep Biz 2"]);
    const mix = await platformReport("plan-mix")!.build(scoped);
    expect(tile(mix, "Paying businesses")).toBe("2");
  });

  it("a product with nothing in it still builds every report", async () => {
    for (const r of PLATFORM_REPORTS) {
      const doc = await r.build({ ...all, productKey: "no-such-product" });
      expect(parseReportDoc(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    }
  });
});
