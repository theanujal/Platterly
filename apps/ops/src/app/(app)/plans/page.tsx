import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Empty, LinkButton, PageHeader } from "@/components/ui";
import { PickProduct } from "@/components/pick-product";
import { getSelectedProduct } from "@/lib/selected-product";
import { listPlans } from "@/modules/plans/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans" };

const money = (value: unknown) => (value === null || value === undefined ? "—" : `₹${Number(value).toLocaleString("en-IN")}`);

export default async function PlansPage() {
  const selected = await getSelectedProduct();
  if (!selected) return (<><PageHeader title="Plans" description="What a product sells, and what each plan allows." /><PickProduct what="Plans" /></>);
  const [plans, products] = await Promise.all([listPlans(selected?.key), prisma.product.findMany({ where: { status: "ACTIVE", ...(selected ? { key: selected.key } : {}) }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title="Plans" description={selected ? `What ${selected.name} sells, and what each plan allows.` : "What each product sells, and what each plan allows."} actions={products.filter((p) => p.manifest).map((p) => <LinkButton key={p.key} href={`/plans/new?product=${p.key}`} size="md">New {p.name} plan</LinkButton>)} />
      {plans.length === 0 ? (
        <Empty>No plans yet. Once {selected.name} is connected and Ops has read what it offers, create its plans here.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {plans.map((p) => (
            <section key={p.id} className="flex flex-col gap-4 rounded-[14px] bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/plans/${p.id}`} className="block truncate text-base font-semibold hover:underline">{p.name}</Link>
                  <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">{p.isTrial ? <Badge tone="info">Trial</Badge> : null}<Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Retired"}</Badge></div>
              </div>
              <div>
                {p.isTrial ? <p className="text-2xl font-bold">{p.trialDurationDays} days <span className="text-sm font-normal text-muted-foreground">free</span></p> : (
                  <>
                    <p className="text-2xl font-bold">{money(p.priceMonthly)} <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
                    <p className="text-sm text-muted-foreground">{money(p.priceAnnual)} a year · plus {Number(p.gstPercent)}% GST</p>
                  </>
                )}
              </div>
              {p.highlights.length > 0 ? <div className="flex flex-wrap gap-1.5">{p.highlights.slice(0, 4).map((h) => <span key={h} className="inline-flex h-5 items-center rounded-full border border-border px-2.5 text-[11px] font-medium text-[#374151]">{h}</span>)}</div> : null}
              <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm">
                <span className="text-muted-foreground">{p._count.subscriptions} {p._count.subscriptions === 1 ? "business" : "businesses"}</span>
                <Link href={`/plans/${p.id}`} className="font-medium text-accent-foreground hover:underline">Edit</Link>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
