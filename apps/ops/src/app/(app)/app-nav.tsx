"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Building2, Crown, Globe, LayoutDashboard, LogOut, Megaphone, Receipt, BarChart3, Settings, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PLATFORM: Item[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/businesses", label: "Businesses", icon: Building2 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/site", label: "Website", icon: Globe },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];
const PRODUCT: Item[] = [
  { href: "/plans", label: "Plans", icon: Crown },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/notices", label: "Sidebar notice", icon: Megaphone },
];

export function AppNav({ unread, productName, staffName, staffEmail, compact = false }: { unread: number; productName: string | null; staffName: string; staffEmail: string; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  const link = ({ href, label, icon: Icon }: Item) => {
    const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-sidebar-accent"}`}>
        <Icon className="size-4" aria-hidden />
        <span>{label}</span>
        {href === "/notifications" && unread > 0 ? <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/25" : "bg-primary/15 text-accent-foreground"}`}>{unread}</span> : null}
      </Link>
    );
  };
  const heading = (text: string) => (compact ? null : <p className="mb-1 mt-4 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{text}</p>);

  return (
    <nav aria-label="Main" className={compact ? "flex flex-wrap items-center gap-1" : "flex flex-1 flex-col gap-1"}>
      {heading("Platform")}
      {PLATFORM.map(link)}
      {heading(productName ?? "Product")}
      {PRODUCT.map(link)}
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
