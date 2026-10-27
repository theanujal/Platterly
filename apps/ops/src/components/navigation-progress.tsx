"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar along the top from the click on an in-app link until the next page arrives. Without it a slow page looks
 * like a dead click and gets clicked again. loading.tsx only covers a change of section; this covers every link,
 * including a business opened from the list and a tab on the same page.
 */
export function NavigationProgress() {
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  // The page the click happened on: the bar shows until the address moves on from it.
  const [clickedOn, setClickedOn] = useState<string | null>(null);
  // Once the address changes the click is done; forget it, or coming Back to that page would show the bar again.
  const [seen, setSeen] = useState(here);
  if (seen !== here) {
    setSeen(here);
    setClickedOn(null);
  }
  const busy = clickedOn === here;
  useEffect(() => {
    if (!busy) return;
    // A link that never changes the address (a file download, say) must not leave the bar up.
    const giveUp = setTimeout(() => setClickedOn(null), 15_000);
    return () => clearTimeout(giveUp);
  }, [busy]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
      setClickedOn(here);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [here]);
  return busy ? <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-primary" /> : null;
}
