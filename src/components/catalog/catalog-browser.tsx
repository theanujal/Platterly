"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHeader, TableRow, TableHead } from "@/components/ui/table";

export interface CatalogEntry {
  id: string;
  href: string;
  searchText: string;
  /** Grid-mode card body — image/name/description/meta. */
  card: React.ReactNode;
  /** List-mode row cells (rendered inside a <TableRow>). */
  listRow: React.ReactNode;
}

interface CatalogBrowserProps {
  entries: CatalogEntry[];
  listColumnCount: number;
  newHref: string;
  newLabel: string;
  searchPlaceholder?: string;
  emptyLabel: string;
}

// Shared card-based grid/list browser (AJ, 2026-09-14) used by every
// catalog-shaped list page — Menu Catalog's Categories/Items/Menus and the
// new Events section. One component, not four reimplementations, per this
// project's existing "3+ reuses -> shared component" convention
// (DashboardCardHeader is the precedent).
//
// Takes pre-rendered JSX per entry (built server-side in each page.tsx),
// not render-prop functions: this is itself a Client Component ("use
// client", for the search/view-toggle state below), and Next.js's RSC
// boundary can't serialize plain functions passed down from a Server
// Component parent — only already-rendered elements/plain data survive
// that boundary. Filtering is client-side — confirmed sufficient at
// expected catalog sizes.
export function CatalogBrowser({
  entries,
  listColumnCount,
  newHref,
  newLabel,
  searchPlaceholder = "Search…",
  emptyLabel,
}: CatalogBrowserProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.searchText.toLowerCase().includes(q));
  }, [entries, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Search"
          />
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg border border-input p-0.5">
          <Button
            type="button"
            variant={view === "grid" ? "default" : "ghost"}
            size="icon-sm"
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            type="button"
            variant={view === "list" ? "default" : "ghost"}
            size="icon-sm"
            aria-pressed={view === "list"}
            aria-label="List view"
            onClick={() => setView("list")}
          >
            <ListIcon className="size-4" />
          </Button>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Link
            href={newHref}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-6" />
            <span className="text-sm font-medium">{newLabel}</span>
          </Link>
          {filtered.map((entry) => (
            <Link key={entry.id} href={entry.href} className="block">
              <Card className="h-full overflow-hidden py-0 transition-shadow hover:shadow-md">{entry.card}</Card>
            </Link>
          ))}
          {filtered.length === 0 && entries.length > 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No matches for &quot;{query}&quot;.</p>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={listColumnCount} className="sr-only">
                  Results
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer"
                  onClick={() => {
                    window.location.href = entry.href;
                  }}
                >
                  {entry.listRow}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {entries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>}
        </>
      )}
    </div>
  );
}
