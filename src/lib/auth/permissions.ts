import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
  memberAc,
} from "better-auth/plugins/organization/access";

/**
 * Business-module permissions (PRD §15: module/action-level RBAC).
 * `defaultStatements` covers organization-management actions (invite members,
 * manage teams, etc.) that Better Auth's organization plugin already ships.
 * Everything below is Platterly's own module/action matrix — a representative
 * starting set proving the deny-by-default mechanism works end to end. Each
 * later chunk extends this statement with its own module's actions as that
 * module gets built (e.g. Chunk 9 adds `customers`/`eventTypes` actions beyond the
 * placeholders below, Chunk 14 adds `invoices`/`payments`, etc.). The role
 * presets in `roles` below (PRD §5's Owner/Manager/Staff plus its five named
 * department teams) are a UI layer on top of this engine, never a
 * replacement for it.
 */
export const statement = {
  ...defaultStatements,
  // "delete" = Chunk 5's Danger Zone data purge — owner-only, granted to no
  // other role.
  tenant: ["view", "edit", "delete"],
  users: ["view", "create", "edit", "delete"],
  customers: ["view", "create", "edit", "delete"],
  // `eventTypes` was `events` until 2026-09-30: Events and Orders are merged in
  // the UI (an Event is a hidden record synced from each Order), so the only
  // thing this permission ever guarded was the Event Types pages. The order's
  // kitchen / required-inventory cards follow `orders:["edit"]` instead.
  eventTypes: ["view", "create", "edit", "delete"],
  // "bypass_date_restriction" — Create Order's own <2-days-before-event
  // guard (order-form.tsx / order.ts, 2026-09-19); owner-only, see
  // the `roles` grants below.
  orders: ["view", "create", "edit", "delete", "bypass_date_restriction"],
  quotations: ["view", "create", "edit", "delete"],
  menus: ["view", "create", "edit", "delete", "approve"],
  inventory: ["view", "create", "edit", "delete"],
  invoices: ["view", "create", "edit", "delete", "export"],
  payments: ["view", "create", "manage"],
  // Chunk 15: what an order's event cost (the Expenses tab and the Profitability page).
  expenses: ["view", "create", "edit", "delete"],
  reports: ["view", "export"],
  // Chunk 17.2: the Audit Log page. Owners and managers only (AJ, 2026-10-04).
  audit: ["view"],
  // Chunk 19.2: who is on which event, and the floor staff list. The kitchen team fills it in (AJ, 2026-10-04), so it is
  // the one place besides inventory where a non-owner role may delete (floor staff records); a manager can view, create and edit.
  staffing: ["view", "create", "edit", "delete"],
  settings: ["view", "edit"],
  // Roles & Permissions redesign, Phase A (AJ, 2026-10-17). Kitchen work no longer borrows `menus` or `orders`:
  // "view" opens the Kitchen Dashboard, its orders and the prep sheet; "updateStatus" moves the cooking stage; "viewPdf"
  // downloads the kitchen order PDF (which carries no prices).
  kitchen: ["view", "updateStatus", "viewPdf"],
  // Recipes used to borrow `inventory`; the kitchen writes recipes without touching stock.
  recipes: ["view", "create", "edit", "delete"],
  // Sensitive data, independent of every module: opening Orders or Quotations never shows a price. Each key is one kind of
  // protected field or document (see docs/roles-permissions-redesign-plan.md, section 2).
  sensitive: [
    "menuPrices", // menu, dish and add-on prices
    "orderPrices", // order and quotation prices, totals, discounts and charges
    "paymentDetails", // payments, advance, balances, overdue payments
    "supplierCosts", // supplier purchase prices, inventory unit cost, purchase order amounts
    "recipeCosts", // ingredient and recipe cost
    "profitability", // profitability, margins, event costs
    "financialReports", // revenue and finance report tabs and their exports
    "commercialDocuments", // customer-facing PDFs: invoices, receipts, quotations
  ],
  // Reserved identifiers only (AJ, 2026-10-17, D4): stock requests and stock receiving are not built. Nothing enforces
  // these and the editor shows them as "Coming soon".
  stockRequests: ["request", "fulfil", "receive"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Base roles every tenant gets. Deny-by-default: any resource/action not
 * listed for a role is unauthorized (see permission tests in src/lib/auth/__tests__).
 * Super Admin is not an organization role at all — it's a separate, tenant-less
 * platform-level user (Chunk 3), enforced by an app-level check, not by this ac.
 *
 * `owner` is the only top-tier role — there is deliberately no second
 * owner-level "admin" role (AJ, 2026-09-20: removed the Chunk 5 "Team Admin"
 * preset). Below owner sit `manager`/`staff` plus PRD §5's five named
 * department teams (`salesEvents`/`kitchen`/`inventoryTeam`/`accounts`).
 * None of the non-owner roles get `tenant`, `users`, `settings`, or Better
 * Auth's own org-management grants (invite/manage teammates stays owner or
 * `manager` only, via `...memberAc.statements` below) — team management is
 * an owner/manager-only capability regardless of department.
 */
export const roles = {
  owner: ac.newRole({
    ...ownerAc.statements,
    tenant: ["view", "edit", "delete"],
    users: ["view", "create", "edit", "delete"],
    customers: ["view", "create", "edit", "delete"],
    eventTypes: ["view", "create", "edit", "delete"],
    orders: ["view", "create", "edit", "delete", "bypass_date_restriction"],
    quotations: ["view", "create", "edit", "delete"],
    menus: ["view", "create", "edit", "delete", "approve"],
    inventory: ["view", "create", "edit", "delete"],
    invoices: ["view", "create", "edit", "delete", "export"],
    payments: ["view", "create", "manage"],
    expenses: ["view", "create", "edit", "delete"],
    reports: ["view", "export"],
    audit: ["view"],
    staffing: ["view", "create", "edit", "delete"],
    settings: ["view", "edit"],
    kitchen: ["view", "updateStatus", "viewPdf"],
    recipes: ["view", "create", "edit", "delete"],
    sensitive: ["menuPrices", "orderPrices", "paymentDetails", "supplierCosts", "recipeCosts", "profitability", "financialReports", "commercialDocuments"],
    stockRequests: ["request", "fulfil", "receive"],
  }),
  /**
   * Broad operations, no prices (AJ, 2026-10-17): creates and edits most records and approves menus, but deletes only Staff
   * page records (`staffing: delete`), sees no prices or costs until the Admin grants them, and does not manage the team,
   * roles or settings.
   */
  manager: ac.newRole({
    ...memberAc.statements,
    tenant: ["view"],
    users: ["view"],
    customers: ["view", "create", "edit"],
    eventTypes: ["view", "create", "edit"],
    orders: ["view", "create", "edit"],
    quotations: ["view", "create", "edit"],
    menus: ["view", "create", "edit", "approve"],
    inventory: ["view", "create", "edit"],
    invoices: ["view", "create"],
    payments: ["view", "create"],
    expenses: ["view", "create", "edit"],
    reports: ["view", "export"],
    audit: ["view"],
    staffing: ["view", "create", "edit", "delete"],
    settings: ["view"],
    kitchen: ["view", "updateStatus", "viewPdf"],
    recipes: ["view", "create", "edit"],
    sensitive: [],
  }),
  /** Orders and Quotations only, view-only until the Admin grants more; no prices (AJ, 2026-10-17). */
  staff: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: [],
    eventTypes: [],
    orders: ["view"],
    quotations: ["view"],
    menus: [],
    inventory: [],
    invoices: [],
    payments: [],
    expenses: [],
    reports: [],
    staffing: [],
    settings: [],
    kitchen: [],
    recipes: [],
    sensitive: [],
  }),
  /**
   * PRD §5 "Kitchen Team", rebuilt on its own permissions (AJ, 2026-10-17): the Kitchen Dashboard, its orders and prep sheet,
   * the cooking stage, the kitchen PDF, recipes and floor staffing, with no general Orders, Menus or Inventory access and no
   * prices. Deliberately NO `menus:approve` (AJ, 2026-09-20): it executes production against already-approved menus.
   */
  kitchen: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: [],
    eventTypes: [],
    orders: [],
    quotations: [],
    menus: [],
    inventory: [],
    invoices: [],
    payments: [],
    expenses: [],
    reports: [],
    staffing: ["view", "create", "edit", "delete"],
    settings: [],
    kitchen: ["view", "updateStatus", "viewPdf"],
    recipes: ["view", "create", "edit"],
    sensitive: [],
    stockRequests: ["request"],
  }),
  /**
   * PRD §5 "Store / Inventory Team": stock, ingredients, suppliers and purchases, with the supplier purchase costs its work
   * needs. `inventory` is this role's entire domain, so unlike every other non-owner role it gets `delete` there too.
   */
  inventoryTeam: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: [],
    eventTypes: [],
    orders: [],
    quotations: [],
    menus: [],
    inventory: ["view", "create", "edit", "delete"],
    invoices: [],
    payments: [],
    expenses: [],
    reports: ["view", "export"],
    settings: [],
    kitchen: [],
    recipes: ["view"],
    sensitive: ["supplierCosts"],
    stockRequests: ["fulfil", "receive"],
  }),
  /**
   * PRD §5 "Accounts Team" (Finance): invoices, payments, expenses and financial reports, and the orders and customers they
   * bill (view only). Prices it needs for that work are granted below; menu prices, supplier and recipe costs and
   * profitability are not (AJ, 2026-10-17, D3). No deletes.
   */
  accounts: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: ["view"],
    eventTypes: [],
    orders: ["view"],
    quotations: [],
    menus: [],
    inventory: [],
    invoices: ["view", "create", "edit", "export"],
    payments: ["view", "create", "manage"],
    expenses: ["view", "create", "edit"],
    reports: ["view", "export"],
    settings: [],
    kitchen: [],
    recipes: [],
    sensitive: ["orderPrices", "paymentDetails", "financialReports", "commercialDocuments"],
  }),
  /**
   * PRD §5 "Sales Team" + "Event Team", merged into one role (AJ, 2026-09-30): the same people sell an order and run its event.
   * Customers, quotations, orders and event details, plus **menu-approval ownership** (AJ, 2026-09-20): the whole
   * Draft -> ... -> Final/Locked pipeline is gated on `menus:["approve"]`. No prices until the Admin grants them (AJ, 2026-10-17),
   * no deletes, no inventory, kitchen or accounting.
   */
  salesEvents: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: ["view", "create", "edit"],
    eventTypes: ["view", "create", "edit"],
    orders: ["view", "create", "edit"],
    quotations: ["view", "create", "edit"],
    menus: ["view", "approve"],
    inventory: [],
    invoices: [],
    payments: [],
    expenses: [],
    reports: ["view"],
    staffing: ["view"],
    settings: [],
    kitchen: [],
    recipes: [],
    sensitive: [],
  }),
};
