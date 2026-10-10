"use client";

import Link from "next/link";
import { ChevronDown, ChefHat, FileText, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The header's primary action: "New Order", with a chevron for the other quick starts (the old Quick Actions card).
 * Each entry only appears when the role may use it; with none besides the order there is no chevron.
 */
export function NewOrderMenu({ allowed }: { allowed: { order: boolean; quotation: boolean; lead: boolean; catalog: boolean } }) {
  const others = [
    allowed.quotation && { href: "/quotations/new", label: "New Quotation", icon: FileText },
    allowed.lead && { href: "/customers", label: "New Customer / Lead", icon: Users },
    allowed.catalog && { href: "/menu-catalog", label: "Menu Catalog", icon: ChefHat },
  ].filter((entry): entry is { href: string; label: string; icon: typeof FileText } => Boolean(entry));

  if (!allowed.order && others.length === 0) return null;

  return (
    <div className="inline-flex">
      {allowed.order ? (
        <Button render={<Link href="/orders/new" />} nativeButton={false} className={others.length > 0 ? "rounded-r-none" : undefined}>
          <Plus /> New Order
        </Button>
      ) : null}
      {others.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="More ways to start"
                className={allowed.order ? "rounded-l-none border-l border-primary-foreground/30 px-3" : undefined}
              />
            }
          >
            {allowed.order ? <ChevronDown /> : <>Create <ChevronDown /></>}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {others.map((entry) => (
              <DropdownMenuLinkItem key={entry.href} render={<Link href={entry.href} />}>
                <entry.icon />
                {entry.label}
              </DropdownMenuLinkItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
