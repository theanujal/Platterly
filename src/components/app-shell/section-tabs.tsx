import Link from "next/link";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/auth/require-session";
import { NAV_GROUPS, type NavGroupId } from "@/components/app-shell/nav-groups";

/**
 * The tab bar at the top of a merged section (Reports & Activity, Finance, Stock & Supplies). Plain links to the pages
 * themselves; only the tabs this role may open are listed, and nothing renders when only one is left.
 */
export async function SectionTabs({ group, active, organizationId }: { group: NavGroupId; active: string; organizationId: string }) {
  const { label, tabs } = NAV_GROUPS[group];
  const allowed = await Promise.all(tabs.map((t) => hasPermission(t.needs, organizationId)));
  const shown = tabs.filter((_, i) => allowed[i]);
  if (shown.length < 2) return null;
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
      {shown.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            t.href === active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
