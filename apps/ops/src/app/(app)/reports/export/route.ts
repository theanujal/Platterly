import { getStaff } from "@/lib/session";
import { getSelectedProduct } from "@/lib/selected-product";
import { reportToCsv } from "@/modules/reports/csv";
import { platformReport } from "@/modules/reports/platform-reports";
import { fetchProductReport } from "@/modules/reports/product-reports";
import { resolveRange, toIsoDate } from "@/modules/reports/range";

export const dynamic = "force-dynamic";

/** GET ?report=&scope=platform|product&range=|from=&to=: the report on screen as a CSV file. Staff only. A product report is the sidebar's product's. */
export async function GET(request: Request) {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const q = Object.fromEntries(new URL(request.url).searchParams) as { report?: string; scope?: string; range?: string; from?: string; to?: string };
  const range = resolveRange(q);
  const from = range.from ? toIsoDate(range.from) : null;
  const to = range.to ? toIsoDate(range.to) : null;
  const selected = await getSelectedProduct();

  let doc;
  if (q.scope === "product") {
    if (!selected || !q.report) return new Response("Choose a product for this report.", { status: 400 });
    const result = await fetchProductReport(selected.key, q.report, { from, to });
    if (!result.ok) return new Response(result.error, { status: 502 });
    doc = result.doc;
  } else {
    const report = platformReport(q.report ?? "");
    if (!report) return new Response("Unknown report.", { status: 404 });
    doc = await report.build({ range, productKey: report.scoped ? selected?.key : undefined, now: new Date() });
  }
  const name = `${doc.report}-${from ?? "start"}-${to ?? "today"}.csv`;
  return new Response(`﻿${reportToCsv(doc)}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
