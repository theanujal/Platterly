"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Boxes, Building2, Crown, LayoutDashboard, LogOut, Receipt } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Boxes },
  { href: "/businesses", label: "Businesses", icon: Building2 },
  { href: "/plans", label: "Plans", icon: Crown },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/alerts", label: "Alerts", icon: Bell },
] as const;

export function AppNav({ openAlerts, staffName, staffEmail, compact = false }: { openAlerts: number; staffName: string; staffEmail: string; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <nav aria-label="Main" className={compact ? "flex flex-wrap items-center gap-1" : "flex flex-1 flex-col gap-1"}>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-sidebar-accent"}`}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
            {href === "/alerts" && openAlerts > 0 ? <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/25" : "bg-primary/15 text-accent-foreground"}`}>{openAlerts}</span> : null}
          </Link>
        );
      })}
      <div className={compact ? "ml-auto flex items-center gap-2" : "mt-auto border-t border-sidebar-border pt-3"}>
        {compact ? null : (
          <div className="mb-2 px-3">
            <p className="truncate text-sm font-medium">{staffName}</p>
            <p className="truncate text-xs text-muted-foreground">{staffEmail}</p>
          </div>
        )}
        <button type="button" onClick={signOut} className="flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-foreground hover:bg-sidebar-accent">
          <LogOut className="size-4" aria-hidden />
          <span>Sign out</span>
        </button>
      </div>
    </nav>
  );
}
