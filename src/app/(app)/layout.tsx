import { cookies } from "next/headers";
import { requireActiveOrganization, hasPermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { getActiveNotice } from "@/modules/subscriptions/platform-notice";
import { getCurrentSubscription } from "@/modules/subscriptions/subscription";
import { opsBillingOn } from "@/modules/ops-link/config";
import { getEntitlements } from "@/modules/ops-link/entitlements";
import { TRIAL_DURATION_DAYS } from "@/modules/subscriptions/trial-plan";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { NAV_PERMISSIONS } from "@/components/app-shell/nav-permissions";
import { UserMenu } from "@/components/app-shell/user-menu";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { getInbox } from "@/modules/notifications/inbox";
import { getPushState, vapidPublicKey } from "@/modules/notifications/push";
import { PushPrompt } from "@/components/push/push-prompt";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";
import { LocationSwitcher } from "@/components/app-shell/location-switcher";
import { getActiveLocation } from "@/modules/locations/active-location";
import { listLocations } from "@/modules/locations/locations";
import { GlobalSearch } from "@/components/app-shell/global-search";

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
  const [organization, subscription, inbox, push] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    }),
    getCurrentSubscription(organizationId),
    getInbox(organizationId, session.user.id),
    getPushState(session.user.id),
  ]);

  const activeLocation = await getActiveLocation(organizationId, session.user.id);
  const switcherLocations = activeLocation.canSwitch ? await listLocations(organizationId) : [];

  // Links the role can't open are left out of the sidebar. Each page still enforces its own permission.
  const navHrefs = Object.keys(NAV_PERMISSIONS);
  const navAllowed = await Promise.all(navHrefs.map((href) => hasPermission(NAV_PERMISSIONS[href], organizationId)));
  const allowedHrefs = navHrefs.filter((_, index) => navAllowed[index]);

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarState !== "false";

  // With OPS_BILLING on the trial's dates come from the entitlement snapshot (ops owns the subscription); otherwise from the plan rows.
  const ops = opsBillingOn() ? await getEntitlements(organizationId) : null;
  const trial = ops
    ? ops.status === "TRIALING" && !ops.locked
      ? { trialDaysLeft: ops.trialEndsAt ? daysUntil(ops.trialEndsAt) : null, trialTotalDays: TRIAL_DURATION_DAYS }
      : null
    : subscription?.status === "TRIALING"
      ? { trialDaysLeft: subscription.trialEndsAt ? daysUntil(subscription.trialEndsAt) : null, trialTotalDays: subscription.subscriptionPlan.trialDurationDays }
      : null;
  const notice = await getActiveNotice(organizationId);

  const fullName = `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() || session.user.name;
  const initials =
    ((session.user.firstName?.[0] ?? session.user.name[0] ?? "") + (session.user.lastName?.[0] ?? "")).toUpperCase() || "U";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar organizationName={organization.name} trial={trial} notice={notice} allowedHrefs={allowedHrefs} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex flex-1 justify-center px-2 sm:justify-start">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {activeLocation.canSwitch && <LocationSwitcher locations={switcherLocations.map((l) => ({ id: l.id, name: l.name }))} activeId={activeLocation.locationId} />}
            <NotificationBell onRead={markNotificationReadAction} onReadAll={markAllNotificationsReadAction} unread={inbox.unread} items={inbox.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} />
            <UserMenu fullName={fullName} email={session.user.email} initials={initials} canOpenSettings={allowedHrefs.includes("/settings")} />
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <PushPrompt
          show={push.showPrompt}
          vapidPublicKey={vapidPublicKey()}
          settingsHref="/settings/communication/push-notifications"
          benefits={["New orders and customer replies", "Event reminders before your catering events", "Payments received and UPI payments to confirm"]}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
