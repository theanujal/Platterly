import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { exportResponse, parseFormat } from "@/lib/export/tabular";
import { getActiveLocation } from "@/modules/locations/active-location";
import { resolveRange } from "@/modules/expenses/date-range";
import { loadEventsReport, loadSalesReport } from "@/modules/reports/reports";
import { loadFinanceReport, loadInventoryReport, loadMenuReport, loadStorefrontReport } from "@/modules/reports/more-reports";
import { aboutSheet, eventsSheets, financeSheets, inventorySheets, menuSheets, salesSheets, storefrontSheets } from "@/modules/reports/export-sheets";

/**
 * Chunk 24 — the Reports page as a CSV or Excel file: the same tab, period and location the page shows, from the same
 * loaders. Needs `reports:export` on top of what the tab itself needs (inventory for Inventory, expenses for Finance).
 * The recent-visitor list (IP addresses) is never exported.
 */
export async function GET(request: Request) {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ reports: ["export"] }, organizationId);
  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get("format"));
  const query = { tab: url.searchParams.get("tab") ?? "", range: url.searchParams.get("range") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined };

  const [canInventory, canFinance] = await Promise.all([hasPermission({ inventory: ["view"] }, organizationId), hasPermission({ expenses: ["view"] }, organizationId)]);
  const allowed = ["sales", "events", "menu", ...(canInventory ? ["inventory"] : []), ...(canFinance ? ["finance"] : []), "storefront"];
  const tab = allowed.includes(query.tab) ? query.tab : "sales";
  const range = resolveRange(query);
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  const scope = { organizationId, locationId };
  const byLocation = Boolean(locationId);
  const [organization, location] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    locationId ? prisma.kitchen.findFirst({ where: { id: locationId, organizationId }, select: { name: true } }) : null,
  ]);

  const notes: Record<string, string | undefined> = {
    sales: byLocation ? "Enquiries, conversion and quotations are not split by location, so they are left out." : undefined,
    finance: byLocation ? "Company expenses and supplier payments are not split by location, so only the expenses of this location's orders are counted and payables are left out." : undefined,
    storefront: byLocation ? "There is one public link for the whole kitchen, so visits are left out; only the orders by channel are shown." : undefined,
    inventory: byLocation ? "Items shared by every location are included." : undefined,
  };
  const about = aboutSheet({ report: `${tab[0].toUpperCase()}${tab.slice(1)} report`, kitchen: organization.name, location: location?.name ?? null, from: range.from, to: range.to, note: notes[tab] });

  let sheets;
  if (tab === "events") sheets = eventsSheets(await loadEventsReport(scope, range));
  else if (tab === "menu") sheets = menuSheets(await loadMenuReport(scope, range));
  else if (tab === "inventory") {
    const r = await loadInventoryReport(scope, range);
    sheets = inventorySheets(r.stock, r.movements, r.purchases);
  } else if (tab === "finance") {
    const r = await loadFinanceReport(scope, range);
    sheets = financeSheets(r.finance, r.receivables, r.payables, byLocation);
  } else if (tab === "storefront") {
    const r = await loadStorefrontReport(scope, range);
    sheets = storefrontSheets(r.storefront, r.channels, byLocation);
  } else sheets = salesSheets(await loadSalesReport(scope, range), byLocation);

  return exportResponse(format, `${organization.name} ${tab} report`, [about, ...sheets]);
}
