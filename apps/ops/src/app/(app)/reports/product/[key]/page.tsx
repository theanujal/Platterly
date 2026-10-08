import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import type { ReportDoc } from "@platterly/contract";
import { PageHeader } from "@/components/ui";
import { PickProduct } from "@/components/pick-product";
import { prisma } from "@/lib/db";
import { getSelectedProduct } from "@/lib/selected-product";
import { fetchProductReport, reportsOf } from "@/modules/reports/product-reports";
import { resolveRange, toIsoDate } from "@/modules/reports/range";
import { PeriodFilters } from "../../period-filters";
import { ReportBlocks } from "../../report-blocks";

export const dynamic = "force-dynamic";

/** One of the picked product's own reports. Ops asks the product for it each time (signed) and shows what comes back. */
export default async function ProductReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { key } = await params;
  const query = await searchParams;
  const selected = await getSelectedProduct();
  if (!selected) return (<><PageHeader title="Product report" description="A report a product publishes about itself." /><PickProduct what="Product reports" /></>);
  const listing = reportsOf((await prisma.product.findUnique({ where: { key: selected.key }, select: { manifest: true } }))?.manifest).find((r) => r.key === key);
  const range = resolveRange(query);
  let doc: ReportDoc | null = null;
  let error: string | null = null;
  if (!listing) error = `${selected.name} does not publish that report. Refresh what it offers under Settings, Products.`;
  else {
    const result = await fetchProductReport(selected.key, key, { from: range.from ? toIsoDate(range.from) : null, to: range.to ? toIsoDate(range.to) : null });
    if (result.ok) doc = result.doc; else error = result.error;
  }
  const qs = new URLSearchParams(Object.entries({ report: key, scope: "product", ...(query.from || query.to ? { from: query.from ?? "", to: query.to ?? "" } : { range: range.preset === "custom" ? "this-month" : range.preset }) }).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHeader
        title={listing?.label ?? "Report"}
        description={`${selected.name}'s own report, asked of ${selected.name} just now.`}
        actions={<><Link href="/reports" className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 text-[13.5px] font-medium hover:bg-muted"><ArrowLeft className="size-4" aria-hidden />All reports</Link>{doc ? <a href={`/reports/export?${qs}`} className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 text-[13.5px] font-medium hover:bg-muted"><Download className="size-4" aria-hidden />Download as CSV</a> : null}</>}
      />
      <PeriodFilters range={range} from={query.from} to={query.to} />
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {doc ? <ReportBlocks blocks={doc.blocks} /> : null}
    </>
  );
}
