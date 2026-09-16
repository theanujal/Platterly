"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

interface NavGroup {
  label: string;
  items: { label: string; href: string }[];
}

// Chunk 5 Group 5.4 — grouped Settings IA matching the product doc's nav
// exactly. Every leaf is a real linkable route, gated independently by its
// own page (a manager/staff visiting /settings/team or /settings/danger-zone
// gets redirected/denied there, same as today's Super Admin nav convention
// of always-show/gate-on-visit rather than hiding nav items).
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Account",
    items: [
      { label: "User Profile", href: "/settings/account/user-profile" },
      { label: "Business Profile", href: "/settings/account/business-profile" },
      { label: "Change Password", href: "/settings/account/change-password" },
      { label: "Currency Preferences", href: "/settings/account/currency-preferences" },
    ],
  },
  { label: "Team", items: [{ label: "Team Management", href: "/settings/team" }] },
  { label: "Subscription", items: [{ label: "Subscription", href: "/settings/subscription" }] },
  { label: "Integration", items: [{ label: "Public Menu Link", href: "/settings/integration/public-menu-link" }] },
  {
    label: "Communication",
    items: [
      { label: "SMS Settings", href: "/settings/communication/sms-settings" },
      { label: "Push Notifications", href: "/settings/communication/push-notifications" },
      { label: "Invoice Settings", href: "/settings/communication/invoice-settings" },
    ],
  },
  { label: "Danger Zone", items: [{ label: "Delete All Data", href: "/settings/danger-zone" }] },
];

// Same sub-nav visual language as Menu Catalog's (AJ, 2026-09-17): full-bleed
// bg-secondary panel, active item gets a left accent bar + tinted
// background, hover lifts to white. No per-item icons here — unlike Menu
// Catalog's 3 flat entities, Settings' items are grouped and don't have an
// established 1:1 icon set; forcing one on would invent meaning that isn't
// there.
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 flex-col gap-5 bg-secondary px-4 py-6 md:w-56">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <h2 className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  // h-11, matching the primary sidebar's nav-item height (AJ, 2026-09-17).
                  "flex h-11 items-center rounded-lg border-l-2 border-transparent px-3 text-sm font-medium transition-colors",
                  active ? "border-primary bg-accent text-accent-foreground" : "text-foreground hover:bg-background",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
