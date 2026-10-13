"use client"

import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "cn"

export interface MultiSelectOption {
  value: string
  label: string
}

const MAX_CHIPS = 3

/**
 * A select that takes several values (AJ, 2026-10-13, from a reference screenshot): the closed field shows the picks
 * as removable chips with a count and a clear-all button; opening it shows a search box and a checklist with the
 * picked options first and the rest below a divider. Options are `role="option"` buttons like SearchableSelect's.
 */
export function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No matches.",
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: {
  options: MultiSelectOption[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  disabled?: boolean
  "aria-label": string
  className?: string
}) {
  const listId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const picked = options.filter((o) => value.includes(o.value))
  const q = query.trim().toLowerCase()
  const matches = (o: MultiSelectOption) => !q || o.label.toLowerCase().includes(q)
  const visiblePicked = picked.filter(matches)
  const visibleRest = options.filter((o) => !value.includes(o.value) && matches(o))

  function toggle(optionValue: string) {
    onValueChange(value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue])
  }

  function row(option: MultiSelectOption) {
    const checked = value.includes(option.value)
    return (
      <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={checked}
        onClick={() => toggle(option.value)}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
      >
        <span
          aria-hidden
          className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", checked ? "border-primary bg-primary text-primary-foreground" : "border-input")}
        >
          {checked && <Check className="size-3.5" />}
        </span>
        <span className="flex-1">{option.label}</span>
      </button>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger
        nativeButton={false}
        render={<div role="combobox" aria-haspopup="listbox" aria-controls={listId} aria-expanded={open} aria-label={ariaLabel} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} />}
        data-slot="multi-select-trigger"
        className={cn(
          "flex min-h-10 w-full cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-transparent py-1.5 pr-2.5 pl-2 text-left text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:bg-input/30",
          className
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {picked.length === 0 && <span className="pl-1 text-muted-foreground">{placeholder}</span>}
          {picked.slice(0, MAX_CHIPS).map((option) => (
            <span key={option.value} className="flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 text-sm">
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(option.value)
                }}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {picked.length > MAX_CHIPS && <span className="text-muted-foreground">…</span>}
        </span>
        {picked.length > 0 && (
          <>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-foreground/80 px-1.5 text-xs font-medium text-background" data-testid="multi-select-count">
              {picked.length}
            </span>
            <button
              type="button"
              aria-label="Clear all"
              onClick={(e) => {
                e.stopPropagation()
                onValueChange([])
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </>
        )}
        <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-64 p-2 data-open:animate-none data-closed:animate-none">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                const first = visiblePicked[0] ?? visibleRest[0]
                if (first) toggle(first.value)
              }
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full rounded-md border border-input bg-transparent pr-8 pl-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div id={listId} role="listbox" aria-multiselectable aria-label={ariaLabel} className="max-h-60 overflow-y-auto">
          {visiblePicked.map(row)}
          {visiblePicked.length > 0 && visibleRest.length > 0 && <div className="mx-2 my-1 border-t border-border" />}
          {visibleRest.map(row)}
          {visiblePicked.length === 0 && visibleRest.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{emptyLabel}</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
