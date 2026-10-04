import { requireSuperAdmin } from "@/lib/auth/require-session";
import { exportResponse, parseFormat, type Sheet } from "@/lib/export/tabular";
import { resolveRange } from "@/modules/expenses/date-range";
import { loadEventsReport, loadSalesReport, loadSignupsByMonth } from "@/modules/reports/reports";
import { loadFinanceReport, loadInventoryReport, loadStorefrontReport } from "@/modules/reports/more-reports";
import { loadSaasReport } from "@/modules/reports/saas-report";
import { aboutSheet, eventsSheets, financeSheets, inventorySheets, kitchensSheet, saasSheets, salesSheets, storefrontSheets } from "@/modules/reports/export-sheets";

/** Chunk 24 — the Super Admin platform reports as CSV or Excel: the tab and period the page shows, added up across every kitchen. */
export async function GET(request: Request) {
  await requireSuperAdmin();
  const url = new URL(request.url);
  const query = { tab: url.searchParams.get("tab") ?? "", range: url.searchParams.get("range") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined };
  const tab = ["events", "finance", "inventory", "storefront", "subscriptions"].includes(query.tab) ? query.tab : "sales";
  const range = resolveRange(query);
  const scope = { all: true } as const;
  const about = aboutSheet({ report: `Platform ${tab} report`, kitchen: "All caterers", from: range.from, to: range.to, note: tab === "subscriptions" ? "Amounts are before GST. Only paid plan payments count." : undefined });

  let sheets: Sheet[];
  if (tab === "events") sheets = eventsSheets(await loadEventsReport(scope, range));
  else if (tab === "finance") {
    const r = await loadFinanceReport(scope, range);
    sheets = financeSheets(r.finance, r.receivables, r.payables);
  } else if (tab === "inventory") {
    const r = await loadInventoryReport(scope, range);
    sheets = inventorySheets(r.stock, r.movements, r.purchases);
  } else if (tab === "storefront") {
    const r = await loadStorefrontReport(scope, range);
    sheets = storefrontSheets(r.storefront, r.channels);
  } else if (tab === "subscriptions") sheets = saasSheets(await loadSaasReport(range));
  else {
    const [sales, signups] = await Promise.all([loadSalesReport(scope, range), loadSignupsByMonth(range)]);
    sheets = [
      ...salesSheets(sales),
      kitchensSheet(sales.kitchens),
      { title: "Caterer sign-ups by month", columns: ["Month", "New caterers"], rows: signups.byMonth.map((m) => [m.label, m.count]) },
    ];
  }
  return exportResponse(parseFormat(url.searchParams.get("format")), `platterly platform ${tab} report`, [about, ...sheets]);
}
