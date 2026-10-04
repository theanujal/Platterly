"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, ChefHat, Boxes, Users, FileText, ShoppingCart, ShoppingBasket, ClipboardCheck, Flame, Receipt, Wallet, BarChart3, UserRoundCog } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NoticeBox, UpgradeCard, type SidebarNotice } from "@/components/app-shell/upgrade-card";
import { NAV_PERMISSIONS } from "@/components/app-shell/nav-permissions";
import { NAV_GROUPS, type NavGroupId } from "@/components/app-shell/nav-groups";

// AJ's explicit nav order, 2026-09-19 — 3 groups (sales/catalog, inventory,
// kitchen), each its own SidebarMenu so a SidebarSeparator can mark the
// boundary between "everything related to inventory" and "everything
// related to kitchen".
const SALES_AND_CATALOG_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: ShoppingCart },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Abandoned Orders", href: "/abandoned-orders", icon: ShoppingBasket },
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Menu Catalog", href: "/menu-catalog", icon: ChefHat },
] as const;

// Merged entries (AJ, 2026-10-04): one menu item, several pages as tabs. `groupId` points at NAV_GROUPS.
const FINANCE_ITEM = { label: "Finance", groupId: "finance", icon: Wallet } as const;
const REPORTS_ITEM = { label: "Reports & Activity", groupId: "reports", icon: BarChart3 } as const;
const STOCK_ITEM = { label: "Stock & Supplies", groupId: "stock", icon: Boxes } as const;

const KITCHEN_ITEMS = [
  { label: "Menu Approvals", href: "/menu-approvals", icon: ClipboardCheck },
  { label: "Kitchen Dashboard", href: "/kitchen-dashboard", icon: Flame },
  { label: "Staff", href: "/staff", icon: UserRoundCog },
] as const;

interface NavItem {
  label: string;
  href: string;
  /** Other addresses that keep this entry highlighted (the other tabs of a merged entry). */
  also?: readonly string[];
  icon: React.ComponentType<{ className?: string }>;
}

const on = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** A merged entry as a plain nav item: it opens the first tab this role may open, and is lit on any of its tabs. */
function groupItem(entry: { label: string; groupId: NavGroupId; icon: NavItem["icon"] }, allowedHrefs: string[]): NavItem | null {
  const tabs = NAV_GROUPS[entry.groupId].tabs.filter((t) => allowedHrefs.includes(t.href));
  if (tabs.length === 0) return null;
  return { label: entry.label, href: tabs[0].href, also: tabs.map((t) => t.href), icon: entry.icon };
}

function NavItemGroup({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  if (items.length === 0) return null;
  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = on(pathname, item.href) || (item.also ?? []).some((h) => on(pathname, h));
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={isActive}
              tooltip={item.label}
              render={<Link href={item.href} />}
              className="cursor-pointer"
            >
              <item.icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

interface AppSidebarProps {
  organizationName: string;
  /** Links the signed-in role may open; anything in `NAV_PERMISSIONS` that is missing here is hidden. */
  allowedHrefs: string[];
  /** The Super Admin's own box. When present it replaces the trial card for every kitchen. */
  notice: SidebarNotice | null;
  /** Set only while the kitchen is on a free trial; null otherwise (nothing shows for a paid plan). */
  trial: { trialDaysLeft: number | null; trialTotalDays: number | null } | null;
}

export function AppSidebar({ organizationName, trial, notice, allowedHrefs }: AppSidebarProps) {
  const pathname = usePathname();
  const visible = <T extends NavItem>(items: readonly T[]) => items.filter((item) => !(item.href in NAV_PERMISSIONS) || allowedHrefs.includes(item.href));
  const finance = groupItem(FINANCE_ITEM, allowedHrefs);
  const reports = groupItem(REPORTS_ITEM, allowedHrefs);
  const stock = groupItem(STOCK_ITEM, allowedHrefs);
  const salesItems = [...visible(SALES_AND_CATALOG_ITEMS), ...(finance ? [finance] : [])];
  const inventoryItems = stock ? [stock] : [];
  const kitchenItems = visible(KITCHEN_ITEMS);
  const adminItems = reports ? [reports] : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />} className="cursor-pointer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/platterly-mark.svg" alt="Platterly" className="size-6 shrink-0" />
              <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">Platterly</span>
                <span className="truncate text-xs text-muted-foreground">{organizationName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavItemGroup items={salesItems} pathname={pathname} />
            {inventoryItems.length > 0 && <SidebarSeparator />}
            <NavItemGroup items={inventoryItems} pathname={pathname} />
            {kitchenItems.length > 0 && <SidebarSeparator />}
            <NavItemGroup items={kitchenItems} pathname={pathname} />
            {adminItems.length > 0 && <SidebarSeparator />}
            <NavItemGroup items={adminItems} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3">
        {(notice || trial) && (
          <div className="group-data-[collapsible=icon]:hidden">
            {notice ? <NoticeBox notice={notice} /> : trial && <UpgradeCard trialDaysLeft={trial.trialDaysLeft} trialTotalDays={trial.trialTotalDays} />}
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
