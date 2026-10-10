"use client"

import * as React from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "cn"

export interface SearchableOption {
  value: string
  label: string
  /** Muted text after the label, e.g. an ingredient's unit. It is searched too. */
  hint?: string
}

/**
 * A select you can search (AJ, 2026-10-11): a trigger styled like the other selects, and a popover with a search box
 * and the matching options. Enter picks the first match. Options are plain `role="option"` buttons, so tests and
 * screen readers treat them like a normal select's.
 */
export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No matches.",
  "aria-label": ariaLabel,
  className,
}: {
  options: SearchableOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  "aria-label": string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const selected = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const visible = q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options

  function pick(next: string) {
    onValueChange(next)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger
        aria-label={ariaLabel}
        data-slot="searchable-select-trigger"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2.5 pl-3 text-left text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          !selected && "text-muted-foreground",
          className
        )}
      >
        <span className="line-clamp-1">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-64 p-2 data-open:animate-none data-closed:animate-none">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (visible[0]) pick(visible[0].value)
              }
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full rounded-md border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto">
          {visible.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => pick(option.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
            >
              <span className="flex-1">{option.label}</span>
              {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
              {option.value === value && <Check className="size-4" />}
            </button>
          ))}
          {visible.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{emptyLabel}</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
