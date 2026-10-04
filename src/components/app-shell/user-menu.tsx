"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, LogOut, Settings as SettingsIcon } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The name at the top right (AJ, 2026-10-04): Settings, Billing (the Subscription tab in Settings) and Sign out live
 * here instead of at the bottom of the sidebar. Settings and Billing show only for a role that can open Settings.
 */
export function UserMenu({ fullName, email, initials, canOpenSettings }: { fullName: string; email: string; initials: string; canOpenSettings: boolean }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {canOpenSettings && (
          <>
            <DropdownMenuLinkItem closeOnClick render={<Link href="/settings" />}>
              <SettingsIcon /> Settings
            </DropdownMenuLinkItem>
            <DropdownMenuLinkItem closeOnClick render={<Link href="/settings/subscription" />}>
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
