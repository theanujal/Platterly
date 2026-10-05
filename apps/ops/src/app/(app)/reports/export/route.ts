import { prisma } from "@/lib/db";
import { getStaff } from "@/lib/session";
import { reportToCsv } from "@/modules/reports/csv";
import { resolveRange, toIsoDate } from "@/modules/reports/range";
import { fetchProductReport } from "@/modules/reports/product-reports";
import { saasToDoc } from "@/modules/reports/saas-doc";
import { loadSaasReport, loadSignupsByMonth } from "@/modules/reports/saas-report";

export const dynamic = "force-dynamic";

/** GET ?product=&tab=&range=|from=&to=: the report on screen as a CSV file. Staff only. */
export async function GET(request: Request) {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const q = Object.fromEntries(new URL(request.url).searchParams) as { product?: string; tab?: string; range?: string; from?: string; to?: string };
  const range = resolveRange(q);
  const from = range.from ? toIsoDate(range.from) : null;
  const to = range.to ? toIsoDate(range.to) : null;
  const product = q.product && q.product !== "all" ? await prisma.product.findFirst({ where: { key: q.product, status: "ACTIVE" }, select: { key: true } }) : null;
  const tab = q.tab ?? "subscriptions";

  let doc;
  if (tab === "subscriptions") {
    doc = saasToDoc(await loadSaasReport(range, product?.key), { periodChosen: Boolean(range.from), from, to });
  } else if (tab === "signups") {
    const s = await loadSignupsByMonth(range, product?.key);
    doc = { report: "signups", title: "Sign-ups", period: { from, to }, blocks: [{ type: "tiles" as const, tiles: [{ label: "Businesses", value: String(s.total) }, { label: "New in the period", value: String(s.inRange) }] }, { type: "bars" as const, title: "Sign-ups by month", rows: s.byMonth.map((m) => ({ label: m.label, value: m.count, text: String(m.count) })) }] };
  } else if (product) {
    const result = await fetchProductReport(product.key, tab, { from, to });
    if (!result.ok) return new Response(result.error, { status: 502 });
    doc = result.doc;
  } else {
    return new Response("Choose a product for this report.", { status: 400 });
  }
  const name = `${doc.report}-${from ?? "start"}-${to ?? "today"}.csv`;
  return new Response(`﻿${reportToCsv(doc)}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
