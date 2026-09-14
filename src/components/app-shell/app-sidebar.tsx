"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ChefHat, Sparkles, CalendarRange, Settings as SettingsIcon } from "lucide-react";
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
import { SignOutButton } from "@/app/kitchenlogin/_components/sign-out-button";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Menu Catalog", href: "/menu-catalog", icon: ChefHat },
  { label: "Add-ons", href: "/addons", icon: Sparkles },
  { label: "Events", href: "/events", icon: CalendarRange },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
] as const;

export function AppSidebar({ organizationName }: { organizationName: string }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />} className="cursor-pointer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/platterly-logo.svg"
                alt="Platterly"
                className="h-6 w-auto shrink-0 group-data-[collapsible=icon]:hidden"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/platterly-mark.svg"
                alt="Platterly"
                className="hidden size-6 shrink-0 group-data-[collapsible=icon]:block"
              />
              <span className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{organizationName}</span>
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <SignOutButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
