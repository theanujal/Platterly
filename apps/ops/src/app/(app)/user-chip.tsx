"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

/** The staff member at the top right, like Caterly's header: name and role line, the initials and a chevron that opens the email and Sign out. */
export function UserChip({ name, email, initials }: { name: string; email: string; initials: string }) {
  const router = useRouter();
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
  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }
  return (
    <div ref={root} className="relative">
      <button type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pl-2 pr-1 transition-colors hover:bg-muted">
        <span className="hidden flex-col items-end leading-tight sm:flex">
          <span className="text-xs font-medium">{name}</span>
          <span className="text-[11px] text-muted-foreground">Platterly Ops</span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div role="menu" aria-label="Account menu" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-border bg-white p-1 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{email}</p>
          <button type="button" role="menuitem" onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
