import type { Metadata } from "next";
import { requireActiveOrganization, hasPermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { slugify } from "@/modules/tenants/slug";
import { getActiveLocation } from "@/modules/locations/active-location";
import { getDashboardSnapshot } from "./_data";
import { OnboardingNudgeBanner } from "./_components/onboarding-nudge-banner";
import { CustomLinkDialog } from "./_components/custom-link-dialog";
import { DashboardHeader } from "./_components/dashboard-header";
import { KpiTiles } from "./_components/kpi-tiles";
import { OrdersActivityCard } from "./_components/orders-activity-card";
import { EventTypeCard } from "./_components/event-type-card";
import { TodaysOrdersCard } from "./_components/todays-orders-card";
import { NeedsAttentionCard } from "./_components/needs-attention-card";
import { OrdersCalendarCard } from "./_components/orders-calendar-card";
import { KitchenWorkloadCard } from "./_components/kitchen-workload-card";
import { InventoryOverviewCard } from "./_components/inventory-overview-card";
import { PublicMenuShortcutCard } from "./_components/public-menu-shortcut-card";

export const metadata: Metadata = {
  title: "Dashboard — Platterly",
  robots: { index: false, follow: false },
};

// Business Command Centre (redesigned 2026-10-10 to AJ's reference): greeting + New Order -> five headline numbers ->
// Order Activity chart beside the Public Menu QR over Event Type Distribution -> Orders Calendar, Today's Orders and
// Needs Attention -> Kitchen Workload and Inventory Status. Every card reads real data through ./_data.ts and shows only
// what the signed-in role may see.
export default async function DashboardPage() {
  const { session, organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const suggestedSlug = organization.name !== "Unnamed Business" ? slugify(organization.name) : undefined;
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  const snapshot = await getDashboardSnapshot(organizationId, locationId);
  // Only the person who can actually save a slug change should see the
  // popup nudging them to (AJ, 2026-09-19) — it was showing to every role,
  // including staff who'd just hit a permission error trying to use it.
  const [canClaimLink, canViewOrders, canSell, canViewPayments, canViewInventory, canCreateQuotation, canViewQuotations, canViewCustomers, canViewMenus] =
    await Promise.all([
      hasPermission({ tenant: ["edit"] }, organizationId),
      hasPermission({ orders: ["view"] }, organizationId),
      hasPermission({ orders: ["create"] }, organizationId),
      hasPermission({ payments: ["view"] }, organizationId),
      hasPermission({ inventory: ["view"] }, organizationId),
      hasPermission({ quotations: ["create"] }, organizationId),
      hasPermission({ quotations: ["view"] }, organizationId),
      hasPermission({ customers: ["view"] }, organizationId),
      hasPermission({ menus: ["view"] }, organizationId),
    ]);
  // Each card shows only what the role can use (e.g. the kitchen role sees order counts and
  // upcoming events, but no revenue, no "create" shortcuts and no setup banner).
  const canSeeMoney = canSell || canViewPayments;

  const firstName = session.user.firstName ?? session.user.name.split(" ")[0];
  const lastName = session.user.lastName ?? "";
  const asRow = (row: (typeof snapshot.orderTabs.today.rows)[number]) => ({
    ...row,
    eventStartDate: row.eventStartDate.toISOString(),
    eventEndDate: row.eventEndDate.toISOString(),
  });
  const tabs = {
    today: { count: snapshot.orderTabs.today.count, rows: snapshot.orderTabs.today.rows.map(asRow) },
    upcoming: { count: snapshot.orderTabs.upcoming.count, rows: snapshot.orderTabs.upcoming.rows.map(asRow) },
    all: { count: snapshot.orderTabs.all.count, rows: snapshot.orderTabs.all.rows.map(asRow) },
  };

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 md:p-8 [&_[data-slot=card]]:[--card-spacing:--spacing(5)]">
      <DashboardHeader
        name={`${firstName} ${lastName}`.trim()}
        businessName={organization.name}
        allowed={{ order: canSell, quotation: canCreateQuotation, lead: canViewCustomers, catalog: canViewMenus }}
      />

      {!organization.onboardingCompletedAt && canClaimLink && <OnboardingNudgeBanner />}

      <KpiTiles
        showOrders={canViewOrders}
        showMoney={canSeeMoney}
        showQuotations={canViewQuotations}
        activeOrders={snapshot.activeOrders}
        needAttention={snapshot.pendingReviewOrders}
        upcomingEvents={snapshot.upcomingEventsCount}
        nextWeekGuests={snapshot.nextWeekGuests}
        pendingRevenue={snapshot.outstandingBalance}
        pendingRevenueOrders={snapshot.outstandingOrdersCount}
        openQuotations={snapshot.openQuotations}
        quotationsAwaiting={snapshot.quotationsAwaitingResponse}
      />

      {canViewOrders && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <OrdersActivityCard activity={snapshot.activity} showMoney={canSeeMoney} />
          </div>
          <div className="flex flex-col gap-6">
            {canSell && <PublicMenuShortcutCard slug={organization.slug} slugChangeCount={organization.slugChangeCount} />}
            <div className="flex-1">
              <EventTypeCard rows={snapshot.eventTypeDistribution} total={snapshot.eventTotal} />
            </div>
          </div>
        </div>
      )}

      {!canViewOrders && canSell && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <PublicMenuShortcutCard slug={organization.slug} slugChangeCount={organization.slugChangeCount} />
        </div>
      )}

      {canViewOrders && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <OrdersCalendarCard orderCountsByDay={snapshot.orderCountsByDay} />
          <TodaysOrdersCard tabs={tabs} />
          <NeedsAttentionCard
            overdue={snapshot.overdue}
            pendingReviewOrders={snapshot.pendingReviewOrders}
            awaitingApprovalOrders={snapshot.awaitingApprovalOrders}
            quotationsAwaitingResponse={snapshot.quotationsAwaitingResponse}
            showMoney={canSeeMoney}
            showOrders={canViewOrders}
            showQuotations={canViewQuotations}
          />
        </div>
      )}

      {(canViewOrders || canViewInventory) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {canViewOrders && <KitchenWorkloadCard rows={snapshot.kitchenWorkload} total={snapshot.kitchenGuestsToday} />}
          {canViewInventory && (
            <InventoryOverviewCard
              lowStock={snapshot.inventory.lowStock}
              expiringSoon={snapshot.inventory.expiringSoon}
              expired={snapshot.inventory.expired}
              keyItems={snapshot.inventory.keyItems}
            />
          )}
        </div>
      )}

      <CustomLinkDialog suggestedSlug={suggestedSlug} defaultOpen={canClaimLink && organization.slugChangeCount === 0} />
    </main>
  );
}
