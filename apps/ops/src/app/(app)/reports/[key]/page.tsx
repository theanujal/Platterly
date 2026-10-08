import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import type { ReportDoc } from "@platterly/contract";
import { PageHeader } from "@/components/ui";
import { getSelectedProduct } from "@/lib/selected-product";
import { platformReport } from "@/modules/reports/platform-reports";
import { resolveRange } from "@/modules/reports/range";
import { PeriodFilters } from "../period-filters";
import { ReportBlocks } from "../report-blocks";

export const dynamic = "force-dynamic";

/** One Platterly report (built from Ops's own records) for the chosen period and, when one is picked in the sidebar, product. */
export default async function PlatformReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { key } = await params;
  const report = platformReport(key);
  if (!report) notFound();
  const query = await searchParams;
  const range = resolveRange(query);
  const selected = report.scoped ? await getSelectedProduct() : null;
  let doc: ReportDoc | null = null;
  let error: string | null = null;
  try {
    doc = await report.build({ range, productKey: selected?.key, now: new Date() });
  } catch (e) {
    console.error("[ops reports]", key, e);
    error = "This report could not be built. Try again, or pick a shorter period.";
  }
  const qs = new URLSearchParams(Object.entries({ report: key, scope: "platform", ...(query.from || query.to ? { from: query.from ?? "", to: query.to ?? "" } : { range: range.preset === "custom" ? "this-month" : range.preset }) }).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHeader
        title={report.label}
        description={`${report.description}${selected ? ` Showing ${selected.name}.` : ""}`}
        actions={<><Link href="/reports" className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 text-[13.5px] font-medium hover:bg-muted"><ArrowLeft className="size-4" aria-hidden />All reports</Link>{doc ? <a href={`/reports/export?${qs}`} className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 text-[13.5px] font-medium hover:bg-muted"><Download className="size-4" aria-hidden />Download as CSV</a> : null}</>}
      />
      <PeriodFilters range={range} from={query.from} to={query.to} />
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {doc ? <ReportBlocks blocks={doc.blocks} /> : null}
    </>
  );
}
