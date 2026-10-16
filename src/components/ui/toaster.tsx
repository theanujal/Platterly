"use client"

import { useSyncExternalStore } from "react"
import { CheckCircle2, CircleAlert, X } from "lucide-react"
import { cn } from "cn"

/**
 * The platform's result alert (AJ, 2026-10-17): a small card in the bottom-right corner after a save, a removal or a failure.
 * Call `toast.success("...")` / `toast.error("...")` from any client code; render `<Toaster />` once in the app layout.
 */
type ToastItem = { id: number; tone: "success" | "error"; text: string }

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

function show(tone: ToastItem["tone"], text: string) {
  const id = nextId++
  items = [...items.slice(-3), { id, tone, text }]
  emit()
  setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000)
}

export const toast = {
  success: (text: string) => show("success", text),
  error: (text: string) => show("error", text),
}

const EMPTY: ToastItem[] = []

export function Toaster() {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => items,
    () => EMPTY,
  )
  if (current.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {current.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          data-testid="toast"
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card p-3 text-sm shadow-lg",
            t.tone === "error" ? "border-destructive/40" : "border-success/40",
          )}
        >
          {t.tone === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
          <p className="min-w-0 flex-1 break-words">{t.text}</p>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
