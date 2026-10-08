"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, Megaphone, X } from "lucide-react";
import type { Notice } from "@/content/types";

const keyFor = (text: string) => `platterly-notice-closed:${text}`;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/**
 * The strip above the header: an icon, one line, a small link and a close button. Once someone closes a notice it stays
 * closed for them (remembered on their device, per notice text), and a new notice shows again.
 */
export function AnnouncementBar({ notice }: { notice: Notice }) {
  const closed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(keyFor(notice.text)) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  if (closed) return null;
  const close = () => {
    try {
      localStorage.setItem(keyFor(notice.text), "1");
    } catch {
      /* private mode: it just comes back next visit */
    }
    listeners.forEach((cb) => cb());
  };
  return (
    <div className="relative bg-accent text-ink-navy">
      <p className="mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-12 py-2 text-center text-sm font-medium">
        <Megaphone className="hidden size-4 shrink-0 sm:block" aria-hidden />
        <span>{notice.text}</span>
        {notice.linkHref && (
          <Link href={notice.linkHref} className="inline-flex items-center gap-1 rounded-md bg-ink-navy/10 px-2.5 py-0.5 text-xs font-medium transition-colors duration-150 hover:bg-ink-navy/20">
            {notice.linkLabel ?? "Learn more"} <ArrowRight className="size-3" aria-hidden />
          </Link>
        )}
      </p>
      <button type="button" onClick={close} aria-label="Close announcement" className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors hover:bg-ink-navy/10 sm:right-5">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
