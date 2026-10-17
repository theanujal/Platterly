import type { Metadata } from "next";
import { requireActiveOrganization, hasPermission, sensitiveAccess } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { slugify } from "@/modules/tenants/slug";
import { getActiveLocation } from "@/modules/locations/active-location";
import { getDashboardSnapshot, redactDashboardSnapshot } from "./_data";
import { getTenantTimeZone } from "@/lib/settings/timezone";
import { dayKeyInZone, describeRange, parseDashboardRange } from "@/lib/time/date-range";
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
  title: "Dashboard — Caterly",
  robots: { index: false, follow: false },
};

// Business Command Centre (redesigned 2026-10-10 to AJ's reference): greeting + New Order -> five headline numbers ->
// Order Activity chart beside Event Insights and the Public Menu QR (all three the same height) -> Orders Calendar, Today's Orders and
// Needs Attention -> Kitchen Workload and Inventory Status. Every card reads real data through ./_data.ts and shows only
// what the signed-in role may see.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { session, organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const suggestedSlug = organization.name !== "Unnamed Business" ? slugify(organization.name) : undefined;
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  // The date range picked in the header (`?from=&to=`), in the kitchen's own time zone; a bad one falls back to This Month and says so.
  const { from, to } = await searchParams;
  const todayIso = dayKeyInZone(new Date(), await getTenantTimeZone(organizationId));
  const { range, error: rangeError } = parseDashboardRange(from, to, todayIso);
  // Revenue, totals and what is owed are sensitive data, separate from seeing the dashboard (AJ, 2026-10-17): they are removed here, on the server, for a role without them.
  const prices = await sensitiveAccess(organizationId);
  const snapshot = redactDashboardSnapshot(await getDashboardSnapshot(organizationId, locationId, range), prices);
  // Only the person who can actually save a slug change should see the
  // popup nudging them to (AJ, 2026-09-19) — it was showing to every role,
  // including staff who'd just hit a permission error trying to use it.
  const [canClaimLink, canViewOrders, canSell, canViewPayments, canViewInventory, canCreateQuotation, canViewQuotations, canViewCustomers, canViewMenus, canViewKitchen] =
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
      hasPermission({ kitchen: ["view"] }, organizationId),
    ]);
  // Each card shows only what the role can use (e.g. the kitchen role sees order counts and
  // upcoming events, but no revenue, no "create" shortcuts and no setup banner).
  const canSeeMoney = prices.orderPrices || prices.paymentDetails;

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
        range={range}
        todayIso={todayIso}
        allowed={{ order: canSell, quotation: canCreateQuotation, lead: canViewCustomers, catalog: canViewMenus }}
      />

      {rangeError && (
        <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" data-testid="range-error">
          {rangeError}
        </p>
      )}

      {!organization.onboardingCompletedAt && canClaimLink && <OnboardingNudgeBanner />}

      <KpiTiles
        showOrders={canViewOrders}
        showMoney={canSeeMoney}
        showQuotations={canViewQuotations}
        activeOrders={snapshot.activeOrders}
        needAttention={snapshot.pendingReviewOrders}
        upcomingEvents={snapshot.upcomingEventsCount}
        rangeGuests={snapshot.rangeGuests}
        pendingRevenue={snapshot.outstandingBalance}
        pendingRevenueOrders={snapshot.outstandingOrdersCount}
        openQuotations={snapshot.openQuotations}
        quotationsAwaiting={snapshot.quotationsAwaitingResponse}
      />

      {canViewOrders && (
        // Order Activity on the left; on the right Event Insights and Public Menu / QR side by side at equal width. All three cards
        // are the same height (AJ, 2026-10-14). Below xl the chart takes the full row and the two cards sit under it.
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
          <OrdersActivityCard activity={snapshot.activity} showMoney={canSeeMoney} rangeLabel={describeRange(range)} />
          <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2">
            <div className={canSell ? "min-w-0" : "min-w-0 sm:col-span-2"}>
              <EventTypeCard rows={snapshot.eventTypeDistribution} total={snapshot.eventTotal} rangeLabel={describeRange(range)} />
            </div>
            {canSell && (
              <div className="min-w-0">
                <PublicMenuShortcutCard slug={organization.slug} slugChangeCount={organization.slugChangeCount} />
              </div>
            )}
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

      {(canViewOrders || canViewInventory || canViewKitchen) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(canViewOrders || canViewKitchen) && <KitchenWorkloadCard rows={snapshot.kitchenWorkload} total={snapshot.kitchenGuestsToday} />}
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
