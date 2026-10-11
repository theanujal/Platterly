import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { PickProduct } from "@/components/pick-product";
import { getSelectedProduct } from "@/lib/selected-product";
import { countPending, fetchLibraryEntries, listCandidates } from "@/modules/library/library";
import { CandidateForm } from "./candidate-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library review" };

const KINDS = [
  { key: "FOOD_ITEM", label: "Dishes" },
  { key: "INGREDIENT", label: "Ingredients" },
] as const;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const selected = await getSelectedProduct();
  if (!selected) return (<><PageHeader title="Library review" description="Dishes and ingredients kitchens added that the library does not have." /><PickProduct what="Library review" /></>);
  const { kind: kindParam, status: statusParam } = await searchParams;
  const kind = KINDS.some((k) => k.key === kindParam) ? kindParam! : "FOOD_ITEM";
  const status = ["PENDING", "APPROVED", "MERGED", "REJECTED"].includes(statusParam ?? "") ? statusParam! : "PENDING";
  const [counts, rows] = await Promise.all([countPending(selected.key), listCandidates(selected.key, { kind, status })]);
  // The library's names for the "merge into another item" box (one list for the whole page). Without it the box still works by typing.
  const libraryNames = status === "PENDING" && rows.length > 0 ? await fetchLibraryEntries(selected.key, kind as "FOOD_ITEM" | "INGREDIENT").catch(() => []) : [];
  const namesListId = "library-names";

  return (
    <>
      <PageHeader title="Library review" description={`Dishes and ingredients kitchens added that ${selected.name}'s library does not have. Nothing enters the library until you approve it. Only names, categories and counts are shown: never a price, a note or a kitchen.`} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="What to review">
        {KINDS.map((k) => (
          <Link key={k.key} href={`/library?kind=${k.key}`} role="tab" aria-selected={k.key === kind && status === "PENDING"} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium ${k.key === kind ? "bg-primary text-primary-foreground" : "border border-border bg-white"}`}>
            {k.label}
            <span className={`rounded-full px-1.5 text-xs ${k.key === kind ? "bg-white/25" : "bg-muted"}`}>{counts[k.key]}</span>
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/library/entries" className="mr-2 font-medium text-foreground hover:underline">Edit library</Link>
          Show:
          {["PENDING", "APPROVED", "MERGED", "REJECTED"].map((s) => (
            <Link key={s} href={`/library?kind=${kind}&status=${s}`} className={s === status ? "font-semibold text-foreground" : "hover:underline"}>{s.charAt(0) + s.slice(1).toLowerCase()}</Link>
          ))}
        </span>
      </div>
      {rows.length === 0 ? (
        <Empty>{status === "PENDING" ? "Nothing to review. New items appear here once at least two kitchens have added the same name." : `Nothing ${status.toLowerCase()} yet.`}</Empty>
      ) : status === "PENDING" ? (
        <div className="flex flex-col gap-4">
          <datalist id={namesListId}>{libraryNames.map((e) => <option key={e.id} value={e.name} />)}</datalist>
          {rows.map((c) => <CandidateForm key={c.id} c={c} namesListId={namesListId} />)}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[14px] bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">{c.kitchenCount} kitchens{c.decidedAt ? ` · ${c.decidedAt.toLocaleDateString("en-IN")}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
