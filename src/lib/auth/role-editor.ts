import { MATRIX_MODULES, RESERVED_PERMISSIONS, SENSITIVE_KEYS, type MatrixModuleKey, type SensitiveKey } from "./role-matrix";

/**
 * The model behind the Manage Role Permissions editor (Roles & Permissions Phase B). Plain functions over the same grants the
 * server stores (`{ orders: ["view", "edit"], sensitive: ["orderPrices"] }`), so the editor adds no new permission keys and no new
 * rules: it only splits the one matrix into three views (Module Access, Actions, Sensitive Data) and keeps the rule it always had,
 * that ticking any action turns the module's View on and turning View off clears the module's other actions.
 */
export type Grants = Record<string, string[]>;
type Module = (typeof MATRIX_MODULES)[number];

/** Every module except the sensitive-data pseudo-module, which has its own tab. */
export const ACCESS_MODULES: readonly Module[] = MATRIX_MODULES.filter((m) => m.key !== "sensitive");
const moduleByKey = (key: string): Module | undefined => MATRIX_MODULES.find((m) => m.key === key);

/** How the modules are grouped on the Module Access and Actions tabs. Each access module appears in exactly one group. */
export const MODULE_GROUPS: readonly { id: string; label: string; keys: readonly MatrixModuleKey[] }[] = [
  { id: "sales", label: "Sales & customers", keys: ["orders", "quotations", "customers", "eventTypes", "menus"] },
  { id: "kitchen", label: "Kitchen & stock", keys: ["kitchen", "recipes", "inventory", "staffing"] },
  { id: "finance", label: "Finance & reports", keys: ["invoices", "payments", "expenses", "reports", "audit"] },
];

export const ACTION_LABEL: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  export: "Export",
  manage: "Manage",
  updateStatus: "Update cooking status",
  viewPdf: "Kitchen PDF",
};

/** What each sensitive-data key protects, in plain words (from the redesign plan; the server enforces them one by one). */
export const SENSITIVE_INFO: Record<SensitiveKey, { label: string; covers: string }> = {
  menuPrices: { label: "Menu & dish prices", covers: "The menu price per plate, dish prices, add-on prices and extras." },
  orderPrices: { label: "Order & quotation prices", covers: "Order and quotation prices, totals, discounts and charges, the Pricing tab and order amounts on lists and customer profiles." },
  paymentDetails: { label: "Payment details", covers: "Payments, advance, balance, payment status and overdue payments." },
  supplierCosts: { label: "Supplier costs", covers: "Supplier purchase prices, inventory unit cost and purchase order amounts." },
  recipeCosts: { label: "Recipe costs", covers: "Ingredient and recipe cost." },
  profitability: { label: "Profitability", covers: "The Profitability page, margins and event costs." },
  financialReports: { label: "Financial reports", covers: "Revenue and finance report tabs, and the finance exports (reports, expenses, profitability)." },
  commercialDocuments: { label: "Commercial PDFs", covers: "Customer-facing PDFs: invoice, quotation, receipt and payment link." },
};

/** Stock requests and receiving are planned, not built: shown as "Coming soon" and never saved or enforced. */
export const COMING_SOON = RESERVED_PERMISSIONS.map((p) => ({ id: `${p.resource}:${p.action}`, label: p.label, note: p.note }));

/** The actions of a module other than View (View is the module's access switch). */
export function actionsOf(key: string): readonly string[] {
  return (moduleByKey(key)?.actions ?? []).filter((a) => a !== "view");
}

export const hasAccess = (grants: Grants, key: string) => (grants[key] ?? []).includes("view");
export const isAllowed = (grants: Grants, key: string, action: string) => (grants[key] ?? []).includes(action);

/** Ticking an action turns View on too; clearing View clears the rest of the module (you cannot change what you cannot see). */
export function toggleAction(grants: Grants, key: string, action: string, on: boolean): Grants {
  const mod = moduleByKey(key);
  if (!mod) return grants;
  const set = new Set(grants[key] ?? []);
  if (on) {
    set.add(action);
    if (key !== "sensitive") set.add("view");
  } else if (action === "view") {
    set.clear();
  } else {
    set.delete(action);
  }
  return { ...grants, [key]: mod.actions.filter((a) => set.has(a)) };
}

/** Module access is the module's View: on adds View, off clears everything the role could do there. */
export const setAccess = (grants: Grants, key: string, on: boolean): Grants => toggleAction(grants, key, "view", on);

/** Sensitive data is independent of module access: switching a key never touches a module. */
export const setSensitive = (grants: Grants, key: SensitiveKey, on: boolean): Grants => toggleAction(grants, "sensitive", key, on);

const sorted = (list: string[] | undefined) => [...(list ?? [])].sort().join();
export const sameGrants = (a: Grants, b: Grants) => MATRIX_MODULES.every((m) => sorted(a[m.key]) === sorted(b[m.key]));

/** The modules (including "sensitive") whose grants differ between two sets, in matrix order. */
export const changedModules = (a: Grants, b: Grants): MatrixModuleKey[] => MATRIX_MODULES.filter((m) => sorted(a[m.key]) !== sorted(b[m.key])).map((m) => m.key);

export interface GrantSummary {
  modulesOn: number;
  modulesTotal: number;
  actionsOn: number;
  sensitiveOn: number;
  sensitiveTotal: number;
}

export function summarize(grants: Grants): GrantSummary {
  return {
    modulesOn: ACCESS_MODULES.filter((m) => hasAccess(grants, m.key)).length,
    modulesTotal: ACCESS_MODULES.length,
    actionsOn: ACCESS_MODULES.reduce((n, m) => n + actionsOf(m.key).filter((a) => isAllowed(grants, m.key, a)).length, 0),
    sensitiveOn: SENSITIVE_KEYS.filter((k) => isAllowed(grants, "sensitive", k)).length,
    sensitiveTotal: SENSITIVE_KEYS.length,
  };
}
