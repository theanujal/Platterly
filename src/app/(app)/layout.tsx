import { cookies } from "next/headers";
import Link from "next/link";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { getCurrentSubscription } from "@/modules/subscriptions/subscription";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { NotificationBell } from "@/components/app-shell/notification-bell";

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

// Shared shell for every caterer-facing, signed-in page (Dashboard, Menu
// Catalog, Settings) — a collapsible left sidebar (AJ's explicit request,
// 2026-09-14) replacing the previous pattern of each top-level route having
// no shared chrome at all. A Next.js route group ((app)) so the URLs
// (/dashboard, /menu-catalog, /settings) are unchanged — this only changes
// where the files live and what wraps them. Each page underneath still
// calls its own requireActiveOrganization()/requirePermission() checks;
// this layout's own call is for the header/org name, not a replacement for
// those per-page gates (defense in depth, same convention Settings' and
// Menu Catalog's own layouts already used before this change).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, organizationId } = await requireActiveOrganization();
  const [organization, subscription] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    }),
    getCurrentSubscription(organizationId),
  ]);

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarState !== "false";

  const subscriptionCardProps = subscription
    ? {
        planName: subscription.subscriptionPlan.name,
        isTrialing: subscription.status === "TRIALING",
        trialDaysLeft: subscription.trialEndsAt ? daysUntil(subscription.trialEndsAt) : null,
      }
    : null;

  const fullName = `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() || session.user.name;
  const initials =
    ((session.user.firstName?.[0] ?? session.user.name[0] ?? "") + (session.user.lastName?.[0] ?? "")).toUpperCase() || "U";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar organizationName={organization.name} subscription={subscriptionCardProps} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium text-muted-foreground">{organization.name}</span>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <Link
              href="/settings/account/user-profile"
              aria-label="Account settings"
              className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-2 transition-colors hover:bg-muted"
            >
              <div className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-xs font-medium">{fullName}</span>
                <span className="text-[11px] text-muted-foreground">{session.user.email}</span>
              </div>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </div>
            </Link>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
