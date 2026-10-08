import Link from "next/link";
import type { ReportDoc } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { Button, Empty, PageHeader, inputClass } from "@/components/ui";
import { getSelectedProduct } from "@/lib/selected-product";
import { RANGE_PRESETS, resolveRange, toIsoDate } from "@/modules/reports/range";
import { fetchProductReport, reportsOf } from "@/modules/reports/product-reports";
import { saasToDoc } from "@/modules/reports/saas-doc";
import { loadSaasReport, loadSignupsByMonth } from "@/modules/reports/saas-report";
import { ReportBlocks } from "./report-blocks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

type Query = { product?: string; tab?: string; range?: string; from?: string; to?: string };

/** Reports across every business: a product's own reports (asked of the product), and what businesses pay Platterly (from ops's own records). */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { key: true, name: true, manifest: true } });
  // The sidebar's product is the default; the page's own Product box can still override it (including "All products").
  const sidebar = await getSelectedProduct();
  const wanted = query.product ?? sidebar?.key;
  const selected = wanted && wanted !== "all" ? products.find((p) => p.key === wanted) : undefined;
  const productKey = selected?.key;
  const productReports = selected ? reportsOf(selected.manifest) : [];
  const tabs = [...productReports.map((r) => ({ id: r.key, label: r.label })), { id: "subscriptions", label: "Subscriptions" }, { id: "signups", label: "Sign-ups" }];
  const tab = tabs.find((t) => t.id === query.tab)?.id ?? tabs[0].id;
  const range = resolveRange(query);
  const fromIso = range.from ? toIsoDate(range.from) : null;
  const toIso = range.to ? toIsoDate(range.to) : null;

  let doc: ReportDoc | null = null;
  let error: string | null = null;
  if (tab === "subscriptions") {
    doc = saasToDoc(await loadSaasReport(range, productKey), { periodChosen: Boolean(range.from), from: fromIso, to: toIso });
  } else if (tab === "signups") {
    const s = await loadSignupsByMonth(range, productKey);
    doc = {
      report: "signups",
      title: "Sign-ups",
      period: { from: fromIso, to: toIso },
      blocks: [
        { type: "tiles", tiles: [{ label: "Businesses", value: s.total.toLocaleString("en-IN"), hint: productKey ? "On this product" : "On every product" }, { label: "New in the period", value: s.inRange.toLocaleString("en-IN") }] },
        { type: "bars", title: "Sign-ups by month", rows: s.byMonth.map((m) => ({ label: m.label, value: m.count, text: String(m.count) })) },
      ],
    };
  } else if (productKey) {
    const result = await fetchProductReport(productKey, tab, { from: fromIso, to: toIso });
    if (result.ok) doc = result.doc;
    else error = result.error;
  }

  const keep = (over: Partial<Query>) => new URLSearchParams(Object.entries({ product: productKey ?? "all", tab, ...(query.from || query.to ? { from: query.from ?? "", to: query.to ?? "" } : { range: range.preset === "custom" ? "this-month" : range.preset }), ...over }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHeader title="Reports" description="Across every business. A product's own reports are asked of the product when you open them; subscriptions and sign-ups come from Ops's own records." />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search" aria-label="Report filters">
        <input type="hidden" name="tab" value={tab} />
        <div className="flex flex-col gap-1.5"><label htmlFor="product" className="text-sm font-medium">Product</label>
          <select id="product" name="product" defaultValue={productKey ?? "all"} className={`${inputClass} w-48`}>
            <option value="all">All products</option>
            {products.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><label htmlFor="range" className="text-sm font-medium">Period</label>
          <select id="range" name="range" defaultValue={range.preset === "custom" ? "this-month" : range.preset} className={`${inputClass} w-52`}>
            {RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><label htmlFor="from" className="text-sm font-medium">From</label><input id="from" name="from" type="date" defaultValue={query.from ?? ""} className={`${inputClass} w-40`} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="to" className="text-sm font-medium">To</label><input id="to" name="to" type="date" defaultValue={query.to ?? ""} className={`${inputClass} w-40`} /></div>
        <Button type="submit" size="md" variant="outline">Apply</Button>
      </form>
      <p className="mb-3 text-xs text-muted-foreground">A From or To date overrides the period. {range.from ? `Showing ${toIsoDate(range.from)}${range.to ? ` to ${toIsoDate(range.to)}` : " onwards"}.` : "Showing all time."}</p>
      <div role="tablist" aria-label="Reports" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <Link key={t.id} role="tab" aria-selected={tab === t.id} href={`/reports?${keep({ tab: t.id })}`} className={`-mb-px inline-flex shrink-0 items-center border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</Link>
        ))}
      </div>
      {doc ? <p className="mb-3"><a className="text-sm font-medium text-accent-foreground hover:underline" href={`/reports/export?${keep({})}`}>Download as CSV</a></p> : null}
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {doc ? <ReportBlocks blocks={doc.blocks} /> : error ? null : <Empty>Choose a product to see its reports.</Empty>}
    </>
  );
}
