"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { searchOrdersAction, type GlobalSearchResult } from "@/app/(app)/actions";
import type { OrderStatus } from "@/generated/prisma/enums";
import { formatPhoneDisplay } from "@/lib/phone";

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  IN_PREPARATION: "In Preparation",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

// Header search — client name, Order Number, or phone number, all via
// Order.listOrders' existing search OR-clause (see ../../app/(app)/actions.ts).
// A plain debounced input + absolutely-positioned result list rather than
// the shadcn Command/cmdk primitive — no `cmdk` dependency exists in this
// project yet and this doesn't need a command palette's full behavior.
export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmedQuery = query.trim();
  const queryTooShort = trimmedQuery.length < 2;

  // No setState call for the "too short" case — dropdown visibility is
  // derived at render time (`open && !queryTooShort` below) instead of
  // reset here, since calling setState synchronously in an effect body
  // (rather than inside the async timeout callback) trips
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (queryTooShort) return;
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const data = await searchOrdersAction(trimmedQuery);
        setResults(data);
        setOpen(true);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, queryTooShort]);

  const showDropdown = open && !queryTooShort;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goToOrder(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/orders/${id}`);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search client, order #, or phone"
        className="h-9 w-full rounded-lg border border-input bg-background pr-8 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {isPending && (
        <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {showDropdown && (
        <div className="absolute top-full left-0 z-20 mt-1 w-full min-w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No matching orders.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => goToOrder(result.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{result.customerName}</span>
                      <span className="text-xs text-muted-foreground">
                        {result.orderNumber ?? "—"} · {formatPhoneDisplay(result.customerPhone)}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-xs font-semibold">{formatCurrency(result.total)}</span>
                      <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[result.status]}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
