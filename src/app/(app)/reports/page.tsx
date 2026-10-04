import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { loadEventsReport, loadSalesReport } from "@/modules/reports/reports";
import { loadFinanceReport, loadInventoryReport, loadMenuReport, loadStorefrontReport } from "@/modules/reports/more-reports";
import { resolveRange, toIsoDate } from "@/modules/expenses/date-range";
import { RangeFilter } from "@/app/(app)/profitability/_components/range-filter";
import { EventsView, SalesView } from "@/components/reports/report-views";
import { FinanceView, InventoryView, MenuView, StorefrontView } from "@/components/reports/more-report-views";
import { ReportTabs } from "@/components/reports/report-ui";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Reports — Platterly",
  robots: { index: false, follow: false },
};

type Query = { tab?: string; range?: string; from?: string; to?: string };

// Chunk 17.1 + 22 (PRD §51): Sales and Events for anyone with the `reports` permission; Menu and Storefront too. Inventory
// needs `inventory` view and Finance needs `expenses` view, because they show cost and profit; the recent-visitor list
// (IP addresses) is for roles that can see the business profile (owner and manager).
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ reports: ["view"] }, organizationId);
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  const location = locationId ? await prisma.kitchen.findFirst({ where: { id: locationId, organizationId }, select: { name: true } }) : null;
  const query = await searchParams;
  const [canInventory, canFinance, canSeeVisitors, canOpenOrders] = await Promise.all([
    hasPermission({ inventory: ["view"] }, organizationId),
    hasPermission({ expenses: ["view"] }, organizationId),
    hasPermission({ tenant: ["view"] }, organizationId),
    hasPermission({ orders: ["edit"] }, organizationId),
  ]);
  const allowed = ["sales", "events", "menu", ...(canInventory ? ["inventory"] : []), ...(canFinance ? ["finance"] : []), "storefront"];
  const tab = allowed.includes(query.tab ?? "") ? (query.tab as string) : "sales";
  const range = resolveRange(query);
  const scope = { organizationId, locationId };

  const [sales, events, menu, inventory, finance, storefront] = await Promise.all([
    tab === "sales" ? loadSalesReport(scope, range) : null,
    tab === "events" ? loadEventsReport(scope, range) : null,
    tab === "menu" ? loadMenuReport(scope, range) : null,
    tab === "inventory" ? loadInventoryReport(scope, range) : null,
    tab === "finance" ? loadFinanceReport(scope, range) : null,
    tab === "storefront" ? loadStorefrontReport(scope, range, { recent: canSeeVisitors }) : null,
  ]);

  const keep: Record<string, string> = {};
  if (query.from || query.to) {
    if (query.from) keep.from = query.from;
    if (query.to) keep.to = query.to;
  } else if (query.range) keep.range = query.range;

  const subject = { sales: "Orders placed", events: "Events dated", menu: "Orders placed", inventory: "Movements and purchases", finance: "Revenue and expenses", storefront: "Visits" }[tab];
  const periodText =
    range.from || range.to
      ? `${subject} ${range.from && range.to ? `from ${toIsoDate(range.from)} to ${toIsoDate(range.to)}` : range.from ? `on or after ${toIsoDate(range.from)}` : `on or before ${toIsoDate(range.to!)}`}.`
      : `${subject}: all time.`;

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">How your catering business is doing: sales, events, menu, stock, finance and storefront visitors, for any period.</p>
      </div>
      <Separator />
      <RangeFilter preset={range.preset} from={range.from ? toIsoDate(range.from) : ""} to={range.to ? toIsoDate(range.to) : ""} basePath="/reports" extra={{ tab }} />
      <p className="text-sm text-muted-foreground" data-testid="report-period">
        {periodText}
      </p>
      {location && (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground" data-testid="report-location">
          Showing <b className="font-medium text-foreground">{location.name}</b> only.{" "}
          {tab === "sales" && "Enquiries, conversion and quotations are not split by location, so they are left out."}
          {tab === "finance" && "Company expenses and supplier payments are not split by location, so only the expenses of this location's orders are counted and payables are left out."}
          {tab === "inventory" && "Items shared by every location are included."}
          {tab === "storefront" && "There is one public link for the whole kitchen, so visits are not split by location."}
        </p>
      )}
      <ReportTabs
        tabs={[
          { id: "sales", label: "Sales" },
          { id: "events", label: "Events" },
          { id: "menu", label: "Menu" },
          ...(canInventory ? [{ id: "inventory", label: "Inventory" }] : []),
          ...(canFinance ? [{ id: "finance", label: "Finance" }] : []),
          { id: "storefront", label: "Storefront" },
        ]}
        active={tab}
        basePath="/reports"
        keep={keep}
      />
      {sales && <SalesView sales={sales} byLocation={Boolean(locationId)} />}
      {events && <EventsView events={events} orderLinks={canOpenOrders} />}
      {menu && <MenuView menu={menu} />}
      {inventory && <InventoryView stock={inventory.stock} movements={inventory.movements} purchases={inventory.purchases} />}
      {finance && <FinanceView finance={finance.finance} receivables={finance.receivables} payables={finance.payables} orderLinks={canOpenOrders} byLocation={Boolean(locationId)} />}
      {storefront && <StorefrontView storefront={storefront.storefront} channels={storefront.channels} recent={canSeeVisitors ? storefront.recent : null} />}
    </div>
  );
}
