"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CreditCard, Crown, ExternalLink, LogOut, Settings as SettingsIcon, Store, UserRound } from "lucide-react";
import { signOutAndLeave } from "@/lib/auth/client-sign-out";
import { Badge } from "@/components/ui/badge";
import { FacebookIcon, InstagramIcon, LinkedinIcon } from "@/components/ui/brand-icons";
import { CopyButton } from "@/components/ui/copy-button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "cn";

/** Platterly's own social profiles (the same three the marketing site and the Platform's account drawer link to). */
const SOCIAL = [
  { name: "Facebook", Icon: FacebookIcon, href: "https://www.facebook.com/platterlyindia" },
  { name: "Instagram", Icon: InstagramIcon, href: "https://www.instagram.com/platterlyindia/" },
  { name: "LinkedIn", Icon: LinkedinIcon, href: "https://www.linkedin.com/company/platterlyindia" },
];

export type DrawerUsage = { key: string; label: string; used: number; limit: number | null };
export type DrawerPlan = { name: string; status: string; detail: string };

/**
 * The name at the top right opens a drawer from the right (AJ, 2026-11-15), in place of the small menu: who you are, the business, the way to the Account and the Store (links, not a second "My Account" under the email),
 * Settings and Billing, the plan and how much of it is used, and Sign out fixed at the bottom. Name, phone, email and password live only in the Platterly Account;
 * the Store and the plan are the Business Admin's (the crown). Plan and usage show only to roles with "Billing and Plan".
 */
export function UserMenu({
  fullName, email, initials, image, businessName, logo, isAdmin, canOpenSettings, accountUrl, showBilling, storeUrl, plan, usage,
}: {
  fullName: string;
  email: string;
  initials: string;
  /** The person's Platterly Account photo, when they have one. */
  image: string | null;
  businessName: string;
  logo: string | null;
  isAdmin: boolean;
  canOpenSettings: boolean;
  accountUrl: string;
  showBilling: boolean;
  storeUrl: string | null;
  plan: DrawerPlan | null;
  usage: DrawerUsage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const signOut = () => signOutAndLeave(router);
  const linkClass = "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Account menu"
        className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-1 pl-2 transition-colors hover:bg-muted"
      >
        <div className="hidden flex-col items-end leading-tight sm:flex">
          <span className="text-xs font-medium">{fullName}</span>
          <span className="text-[11px] text-muted-foreground">{businessName}</span>
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- the person's photo from their Platterly Account, a signed address on another host
          <img src={image} alt="" className="size-8 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</div>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-sm" data-testid="account-drawer">
        <SheetTitle className="sr-only">Account</SheetTitle>
        <SheetDescription className="sr-only">Your account, plan and usage</SheetDescription>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-1.5 border-b border-border bg-muted/40 px-6 pt-10 pb-6 text-center">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the business's own uploaded logo
              <img src={logo} alt="" className="size-20 rounded-full border border-border bg-background object-cover" />
            ) : image ? (
              // eslint-disable-next-line @next/next/no-img-element -- the person's photo from their Platterly Account
              <img src={image} alt="" className="size-20 rounded-full border border-border bg-background object-cover" />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">{initials}</div>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-base font-semibold" data-testid="drawer-name">
              {isAdmin && <Crown className="size-4 text-warning" aria-label="Business Admin" />}
              {fullName}
            </p>
            <p className="text-sm text-muted-foreground">{businessName}</p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {email}
              <CopyButton value={email} label="Copy email" iconOnly />
            </p>
            {isAdmin && <Badge variant="warning">Business Admin</Badge>}
          </div>

          <nav className="grid grid-cols-2 gap-1 border-b border-border p-3" aria-label="Account links">
            <a href={accountUrl} className={linkClass}><UserRound className="size-4 text-muted-foreground" /> Account</a>
            {storeUrl && <a href={storeUrl} className={linkClass}><Crown className="size-4 text-warning" /> Store</a>}
            {canOpenSettings && <Link href="/settings" className={linkClass} onClick={() => setOpen(false)}><SettingsIcon className="size-4 text-muted-foreground" /> Settings</Link>}
            {showBilling && <Link href="/settings/subscription" className={linkClass} onClick={() => setOpen(false)}><CreditCard className="size-4 text-muted-foreground" /> Billing</Link>}
          </nav>

          {showBilling && plan && (
            <section className="flex flex-col gap-1 border-b border-border px-6 py-5" data-testid="drawer-plan">
              <h2 className="text-sm font-semibold">Subscription</h2>
              <p className="text-sm">You are on the <span className="font-medium">{plan.name}</span> plan</p>
              <p className="text-sm text-muted-foreground">{plan.detail}</p>
            </section>
          )}

          {showBilling && usage.length > 0 && (
            <section className="flex flex-col gap-4 px-6 py-5" data-testid="drawer-usage">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Plan usage</h2>
                {storeUrl && <a href={storeUrl} className="text-sm font-medium text-primary hover:underline">Manage plan</a>}
              </div>
              {usage.map((row) => <UsageBar key={row.key} row={row} />)}
            </section>
          )}

          <section className="flex flex-col gap-3 border-t border-border px-6 py-5" data-testid="drawer-social" aria-label="Follow Platterly">
            <h2 className="text-sm font-semibold">Follow us</h2>
            <div className="flex gap-2.5">
              {SOCIAL.map(({ name, Icon, href }) => (
                <a key={name} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Platterly on ${name}`} className="flex size-[38px] items-center justify-center rounded-[10px] border border-border text-foreground transition-colors hover:bg-muted hover:text-primary">
                  <Icon className="size-[18px]" />
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="border-t border-border bg-muted/40 p-3">
          <button type="button" onClick={signOut} className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold tracking-wide text-destructive uppercase transition-colors hover:bg-destructive/10">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** One limit: used against what the plan allows. Amber from 80%, red at the limit; an unlimited plan shows the count only. */
function UsageBar({ row }: { row: DrawerUsage }) {
  const unlimited = row.limit === null;
  const percent = unlimited || row.limit === 0 ? 0 : Math.min(100, Math.round((row.used / (row.limit as number)) * 100));
  const tone = percent >= 100 ? "[&_[data-slot=progress-indicator]]:bg-destructive" : percent >= 80 ? "[&_[data-slot=progress-indicator]]:bg-warning" : "";
  return (
    <div className="flex flex-col gap-1.5" data-testid={`usage-${row.key}`}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="whitespace-nowrap">{row.label}</span>
        <span className="text-right text-muted-foreground">{unlimited ? `${row.used.toLocaleString("en-IN")} used · Unlimited plan` : `${row.used.toLocaleString("en-IN")} of ${(row.limit as number).toLocaleString("en-IN")} used`}</span>
      </div>
      <Progress value={percent} aria-label={`${row.label} used`} className={cn("gap-0 [&_[data-slot=progress-track]]:h-2", tone)} />
    </div>
  );
}
