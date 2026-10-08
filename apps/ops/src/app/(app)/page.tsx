import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Layers } from "lucide-react";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { getSelectedProduct } from "@/lib/selected-product";
import { RANGES, getDashboard, inr } from "@/modules/dashboard/dashboard";
import { GrowthChart, MrrChart } from "./overview/charts";
import { KpiCard } from "./overview/kpi-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const CONNECTION = { ok: ["success", "Connected"], error: ["danger", "Problem"], waiting: ["warning", "Waiting"] } as const;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const selected = await getSelectedProduct();
  const d = await getDashboard(new Date(), selected?.key, Number(range) || 30);
  const label = RANGES.find((r) => r.days === d.days)!.label;

  return (
    <>
      <PageHeader
        title="Overview"
        description={selected ? `${selected.name}: how it is doing. Switch product in the sidebar.` : "Every product and business, in one place."}
        actions={
          <nav aria-label="Period" className="flex gap-1 rounded-[10px] border border-border bg-white p-1">
            {RANGES.map((r) => (
              <Link key={r.days} href={`/?range=${r.days}`} aria-current={r.days === d.days ? "page" : undefined} className={`flex h-8 items-center rounded-lg px-3 text-[13px] font-medium ${r.days === d.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{r.label}</Link>
            ))}
          </nav>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.kpis.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold">Business growth</h2>
          <p className="mb-2 text-sm text-muted-foreground">Total and paying businesses at the end of each month</p>
          <GrowthChart data={d.growth} />
          <p className="mt-2 flex justify-center gap-5 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full bg-primary" />Total</span><span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full bg-violet-600" />Paying</span></p>
        </Card>
        <Card>
          <h2 className="text-base font-semibold">Monthly recurring revenue</h2>
          <p className="mb-2 text-sm text-muted-foreground">What paying businesses pay per month, before GST</p>
          <MrrChart data={d.mrr} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="size-4 text-primary" aria-hidden /> Needs attention</h2>
            <Link href="/notifications" className="text-sm font-medium text-accent-foreground hover:underline">View all</Link>
          </div>
          {d.attention.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-6 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden /> Nothing needs attention. {label.toLowerCase()}.</p>
          ) : (
            <ul className="divide-y divide-border">
              {d.attention.map((item) => (
                <li key={item.key} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{item.count}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.detail}</p></div>
                  <Link href={item.href} className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent-foreground hover:underline">{item.action}<ArrowRight className="size-3.5" aria-hidden /></Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Layers className="size-4 text-primary" aria-hidden /> Products</h2>
            <Link href="/settings/products" className="text-sm font-medium text-accent-foreground hover:underline">Manage</Link>
          </div>
          {d.products.length === 0 ? <Empty>No products added yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="pb-2">Product</th><th className="pb-2">Businesses</th><th className="pb-2">Paying</th><th className="pb-2">MRR</th><th className="pb-2">Status</th></tr></thead>
                <tbody className="[&_td]:border-t [&_td]:py-3">
                  {d.products.map((p) => (
                    <tr key={p.key}>
                      <td className="font-medium">{p.name}</td><td>{p.businesses}</td><td>{p.paying}</td><td>{inr(p.mrr)}</td>
                      <td><Badge tone={CONNECTION[p.connection][0]}>{CONNECTION[p.connection][1]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
