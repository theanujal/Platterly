"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, ChefHat, Code2, Coins, CreditCard, FileText, Link2, Lock, Mail, MessageCircle, Trash2, User, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

interface NavGroup {
  label: string;
  items: { label: string; href: string; icon: LucideIcon }[];
}

// Grouped Settings IA matching the product doc's nav (Chunk 5 Group 5.4). Every
// leaf is a real linkable route, gated independently by its own page (a
// manager/staff visiting /settings/team or /settings/danger-zone gets
// redirected/denied there, same as today's Super Admin nav convention of
// always-show/gate-on-visit rather than hiding nav items).
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Account",
    items: [
      { label: "User Profile", href: "/settings/account/user-profile", icon: User },
      { label: "Business Profile", href: "/settings/account/business-profile", icon: Building2 },
      { label: "Change Password", href: "/settings/account/change-password", icon: Lock },
      { label: "Currency Preferences", href: "/settings/account/currency-preferences", icon: Coins },
    ],
  },
  { label: "Kitchen", items: [{ label: "Kitchen Rules", href: "/settings/kitchen/kitchen-rules", icon: ChefHat }] },
  { label: "Team", items: [{ label: "Team Management", href: "/settings/team", icon: Users }] },
  { label: "Subscription", items: [{ label: "Subscription", href: "/settings/subscription", icon: CreditCard }] },
  {
    label: "Integration",
    items: [
      { label: "Platterly Link", href: "/settings/integration/public-menu-link", icon: Link2 },
      { label: "Iframe", href: "/settings/integration/iframe", icon: Code2 },
      { label: "Payments", href: "/settings/integration/payments", icon: Wallet },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "WhatsApp Settings", href: "/settings/communication/whatsapp-settings", icon: MessageCircle },
      { label: "Email Settings", href: "/settings/communication/email-settings", icon: Mail },
      { label: "Push Notifications", href: "/settings/communication/push-notifications", icon: Bell },
      { label: "Invoice Settings", href: "/settings/communication/invoice-settings", icon: FileText },
    ],
  },
  { label: "Danger Zone", items: [{ label: "Delete All Data", href: "/settings/danger-zone", icon: Trash2 }] },
];

// The very same sub-nav as Menu Catalog's (AJ, 2026-09-30): full-bleed
// bg-secondary panel, icon + label rows, and the active page gets the same
// accent fill and ring as Menu Catalog's and the food item drawer's active
// tab. Keep the two in step.
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 flex-col gap-5 bg-secondary px-4 py-6 md:w-60">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  // hover:bg-background (white): the panel is bg-secondary, so a same-tone hover would be invisible.
                  active ? "bg-accent text-accent-foreground ring-1 ring-primary/40" : "text-foreground hover:bg-background",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
