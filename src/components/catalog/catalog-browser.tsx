"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

/**
 * Shared styling for every "Add New X" dashed-border tile across the catalog sections, so all 5 stay visually identical without copy-pasting the class string. A constant tinted fill (not just a plain dashed box), matching AJ's reference screenshot (2026-09-17).
 *
 * `h-full`, not a fixed `min-h` (AJ, 2026-09-19) — the grid's own default
 * `align-items: stretch` already sizes every row to its tallest data card;
 * this tile just fills that height rather than imposing its own, so it
 * tracks whatever the data cards' content determines instead of a
 * hardcoded floor that could mismatch a row of short or tall cards.
 *
 * `py-10` is padding, not height (AJ, 2026-09-19) — with zero data cards in
 * the grid there's no taller sibling for `h-full` to stretch against, so the
 * tile was collapsing to its bare content size with no breathing room at
 * all. Padding guarantees a comfortable minimum regardless of row height,
 * without reintroducing a fixed height: `justify-center` still absorbs any
 * extra space when a sibling row is taller than this padding alone would be.
 */
export const CATALOG_ADD_TILE_CLASSNAME =
  "flex h-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/25 bg-accent/60 text-muted-foreground transition-colors hover:border-primary hover:bg-accent cursor-pointer py-10";

/** Icon-circle + title + description body for an "Add New X" tile — reused by every catalog page's tile trigger instead of each hand-rolling its own Plus-icon-and-label markup. */
export function CatalogAddTileContent({ label, description }: { label: string; description: string }) {
  return (
    <>
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Plus className="size-6" />
      </div>
      <div className="flex flex-col items-center gap-0.5 px-4 text-center">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </>
  );
}

export interface CatalogFilterOption {
  /** Matches a key in each entry's `filterValues`. */
  key: string;
  /** Shown as the "clear" option, e.g. "All Menu Types". */
  allLabel: string;
  options: { value: string; label: string }[];
  /** Tailwind width class for the trigger — defaults to a sensible auto width. */
  className?: string;
}

export interface CatalogSortOption {
  value: string;
  label: string;
  /** Matches a key in each entry's `sortValues`. */
  key: string;
  direction?: "asc" | "desc";
}

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
  /**
   * Values checked against the active `filterOptions` selections, keyed by
   * each filter's `key`. A string[] is treated as multi-membership (e.g. an
   * item tagged with several categories) and matched via `.includes`; a
   * plain string is matched exactly.
   */
  filterValues?: Record<string, string | string[] | undefined>;
  /** Values read by the active `sortOptions` selection, keyed by each option's `key`. */
  sortValues?: Record<string, number | string>;
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
  /**
   * Self-contained, generic attribute filters (client-side, matched against
   * each entry's `filterValues`) — for pages whose whole list is already
   * loaded client-side (Food Items, Add-ons, Inventory, Customers).
   */
  filterOptions?: CatalogFilterOption[];
  /**
   * A pre-built, externally-controlled filter bar (e.g. a server
   * URL-searchParams-driven `<Select>`, like Orders'/Quotations'/Enquiries'
   * existing status filters) rendered in the same toolbar position as
   * `filterOptions` would be. Use this instead of `filterOptions` when a
   * page's filtering already happens server-side — same visual slot, no
   * behavior change to a filter that already works.
   */
  filters?: React.ReactNode;
  /** Client-side sort of the (already search/filter-narrowed) entries. Omit to hide the Sort control entirely. */
  sortOptions?: CatalogSortOption[];
  /** Rows per page. Omit to disable pagination. */
  pageSize?: number;
  /** Which view renders first — Grid suits visual catalogs, List suits tabular data (e.g. Inventory). Defaults to "grid". */
  defaultView?: "grid" | "list";
}

function matchesFilter(entry: CatalogEntry, key: string, selected: string): boolean {
  const value = entry.filterValues?.[key];
  if (Array.isArray(value)) return value.includes(selected);
  return value === selected;
}

// Shared card-based grid/list browser (AJ, 2026-09-14; extended 2026-09-17
// with filters/sort/pagination to match AJ's Food Items reference design)
// used by every catalog-shaped list page — Menu Catalog's Categories/Items/
// Menus, Add-ons, Events, Inventory, Customers, Enquiries, Quotations,
// Orders. One component, not nine reimplementations, per this project's
// existing "3+ reuses -> shared component" convention (DashboardCardHeader
// is the precedent).
//
// Takes pre-rendered JSX per entry (built server-side in each page.tsx), not
// render-prop functions: this is itself a Client Component ("use client",
// for the search/filter/sort/view/page state below), and Next.js's RSC
// boundary can't serialize plain functions passed down from a Server
// Component parent — only already-rendered elements/plain data survive that
// boundary. Filtering/sorting/pagination are client-side — confirmed
// sufficient at expected catalog sizes (same judgment call the original
// search already made).
export function CatalogBrowser({
  entries,
  columns,
  addTile,
  searchPlaceholder = "Search…",
  emptyLabel,
  filterOptions,
  filters,
  sortOptions,
  pageSize,
  defaultView = "grid",
}: CatalogBrowserProps) {
  const [view, setView] = useState<"grid" | "list">(defaultView);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(sortOptions?.[0]?.value);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (q && !entry.searchText.toLowerCase().includes(q)) return false;
      for (const [key, selected] of Object.entries(activeFilters)) {
        if (selected && selected !== "ALL" && !matchesFilter(entry, key, selected)) return false;
      }
      return true;
    });
  }, [entries, query, activeFilters]);

  const sorted = useMemo(() => {
    const option = sortOptions?.find((o) => o.value === sort);
    if (!option) return filtered;
    const dir = option.direction === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = a.sortValues?.[option.key] ?? "";
      const bv = b.sortValues?.[option.key] ?? "";
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortOptions, sort]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const paged = pageSize ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize) : sorted;

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Search"
          />
        </div>

        {filterOptions?.map((filter) => (
          <Select
            key={filter.key}
            items={{ ALL: filter.allLabel, ...Object.fromEntries(filter.options.map((o) => [o.value, o.label])) }}
            value={activeFilters[filter.key] ?? "ALL"}
            onValueChange={(value) => {
              setActiveFilters((prev) => ({ ...prev, [filter.key]: value ?? "ALL" }));
              resetPage();
            }}
          >
            {/* "Filter by X", not bare "X" — a bare "Type"/"Category" aria-label
                collides with an identically-labeled form field inside an
                Add/Edit dialog open on the same page (a real, not
                hypothetical, strict-mode failure caught via the E2E suite). */}
            <SelectTrigger aria-label={`Filter by ${filter.allLabel}`} className={filter.className ?? "w-40"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{filter.allLabel}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {filters}

        {sortOptions && sortOptions.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <Select
              items={Object.fromEntries(sortOptions.map((o) => [o.value, o.label]))}
              value={sort}
              onValueChange={(value) => {
                setSort(value ?? sortOptions[0]?.value);
                resetPage();
              }}
            >
              <SelectTrigger aria-label="Sort by" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex shrink-0 gap-1 rounded-lg border border-input p-0.5">
          <Button
            type="button"
            variant={view === "grid" ? "default" : "ghost"}
            size="sm"
            className="h-10 gap-1.5 px-3 text-sm"
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="size-4" />
            Grid
          </Button>
          <Button
            type="button"
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            className="h-10 gap-1.5 px-3 text-sm"
            aria-pressed={view === "list"}
            aria-label="List view"
            onClick={() => setView("list")}
          >
            <ListIcon className="size-4" />
            List
          </Button>
        </div>
      </div>
      <Separator />

      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {currentPage === 1 && addTile}
          {paged.map((entry) =>
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
              {paged.map((entry) => (
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
          {entries.length > 0 && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No matches for &quot;{query}&quot;.</p>
          )}
        </>
      )}

      {pageSize && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <p className="text-sm text-muted-foreground">
            Showing {paged.length} of {sorted.length} items
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
              <Button
                key={pageNumber}
                type="button"
                variant={pageNumber === currentPage ? "default" : "outline"}
                size="icon-sm"
                aria-label={`Page ${pageNumber}`}
                aria-current={pageNumber === currentPage ? "page" : undefined}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
