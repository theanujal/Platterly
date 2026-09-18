import type { Metadata } from "next";
import { requireActiveOrganization, hasPermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { slugify } from "@/modules/tenants/slug";
import { getDashboardSnapshot } from "./_data";
import { OnboardingNudgeBanner } from "./_components/onboarding-nudge-banner";
import { CustomLinkDialog } from "./_components/custom-link-dialog";
import { DashboardKpis } from "./_components/dashboard-kpis";
import { OrdersActivityCard } from "./_components/orders-activity-card";
import { NeedsAttentionCard } from "./_components/needs-attention-card";
import { QuickActionsCard } from "./_components/quick-actions-card";
import { UpcomingEventsCard } from "./_components/upcoming-events-card";
import { OrdersCalendarCard } from "./_components/orders-calendar-card";
import { InventoryOverviewCard } from "./_components/inventory-overview-card";
import { PartialPaymentsCard } from "./_components/partial-payments-card";
import { PublicMenuShortcutCard } from "./_components/public-menu-shortcut-card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Dashboard — Platterly",
  robots: { index: false, follow: false },
};

// Business Command Centre: welcome header -> colorful KPI grid -> Quick
// Actions (full width) -> dominant Orders activity (revenue trend + recent
// orders, with Public Menu/QR and Needs Attention stacked alongside) ->
// Inventory Status / Partial Payments / Orders Calendar status cards (3
// columns) -> Upcoming Events (full width). Matches AJ's reference
// screenshot exactly (2026-09-17) — Quick Actions was previously stacked at
// the bottom of the right-hand column instead of its own full-width row.
// Every module reads real data from the modules that already exist (Orders,
// Events, Quotations, Inventory, Public Menu) — see ./_data.ts for the
// shared query.
export default async function DashboardPage() {
  const { session, organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const suggestedSlug = organization.name !== "Unnamed Business" ? slugify(organization.name) : undefined;
  const snapshot = await getDashboardSnapshot(organizationId);
  // Only the person who can actually save a slug change should see the
  // popup nudging them to (AJ, 2026-09-19) — it was showing to every role,
  // including staff who'd just hit a permission error trying to use it.
  const canClaimLink = await hasPermission({ tenant: ["edit"] }, organizationId);

  const firstName = session.user.firstName ?? session.user.name.split(" ")[0];
  const lastName = session.user.lastName ?? "";

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 md:p-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome back, {firstName} {lastName}
          </h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening with {organization.name}.</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>
      <Separator />

      {!organization.onboardingCompletedAt && <OnboardingNudgeBanner />}

      <DashboardKpis
        statusBreakdown={snapshot.statusBreakdown}
        outstandingBalance={snapshot.outstandingBalance}
        outstandingOrdersCount={snapshot.outstandingOrdersCount}
      />

      <QuickActionsCard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OrdersActivityCard
            revenueTrend={snapshot.revenueTrend}
            recentOrders={snapshot.recentOrders}
            totalOrders={snapshot.totalOrders}
          />
        </div>
        <div className="flex flex-col gap-4">
          <PublicMenuShortcutCard slug={organization.slug} slugChangeCount={organization.slugChangeCount} />
          <NeedsAttentionCard
            draftOrders={snapshot.draftOrders}
            outstandingOrdersCount={snapshot.outstandingOrdersCount}
            outstandingBalance={snapshot.outstandingBalance}
            quotationsAwaitingResponse={snapshot.quotationsAwaitingResponse}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InventoryOverviewCard organizationId={organizationId} />
        <PartialPaymentsCard organizationId={organizationId} />
        <OrdersCalendarCard orderCountsByDay={snapshot.orderCountsByDay} />
      </div>

      <UpcomingEventsCard events={snapshot.upcomingEvents} />

      <CustomLinkDialog suggestedSlug={suggestedSlug} defaultOpen={canClaimLink && organization.slugChangeCount === 0} />
    </main>
  );
}
