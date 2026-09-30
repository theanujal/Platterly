"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DetailTab {
  key: string;
  label: string;
  count?: number;
  /** Pre-rendered on the server; only the tab switching itself needs the client. */
  content: React.ReactNode;
}

export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const selected = tab.key === current.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.key)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                selected ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && <span className="text-xs font-normal">({tab.count})</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{current.content}</div>
    </div>
  );
}

export interface FilterableRow {
  id: string;
  searchText: string;
  status: string;
  node: React.ReactNode;
}

/** A title, a search box and an optional status dropdown over a list of pre-rendered rows. */
export function FilterableRows({
  title,
  rows,
  statusOptions,
  searchPlaceholder,
  emptyLabel,
}: {
  title: string;
  rows: FilterableRow[];
  statusOptions?: { value: string; label: string }[];
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const needle = query.trim().toLowerCase();
  const visible = rows.filter((row) => (status === "ALL" || row.status === status) && (!needle || row.searchText.toLowerCase().includes(needle)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {title} ({rows.length})
        </h2>
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="w-56 pl-9" />
            </div>
            {statusOptions && statusOptions.length > 0 && (
              <Select items={{ ALL: "All Status", ...Object.fromEntries(statusOptions.map((o) => [o.value, o.label])) }} value={status} onValueChange={(value) => setStatus(value ?? "ALL")}>
                <SelectTrigger aria-label="Filter by status" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : visible.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Nothing matches your search.</p>
      ) : (
        <div className="@container flex flex-col gap-3">{visible.map((row) => <div key={row.id}>{row.node}</div>)}</div>
      )}
    </div>
  );
}
