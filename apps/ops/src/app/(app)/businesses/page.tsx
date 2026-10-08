import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { Button, Empty, LinkButton, PageHeader, inputClass } from "@/components/ui";
import { getSelectedProduct } from "@/lib/selected-product";
import { PLAN_FILTERS, listBusinesses, type BusinessSort, type PlanFilter } from "@/modules/directory/businesses";
import { BusinessCard, BusinessTable } from "./business-views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Businesses" };

type Query = { q?: string; page?: string; view?: string; status?: string; plan?: string; sort?: string };
const STATUSES = ["ACTIVE", "SUSPENDED", "PENDING_DELETE"] as const;
const SORTS: { value: BusinessSort; label: string }[] = [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "name", label: "Name A to Z" }];

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const selected = await getSelectedProduct();
  const view = query.view === "grid" ? "grid" : "list";
  const status = STATUSES.find((s) => s === query.status);
  const plan = PLAN_FILTERS.find((p) => p.value === query.plan)?.value as PlanFilter | undefined;
  const sort = SORTS.find((s) => s.value === query.sort)?.value;
  const result = await listBusinesses({ q: query.q, page: Number(query.page) || 1, productKey: selected?.key, status, plan, sort });
  const keep = (over: Partial<Query>) => `/businesses?${new URLSearchParams(Object.entries({ q: query.q, view, status, plan, sort, ...over }).filter(([, v]) => v) as [string, string][])}`;
  const filtered = Boolean(query.q || status || plan);
  const toggle = (value: "grid" | "list", Icon: typeof List, label: string) => (
    <Link href={keep({ view: value, page: undefined })} aria-label={label} aria-current={view === value ? "true" : undefined} className={`flex size-8 items-center justify-center rounded-lg ${view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Icon className="size-4" aria-hidden /></Link>
  );

  return (
    <>
      <PageHeader
        title="Businesses"
        description={selected ? `Businesses on ${selected.name}.` : "Every business across every product."}
        actions={<><nav aria-label="View" className="flex gap-1 rounded-[10px] border border-border bg-white p-1">{toggle("grid", LayoutGrid, "Card view")}{toggle("list", List, "List view")}</nav><LinkButton href="/businesses/new" size="md">New business</LinkButton></>}
      />
      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={query.q ?? ""} placeholder="Search by name or owner email" aria-label="Search businesses" className={`${inputClass} w-72!`} />
        <select name="status" aria-label="Status" defaultValue={status ?? ""} className={`${inputClass} w-40!`}>
          <option value="">Any status</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="PENDING_DELETE">Pending delete</option>
        </select>
        <select name="plan" aria-label="Plan" defaultValue={plan ?? ""} className={`${inputClass} w-40!`}>
          <option value="">Any plan state</option>{PLAN_FILTERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select name="sort" aria-label="Sort" defaultValue={sort ?? "newest"} className={`${inputClass} w-44!`}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <Button type="submit" variant="outline">Apply</Button>
        {filtered ? <Link href={`/businesses?view=${view}`} className="text-sm text-accent-foreground hover:underline">Clear</Link> : null}
      </form>
      {result.rows.length === 0 ? (
        <Empty>{filtered ? "No business matches those filters." : "No businesses yet. They appear here when a product reports a sign-up."}</Empty>
      ) : view === "list" ? (
        <BusinessTable rows={result.rows} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{result.rows.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
      )}
      {result.pages > 1 ? (
        <nav aria-label="Pages" className="mt-5 flex items-center gap-3 text-sm">
          {result.page > 1 ? <Link className="text-accent-foreground hover:underline" href={keep({ page: String(result.page - 1) })}>Previous</Link> : null}
          <span className="text-muted-foreground">Page {result.page} of {result.pages} ({result.total} businesses)</span>
          {result.page < result.pages ? <Link className="text-accent-foreground hover:underline" href={keep({ page: String(result.page + 1) })}>Next</Link> : null}
        </nav>
      ) : <p className="mt-4 text-sm text-muted-foreground">{result.total} {result.total === 1 ? "business" : "businesses"}</p>}
    </>
  );
}
