"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Mail, MoreVertical } from "lucide-react";

/** The 3-dot menu on a business card or row. */
export function CardMenu({ id, name, email }: { id: string; name: string; email: string | null }) {
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
  const item = "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent";
  return (
    <div ref={root} className="relative">
      <button type="button" aria-label={`Actions for ${name}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
        <MoreVertical className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgba(17,24,39,0.1),0_4px_8px_-2px_rgba(0,0,0,0.12)]">
          <Link role="menuitem" href={`/businesses/${id}`} className={item}><ExternalLink className="size-4" aria-hidden />Open details</Link>
          {email ? <a role="menuitem" href={`mailto:${email}`} className={item}><Mail className="size-4" aria-hidden />Email owner</a> : null}
        </div>
      ) : null}
    </div>
  );
}
