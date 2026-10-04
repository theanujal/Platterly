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
  }),
  manager: ac.newRole({
    ...memberAc.statements,
    tenant: ["view"],
    users: ["view"],
    customers: ["view", "create", "edit"],
    eventTypes: ["view", "create", "edit"],
    orders: ["view", "create", "edit"],
    quotations: ["view", "create", "edit"],
    menus: ["view", "create", "edit"],
    inventory: ["view", "create", "edit"],
    invoices: ["view", "create"],
    payments: ["view", "create"],
    expenses: ["view", "create", "edit"],
    reports: ["view"],
    audit: ["view"],
    staffing: ["view", "create", "edit"],
    settings: ["view"],
  }),
  staff: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: ["view"],
    eventTypes: ["view"],
    orders: ["view"],
    quotations: ["view"],
    menus: ["view"],
    inventory: ["view"],
    invoices: [],
    payments: [],
    expenses: [],
    reports: ["view"],
    staffing: ["view"],
    settings: [],
  }),
  /**
   * PRD §5 "Kitchen Team" — Approved menus/Kitchen production/Preparation/
   * Kitchen status. Gets `menus:edit` (Kitchen Dashboard's own status-update
   * actions, kitchen-dashboard/actions.ts) and `menus:view` (both the
   * dashboard and its own query already scope to orders that reached the
   * Kitchen Reviewing/Approved stage). Deliberately NO `menus:approve` — AJ,
   * 2026-09-20: Kitchen Team executes production against already-approved
   * menus, they don't run the approval pipeline itself (that's `salesEvents`
   * below), so `/menu-approvals` (gated on `menus:["approve"]`) stays closed
   * to this role.
   */
  kitchen: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: [],
    eventTypes: ["view"],
    orders: ["view"],
    quotations: [],
    menus: ["view", "edit"],
    inventory: [],
    invoices: [],
    payments: [],
    expenses: [],
    reports: [],
    staffing: ["view", "create", "edit", "delete"],
    settings: [],
  }),
  /**
   * PRD §5 "Store / Inventory Team" — Stock/Ingredients/Purchases/Suppliers.
   * `inventory` is this role's entire domain, so unlike every other
   * non-owner role it gets `delete` there too.
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
    reports: ["view"],
    settings: [],
  }),
  /**
   * PRD §5 "Accounts Team" (Finance) — Invoices/Payments/Expenses/Financial
   * reports. `reports:export` mirrors owner's grant since financial
   * reporting is this role's core job.
   */
  accounts: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: [],
    eventTypes: [],
    orders: [],
    quotations: [],
    menus: [],
    inventory: [],
    invoices: ["view", "create", "edit", "export"],
    payments: ["view", "create", "manage"],
    expenses: ["view", "create", "edit"],
    reports: ["view", "export"],
    settings: [],
  }),
  /**
   * PRD §5 "Sales Team" + "Event Team", merged into one role (AJ, 2026-09-30):
   * the same people sell an order and run its event. Enquiries/Customers/
   * Quotations/Orders/Follow-ups plus Event requirements, **and menu-approval
   * ownership** (AJ, 2026-09-20): `menu-approvals/actions.ts`'s entire
   * Draft→...→Final/Locked pipeline is uniformly gated on `menus:["approve"]`,
   * so granting it here gives this role the full customer-approval-through-
   * lock flow end to end. No menu create/edit/delete, no deletes anywhere.
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
  }),
};
