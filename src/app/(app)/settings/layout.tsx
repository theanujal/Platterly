import Link from "next/link";
import { requireActiveOrganization } from "@/lib/auth/require-session";

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

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireActiveOrganization();

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 md:flex-row">
      <nav className="flex shrink-0 flex-col gap-5 md:w-56">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <h2 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h2>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
