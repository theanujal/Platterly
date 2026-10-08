import Link from "next/link";
import { Activity, BarChart3, FileText, IndianRupee, Users, type LucideIcon } from "lucide-react";
import { Empty, PageHeader } from "@/components/ui";
import { getSelectedProduct } from "@/lib/selected-product";
import { prisma } from "@/lib/db";
import { PLATFORM_REPORTS, REPORT_CATEGORIES, type ReportCategory } from "@/modules/reports/platform-reports";
import { reportsOf } from "@/modules/reports/product-reports";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

const ICON: Record<ReportCategory, LucideIcon> = { Revenue: IndianRupee, Customers: Users, Compliance: FileText, Operations: Activity };

function Card({ href, icon: Icon, title, text, foot }: { href: string; icon: LucideIcon; title: string; text: string; foot?: string }) {
  return (
    <Link href={href} className="flex flex-col gap-3 rounded-[14px] bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)] transition-shadow hover:shadow-[0_0_0_1px_rgba(255,105,0,0.45)]">
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Icon className="size-5" aria-hidden /></span>
      <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>
      {foot ? <p className="mt-auto text-xs text-muted-foreground">{foot}</p> : null}
    </Link>
  );
}

/** The report gallery: what Platterly can say about itself (from Ops's records), then the picked product's own reports. */
export default async function ReportsPage() {
  const selected = await getSelectedProduct();
  const own = selected ? reportsOf((await prisma.product.findUnique({ where: { key: selected.key }, select: { manifest: true } }))?.manifest) : [];
  return (
    <>
      <PageHeader title="Reports" description={selected ? `Platterly reports for ${selected.name}, and the reports ${selected.name} publishes itself.` : "What Platterly can tell you about its businesses, money and activity. Pick a product to narrow them, or to see its own reports."} />
      <div className="grid gap-8">
        {selected ? (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><BarChart3 className="size-4 text-primary" aria-hidden />{selected.name} reports</h2>
            {own.length === 0 ? <Empty>{selected.name} does not publish reports yet, or Ops has not read what it offers.</Empty> : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {own.map((r) => <Card key={r.key} href={`/reports/product/${r.key}`} icon={BarChart3} title={r.label} text={`Asked of ${selected.name} each time you open it, so it is always current.`} foot={selected.name} />)}
              </div>
            )}
          </section>
        ) : null}
        {REPORT_CATEGORIES.map((category) => (
          <section key={category}>
            <h2 className="mb-3 text-base font-semibold">{category}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {PLATFORM_REPORTS.filter((r) => r.category === category).map((r) => <Card key={r.key} href={`/reports/${r.key}`} icon={ICON[category]} title={r.label} text={r.description} foot={r.scoped ? (selected ? `Showing ${selected.name}` : "All products") : "About Ops itself"} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
