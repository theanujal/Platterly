"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Megaphone, ChefHat, Receipt, ChevronsUpDown, Crown, LayoutDashboard, Users, Check } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PRODUCTS, productForPath } from "@/lib/products";
import { SignOutButton } from "./sign-out-button";

const ICONS = { users: Users, crown: Crown, chef: ChefHat } as const;

function NavLink({ href, label, icon: Icon, pathname }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={label} render={<Link href={href} />} className="cursor-pointer">
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * The Super Admin's sidebar: brand, a product switcher, a Platform group that spans every product, then one group for
 * the chosen product. The switcher is there from day one so a second product needs no redesign.
 */
export function SuperSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const product = productForPath(pathname);
  const ProductIcon = ICONS[product.icon];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/super/dashboard" />} className="cursor-pointer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/platterly-mark.svg" alt="Platterly" className="size-6 shrink-0" />
              <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">Platterly</span>
                <span className="truncate text-xs text-muted-foreground">Super Admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="group-data-[collapsible=icon]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="product-switcher"
              aria-label="Switch product"
              className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-background px-2.5 py-2 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ProductIcon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{product.label}</span>
                <span className="text-[11px] font-normal text-muted-foreground">Product</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              {PRODUCTS.map((p) => {
                const Icon = ICONS[p.icon];
                return (
                  <DropdownMenuItem key={p.key} onClick={() => router.push(p.navItems[0].href)}>
                    <Icon />
                    <span className="flex-1">{p.label}</span>
                    {p.key === product.key && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavLink href="/super/dashboard" label="Overview" icon={LayoutDashboard} pathname={pathname} />
              <NavLink href="/super/reports" label="Reports" icon={BarChart3} pathname={pathname} />
              <NavLink href="/super/billing" label="Billing details" icon={Receipt} pathname={pathname} />
              <NavLink href="/super/notice" label="Sidebar notice" icon={Megaphone} pathname={pathname} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{product.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {product.navItems.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} icon={ICONS[item.icon]} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-2 pt-3 group-data-[collapsible=icon]:hidden">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{userName.slice(0, 1).toUpperCase()}</span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="text-[11px] text-muted-foreground">Super Admin</span>
          </span>
        </div>
        <SignOutButton />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
