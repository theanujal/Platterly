import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { PickProduct } from "@/components/pick-product";
import { getSelectedProduct } from "@/lib/selected-product";
import { LibraryReviewError, fetchLibraryEntries } from "@/modules/library/library";
import { EntryRow } from "../entry-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit library" };

const KINDS = [
  { key: "FOOD_ITEM", label: "Dishes" },
  { key: "INGREDIENT", label: "Ingredients" },
  { key: "CATEGORY", label: "Categories" },
] as const;
const PER_PAGE = 50;

export default async function LibraryEntriesPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; show?: string; page?: string }> }) {
  const selected = await getSelectedProduct();
  if (!selected) return (<><PageHeader title="Edit library" description="Fix names, categories and descriptions, or hide entries." /><PickProduct what="Edit library" /></>);
  const { kind: kindParam, q = "", show = "all", page: pageParam } = await searchParams;
  const kind = kindParam === "INGREDIENT" || kindParam === "CATEGORY" ? kindParam : "FOOD_ITEM";

  let entries: Awaited<ReturnType<typeof fetchLibraryEntries>> = [];
  let error: string | null = null;
  try {
    entries = await fetchLibraryEntries(selected.key, kind);
  } catch (e) {
    if (!(e instanceof LibraryReviewError)) throw e;
    error = e.message;
  }

  // A dish's category is chosen from the library's own list.
  let categoryNames: string[] | undefined;
  if (kind === "FOOD_ITEM" && !error) categoryNames = await fetchLibraryEntries(selected.key, "CATEGORY").then((list) => list.map((e) => e.name)).catch(() => undefined);

  const needle = q.trim().toLowerCase();
  const filtered = entries.filter((e) => (show === "hidden" ? !e.isActive : true) && (!needle || [e.name, e.categoryName, ...e.aliases].some((t) => t.toLowerCase().includes(needle))));
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), pages);
  const rows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const link = (patch: Record<string, string>) => `/library/entries?${new URLSearchParams({ kind, ...(q ? { q } : {}), show, ...patch }).toString()}`;

  return (
    <>
      <PageHeader title="Edit library" description={`The dishes and ingredients in ${selected.name}'s library. Changes reach new additions only: kitchens that already added an item keep their own copy. A hidden entry disappears from kitchens' pickers and can be shown again.`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link key={k.key} href={`/library/entries?kind=${k.key}`} className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium ${k.key === kind ? "bg-primary text-primary-foreground" : "border border-border bg-white"}`}>{k.label}</Link>
        ))}
        <Link href="/library" className="text-sm text-muted-foreground hover:underline">Back to Library review</Link>
        <form className="ml-auto flex items-center gap-2" action="/library/entries">
          <input type="hidden" name="kind" value={kind} />
          <input name="q" defaultValue={q} placeholder="Search name, category or other name" aria-label="Search the library" className="h-9 w-64 rounded-lg border border-border bg-white px-3 text-sm" />
          <select name="show" defaultValue={show} aria-label="Show" className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
            <option value="all">All</option>
            <option value="hidden">Hidden only</option>
          </select>
          <button type="submit" className="h-9 rounded-lg border border-border bg-white px-3 text-sm font-medium">Search</button>
        </form>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : rows.length === 0 ? (
        <Empty>Nothing matches.</Empty>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</p>
          <ul className="divide-y divide-border rounded-[14px] bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
            {rows.map((e) => <EntryRow key={e.id} productKey={selected.key} e={e} categoryNames={categoryNames} />)}
          </ul>
          {pages > 1 ? (
            <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Pages">
              {page > 1 ? <Link href={link({ page: String(page - 1) })} className="hover:underline">Previous</Link> : null}
              <span className="text-muted-foreground">Page {page} of {pages}</span>
              {page < pages ? <Link href={link({ page: String(page + 1) })} className="hover:underline">Next</Link> : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
