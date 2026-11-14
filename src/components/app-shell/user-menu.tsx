"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CreditCard, ExternalLink, LogOut, Settings as SettingsIcon, UserRound } from "lucide-react";
import { signOutAndLeave } from "@/lib/auth/client-sign-out";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The name at the top right (AJ, 2026-10-04): Settings, Billing (the Subscription tab in Settings) and Sign out live
 * here instead of at the bottom of the sidebar. Settings and Billing show only for a role that can open Settings.
 */
export function UserMenu({ fullName, email, initials, canOpenSettings, accountUrl }: { fullName: string; email: string; initials: string; canOpenSettings: boolean; accountUrl: string }) {
  const router = useRouter();

  async function signOut() {
    await signOutAndLeave(router);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-1 pl-2 transition-colors hover:bg-muted"
      >
        <div className="hidden flex-col items-end leading-tight sm:flex">
          <span className="text-xs font-medium">{fullName}</span>
          <span className="text-[11px] text-muted-foreground">{email}</span>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {/* Name, phone, email and password live only in the Platterly Account (AJ, 2026-11-14). */}
        <DropdownMenuLinkItem closeOnClick render={<a href={accountUrl} />}>
          <UserRound /> Your Account <ExternalLink className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
        </DropdownMenuLinkItem>
        {canOpenSettings && (
          <>
            <DropdownMenuLinkItem closeOnClick render={<Link href="/settings" />}>
              <SettingsIcon /> Settings
            </DropdownMenuLinkItem>
            <DropdownMenuLinkItem closeOnClick render={<Link href="/subscribe" />}>
              <CreditCard /> Billing
            </DropdownMenuLinkItem>
          </>
        )}
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
