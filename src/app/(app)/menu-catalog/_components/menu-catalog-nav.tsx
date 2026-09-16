"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutGrid, UtensilsCrossed } from "lucide-react";
import { cn } from "cn";

// Display order/labels only (AJ, 2026-09-14) — routes/model names are
// unchanged: /menu-catalog/menus is still "Menu Types", etc.
const NAV_ITEMS = [
  { label: "Menu Types", href: "/menu-catalog/menus", icon: BookOpen },
  { label: "Menu Categories", href: "/menu-catalog/categories", icon: LayoutGrid },
  { label: "Food Items", href: "/menu-catalog/items", icon: UtensilsCrossed },
] as const;

// AJ's reference screenshot, 2026-09-17 — the sub-nav needs its own active/
// hover states (icon + left accent bar + tinted background on the current
// page), not just plain text links. A client component (usePathname) rather
// than the Server Component layout it lives in, same reason CatalogBrowser
// is one: this is the one piece of the page that needs live route state.
export function MenuCatalogNav() {
  const pathname = usePathname();

  return (
    // Full-bleed panel (AJ, 2026-09-17) — no radius/outer margin, so it
    // touches the main sidebar and runs the full height of the row; the
    // content column (in the layout) carries its own padding instead.
    <nav className="flex shrink-0 flex-col gap-1 bg-secondary px-4 py-6 md:w-52">
      <h2 className="px-3 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Menu Catalog</h2>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              // h-11, matching the primary sidebar's own nav-item height
              // (AJ, 2026-09-17) — was noticeably more compact before.
              "flex h-11 items-center gap-2.5 rounded-lg border-l-2 border-transparent px-3 text-sm font-medium transition-colors",
              // hover:bg-background (white), not hover:bg-muted/secondary —
              // the panel itself is bg-secondary, so a same-tone hover would
              // be invisible against it.
              active ? "border-primary bg-accent text-accent-foreground" : "text-foreground hover:bg-background",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
