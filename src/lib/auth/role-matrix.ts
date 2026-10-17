/**
 * The modules and actions an owner may switch on or off per role in Team Management -> Manage Role Permissions.
 * Plain data (no access-control imports) so the client form can use it. The server only ever accepts what is listed here
 * (`sanitizeGrants`), and a test checks every entry exists in `statement` (permissions.ts).
 *
 * Left out on purpose: `tenant` (the Danger Zone data purge), `users` (team management) and `settings` stay with the owner and
 * manager as built in, and `orders:bypass_date_restriction` stays owner-only. Letting another role manage the team or
 * settings would let it raise its own access, and Better Auth's invite endpoints are owner-only regardless.
 */
export const MATRIX_MODULES = [
  { key: "orders", label: "Orders", pages: "Orders, Calendar", actions: ["view", "create", "edit", "delete"] },
  { key: "quotations", label: "Quotations", pages: "Quotations", actions: ["view", "create", "edit", "delete"] },
  { key: "invoices", label: "Invoices", pages: "Invoices", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "customers", label: "Customers", pages: "Customers, Abandoned Orders", actions: ["view", "create", "edit", "delete"] },
  { key: "menus", label: "Menu Catalog & Approvals", pages: "Menu Catalog, Menu Approvals", actions: ["view", "create", "edit", "delete", "approve"] },
  { key: "eventTypes", label: "Event Types", pages: "Event Types in Menu Catalog", actions: ["view", "create", "edit", "delete"] },
  { key: "payments", label: "Payments", pages: "Overdue Payments, recording payments", actions: ["view", "create", "manage"] },
  { key: "expenses", label: "Finance", pages: "Expenses, Profitability", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Reports", pages: "Reports & Activity", actions: ["view", "export"] },
  { key: "audit", label: "Audit Log", pages: "Audit Log", actions: ["view"] },
  { key: "inventory", label: "Stock & Supplies", pages: "Inventory, Suppliers, Purchasing", actions: ["view", "create", "edit", "delete"] },
  { key: "staffing", label: "Staff", pages: "Staff, event staffing, logistics", actions: ["view", "create", "edit", "delete"] },
  { key: "kitchen", label: "Kitchen Dashboard", pages: "Kitchen Dashboard, prep sheets, kitchen order PDF", actions: ["view", "updateStatus", "viewPdf"] },
  { key: "recipes", label: "Recipes", pages: "Recipes", actions: ["view", "create", "edit", "delete"] },
  {
    key: "sensitive",
    label: "Sensitive data",
    pages: "Prices, costs, payments, financial reports and commercial documents",
    actions: ["menuPrices", "orderPrices", "paymentDetails", "supplierCosts", "recipeCosts", "profitability", "financialReports", "commercialDocuments"],
  },
] as const;

/** The sensitive-data keys, one per kind of protected field or document. */
export const SENSITIVE_KEYS = ["menuPrices", "orderPrices", "paymentDetails", "supplierCosts", "recipeCosts", "profitability", "financialReports", "commercialDocuments"] as const;
export type SensitiveKey = (typeof SENSITIVE_KEYS)[number];

/** Reserved for the stock-request and stock-receiving workflows (not built; D4). Shown as "Coming soon", never enforced. */
export const RESERVED_PERMISSIONS = [
  { resource: "stockRequests", action: "request", label: "Request stock", note: "Kitchen asks the store for ingredients" },
  { resource: "stockRequests", action: "fulfil", label: "Fulfil stock requests", note: "Store answers a kitchen request" },
  { resource: "stockRequests", action: "receive", label: "Receive stock", note: "Store books goods that arrive from a supplier" },
] as const;

export type MatrixModuleKey = (typeof MATRIX_MODULES)[number]["key"];
export type RoleGrants = Partial<Record<MatrixModuleKey, string[]>>;

/** Roles an owner can edit: every built-in role except owner. */
export const EDITABLE_ROLE_IDS = ["manager", "staff", "kitchen", "inventoryTeam", "accounts", "salesEvents"] as const;
export type EditableRoleId = (typeof EDITABLE_ROLE_IDS)[number];

export function isEditableRole(role: string): role is EditableRoleId {
  return (EDITABLE_ROLE_IDS as readonly string[]).includes(role);
}

/**
 * Keeps only known modules and actions, drops duplicates, and makes sure any module with an action also has "view"
 * (you cannot create or edit what you cannot see). Every module is present in the result, empty when nothing is allowed.
 */
export function sanitizeGrants(input: unknown): Record<MatrixModuleKey, string[]> {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = {} as Record<MatrixModuleKey, string[]>;
  for (const mod of MATRIX_MODULES) {
    const raw = Array.isArray(source[mod.key]) ? (source[mod.key] as unknown[]) : [];
    const picked = mod.actions.filter((action) => raw.includes(action));
    // Only a module that has a "view" action gets it added; the sensitive-data keys are independent of every module.
    const hasView = (mod.actions as readonly string[]).includes("view");
    out[mod.key] = hasView && picked.length > 0 && !picked.includes("view") ? ["view", ...picked] : [...picked];
  }
  return out;
}
