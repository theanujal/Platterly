import Link from "next/link";

/** Tabs that are links (`?tab=`), so a tab can be bookmarked and the page stays server-rendered. */
export function Tabs({ base, tabs, current }: { base: string; tabs: { id: string; label: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link key={t.id} href={`${base}?tab=${t.id}`} aria-current={t.id === current ? "page" : undefined} className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${t.id === current ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {t.label}
          {t.count ? <span className="rounded-full bg-secondary px-1.5 text-xs text-muted-foreground">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
