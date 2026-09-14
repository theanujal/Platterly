"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, LayoutGrid, List as ListIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHeader, TableRow, TableHead } from "@/components/ui/table";

/** Shared styling for every "Add New X" dashed-border tile across the catalog sections, so all 5 stay visually identical without copy-pasting the class string. */
export const CATALOG_ADD_TILE_CLASSNAME =
  "flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer";

export interface CatalogEntry {
  id: string;
  /**
   * Present -> the whole card/row is Link-wrapped and navigates here (Events'
   * still-page-based flow). Absent -> no navigation at all; the card/row
   * itself isn't interactive, and any actions (edit/delete) live inside the
   * pre-rendered `card`/`listRow` JSX instead (2026-09-14 — Menu
   * Types/Categories/Items/Add-ons moved to popup-based edit, so there's no
   * detail page left to link to).
   */
  href?: string;
  searchText: string;
  /** Grid-mode card body — image/name/description/meta. */
  card: React.ReactNode;
  /** List-mode row cells (rendered inside a <TableRow>). */
  listRow: React.ReactNode;
}

interface CatalogBrowserProps {
  entries: CatalogEntry[];
  /** Visible list-view column headings, in the same order as each entry's `listRow` cells. */
  columns: string[];
  /**
   * Pre-rendered "Add New X" grid tile (dashed border, matching
   * CATALOG_ADD_TILE_CLASSNAME) — a Dialog trigger for the 4 popup-based
   * entities, or a plain Link for Events. Pre-rendered rather than a render
   * function, same reason `card`/`listRow` are: this is a Client Component,
   * and Next's RSC boundary can't serialize functions from a Server
   * Component parent.
   */
  addTile: React.ReactNode;
  searchPlaceholder?: string;
  emptyLabel: string;
}

// Shared card-based grid/list browser (AJ, 2026-09-14) used by every
// catalog-shaped list page — Menu Catalog's Categories/Items/Menus, Add-ons,
// and Events. One component, not five reimplementations, per this project's
// existing "3+ reuses -> shared component" convention (DashboardCardHeader
// is the precedent).
//
// Takes pre-rendered JSX per entry (built server-side in each page.tsx), not
// render-prop functions: this is itself a Client Component ("use client",
// for the search/view-toggle state below), and Next.js's RSC boundary can't
// serialize plain functions passed down from a Server Component parent —
// only already-rendered elements/plain data survive that boundary.
// Filtering is client-side — confirmed sufficient at expected catalog sizes.
export function CatalogBrowser({
  entries,
  columns,
  addTile,
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
          {addTile}
          {filtered.map((entry) =>
            entry.href ? (
              <Link key={entry.id} href={entry.href} className="block">
                <Card className="h-full overflow-hidden py-0 transition-shadow hover:shadow-md">{entry.card}</Card>
              </Link>
            ) : (
              <Card key={entry.id} className="h-full overflow-hidden py-0 transition-shadow hover:shadow-md">
                {entry.card}
              </Card>
            ),
          )}
          {filtered.length === 0 && entries.length > 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No matches for &quot;{query}&quot;.</p>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column, index) =>
                  index === columns.length - 1 ? (
                    <TableHead key={column}>
                      <span className="sr-only">{column}</span>
                    </TableHead>
                  ) : (
                    <TableHead key={column}>{column}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow
                  key={entry.id}
                  className={entry.href ? "cursor-pointer" : undefined}
                  onClick={
                    entry.href
                      ? () => {
                          window.location.href = entry.href!;
                        }
                      : undefined
                  }
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
