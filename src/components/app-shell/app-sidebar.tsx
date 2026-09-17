"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ChefHat, Sparkles, Boxes, Users, FileText, ShoppingCart, Settings2, Settings as SettingsIcon } from "lucide-react";
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
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "@/app/kitchenlogin/_components/sign-out-button";
import { UpgradeCard } from "@/components/app-shell/upgrade-card";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Menu Catalog", href: "/menu-catalog", icon: ChefHat },
  { label: "Add-ons", href: "/addons", icon: Sparkles },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Orders", href: "/orders", icon: ShoppingCart },
  { label: "Event Types", href: "/events", icon: Settings2 },
] as const;

interface AppSidebarProps {
  organizationName: string;
  /** Null when the tenant has no active subscription row at all — the card is skipped rather than showing a fabricated plan. */
  subscription: { planName: string; isTrialing: boolean; trialDaysLeft: number | null } | null;
}

export function AppSidebar({ organizationName, subscription }: AppSidebarProps) {
  const pathname = usePathname();

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
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3">
        {subscription && (
          <div className="group-data-[collapsible=icon]:hidden">
            <UpgradeCard
              planName={subscription.planName}
              isTrialing={subscription.isTrialing}
              trialDaysLeft={subscription.trialDaysLeft}
            />
          </div>
        )}
        <Separator className="group-data-[collapsible=icon]:hidden" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/settings" || pathname.startsWith("/settings/")}
              tooltip="Settings"
              render={<Link href="/settings" />}
              className="cursor-pointer"
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SignOutButton className="w-full justify-start rounded-md px-4 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2!" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
