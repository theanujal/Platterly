/**
 * Which report tabs a person may open and export (Roles & Permissions redesign, AJ 2026-10-17). Every tab with revenue, order
 * values or finance figures needs `financialReports`; Inventory shows what stock cost, so it also needs `supplierCosts`; Storefront
 * (visits, sources, devices) shows no money and stays with `reports: view`. One function, so the page and the export cannot disagree.
 */
export function allowedReportTabs(can: { inventory: boolean; expenses: boolean; financialReports: boolean; supplierCosts: boolean }): string[] {
  return [
    ...(can.financialReports ? ["sales", "events", "menu"] : []),
    ...(can.inventory && can.supplierCosts ? ["inventory"] : []),
    ...(can.expenses && can.financialReports ? ["finance"] : []),
    "storefront",
  ];
}
