"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { switchProductAction } from "./switch-product";

interface Option {
  key: string;
  name: string;
}

/** The product picker at the top of the sidebar: every Ops screen that is about one product follows it. */
export function ProductSwitcher({ products, selectedKey, compact = false }: { products: Option[]; selectedKey: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const current = products.find((p) => p.key === selectedKey) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function choose(key: string) {
    setOpen(false);
    startTransition(() => switchProductAction(key));
  }

  const rows: Option[] = [{ key: "all", name: "All products" }, ...products];
  return (
    <div ref={root} className={`relative ${compact ? "w-56" : ""}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Product: ${current?.name ?? "All products"}. Change product`}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex h-14 w-full items-center gap-3 rounded-[10px] border border-border bg-white px-3 text-left disabled:opacity-60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current?.name ?? "All products"}</span>
          <span className="block text-xs text-muted-foreground">Product</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <ul role="listbox" aria-label="Products" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-[10px] border border-border bg-white p-1 shadow-lg">
          {rows.map((row) => {
            const active = (row.key === "all" && !current) || row.key === current?.key;
            return (
              <li key={row.key} role="option" aria-selected={active}>
                <button type="button" onClick={() => choose(row.key)} className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-sidebar-accent ${active ? "font-semibold" : ""}`}>
                  <span className="flex-1 truncate">{row.name}</span>
                  {active ? <Check className="size-4 text-primary" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
