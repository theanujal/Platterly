import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

export interface TeamTab {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

/**
 * The four Team Management tabs. Driven by `?tab=` (real links, not client
 * state) so each tab is deep-linkable and the invite form can send the user
 * straight to "Pending Invitations" after a successful invite. Styled like
 * the app's other tab bars (orders/_components/form-tabs.tsx): underline,
 * primary when active.
 */
export function TeamTabs({ tabs, active }: { tabs: TeamTab[]; active: string }) {
  return (
    <div role="tablist" aria-label="Team management" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(({ id, label, icon: Icon, count }) => (
        <Link
          key={id}
          role="tab"
          aria-selected={active === id}
          href={id === "members" ? "/settings/team" : `/settings/team?tab=${id}`}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            active === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
          {count ? <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{count}</span> : null}
        </Link>
      ))}
    </div>
  );
}
