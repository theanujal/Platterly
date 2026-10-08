"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { markAllReadAction } from "./notifications/actions";

export interface BellItem {
  id: string;
  title: string;
  body: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  when: string;
  href: string | null;
  read: boolean;
}

const DOT = { INFO: "bg-info", WARNING: "bg-warning", CRITICAL: "bg-destructive" } as const;

/** The bell in the top bar: unread count and the latest few notifications. The full list is on the Notifications page. */
export function NotificationBell({ unread, items }: { unread: number; items: BellItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="relative flex size-10 items-center justify-center rounded-[10px] border border-border bg-white hover:bg-muted">
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <form action={markAllReadAction}><button type="submit" className="text-[13px] font-medium text-accent-foreground hover:underline">Mark all read</button></form>
          </div>
          {items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing yet.</p> : (
            <ul className="max-h-80 overflow-auto divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={n.href ?? "/notifications"} onClick={() => setOpen(false)} className={`flex gap-3 px-4 py-3 hover:bg-muted ${n.read ? "" : "bg-primary/[0.04]"}`}>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[n.severity]}`} aria-hidden />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{n.title}</span><span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{n.when}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-center text-sm font-medium text-accent-foreground hover:bg-muted">View all</Link>
        </div>
      ) : null}
    </div>
  );
}
