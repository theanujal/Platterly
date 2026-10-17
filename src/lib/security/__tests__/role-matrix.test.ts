import { describe, it, expect } from "vitest";
import { roles, statement } from "@/lib/auth/permissions";

/**
 * RBAC boundary tests (Chunk 17.3; rewritten for the Roles & Permissions redesign, AJ 2026-10-17). The full grant table for every
 * role, written out. Any change to who can do what fails here first, so it has to be a deliberate edit of this table (and a
 * conscious security decision).
 *
 * Three independent layers: module access (a module's `view`), actions (create, edit, delete, approve, updateStatus ...), and
 * sensitive data (the `sensitive` resource: prices, costs, payments, financial reports, commercial documents).
 */
const ALL_SENSITIVE = ["menuPrices", "orderPrices", "paymentDetails", "supplierCosts", "recipeCosts", "profitability", "financialReports", "commercialDocuments"];

const EXPECTED: Record<string, Record<string, string[]>> = {
  owner: {
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
    sensitive: ALL_SENSITIVE,
    stockRequests: ["request", "fulfil", "receive"],
  },
  manager: {
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
  },
  staff: {
    orders: ["view"],
    quotations: ["view"],
  },
  kitchen: {
    staffing: ["view", "create", "edit", "delete"],
    kitchen: ["view", "updateStatus", "viewPdf"],
    recipes: ["view", "create", "edit"],
    stockRequests: ["request"],
  },
  inventoryTeam: {
    inventory: ["view", "create", "edit", "delete"],
    reports: ["view", "export"],
    recipes: ["view"],
    sensitive: ["supplierCosts"],
    stockRequests: ["fulfil", "receive"],
  },
  accounts: {
    customers: ["view"],
    orders: ["view"],
    invoices: ["view", "create", "edit", "export"],
    payments: ["view", "create", "manage"],
    expenses: ["view", "create", "edit"],
    reports: ["view", "export"],
    sensitive: ["orderPrices", "paymentDetails", "financialReports", "commercialDocuments"],
  },
  salesEvents: {
    customers: ["view", "create", "edit"],
    eventTypes: ["view", "create", "edit"],
    orders: ["view", "create", "edit"],
    quotations: ["view", "create", "edit"],
    menus: ["view", "approve"],
    reports: ["view"],
    staffing: ["view"],
  },
};

const BUSINESS_RESOURCES = Object.keys(statement).filter((k) => !["organization", "member", "invitation", "team", "ac"].includes(k));

function grants(role: keyof typeof roles) {
  const out: Record<string, string[]> = {};
  for (const resource of BUSINESS_RESOURCES) {
    const actions = (statement as Record<string, readonly string[]>)[resource];
    const allowed = actions.filter((a) => (roles[role] as { authorize: (x: unknown) => { success: boolean } }).authorize({ [resource]: [a] }).success);
    if (allowed.length) out[resource] = allowed;
  }
  return out;
}

const can = (role: string, resource: string, action: string) => (EXPECTED[role][resource] ?? []).includes(action);

describe("role permission matrix", () => {
  it("covers exactly the seven roles", () => {
    expect(Object.keys(roles).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.keys(EXPECTED))("%s has exactly the grants in the table, nothing more", (role) => {
    expect(grants(role as keyof typeof roles)).toEqual(EXPECTED[role]);
  });

  it("only the owner can purge data, delete users, change settings or bypass the date rule", () => {
    for (const role of Object.keys(EXPECTED).filter((r) => r !== "owner")) {
      const g = EXPECTED[role];
      expect(g.tenant ?? [], `${role} tenant`).not.toContain("delete");
      expect(g.tenant ?? [], `${role} tenant`).not.toContain("edit");
      expect(g.users ?? [], `${role} users`).not.toContain("delete");
      expect(g.settings ?? [], `${role} settings`).not.toContain("edit");
      expect(g.orders ?? [], `${role} orders`).not.toContain("bypass_date_restriction");
      expect(g.orders ?? [], `${role} orders`).not.toContain("delete");
    }
  });

  it("only the Admin (owner) manages users, roles, permissions and settings: no other role can edit them", () => {
    for (const role of Object.keys(EXPECTED).filter((r) => r !== "owner")) {
      for (const resource of ["users", "settings", "tenant"]) {
        for (const action of ["create", "edit", "delete"]) expect(can(role, resource, action), `${role} ${resource}:${action}`).toBe(false);
      }
    }
  });

  it("deleting is its own permission: the Manager deletes Staff page records only, the Store team deletes inventory only, the kitchen deletes floor staff only", () => {
    const allowedDeletes: Record<string, string[]> = { manager: ["staffing"], inventoryTeam: ["inventory"], kitchen: ["staffing"] };
    for (const role of Object.keys(EXPECTED).filter((r) => r !== "owner")) {
      const deletes = Object.entries(EXPECTED[role]).filter(([, actions]) => actions.includes("delete")).map(([resource]) => resource);
      expect(deletes.sort(), `${role} may delete`).toEqual((allowedDeletes[role] ?? []).sort());
    }
  });

  it("Accounts / Finance has no delete anywhere (financial corrections keep the audit trail)", () => {
    for (const [resource, actions] of Object.entries(EXPECTED.accounts)) expect(actions, `accounts ${resource}`).not.toContain("delete");
  });

  it("only the owner and manager can read the Audit Log", () => {
    for (const role of Object.keys(EXPECTED)) {
      expect(can(role, "audit", "view"), role).toBe(role === "owner" || role === "manager");
    }
  });

  it("Staff has Orders and Quotations only, view-only, and nothing else", () => {
    expect(EXPECTED.staff).toEqual({ orders: ["view"], quotations: ["view"] });
  });

  it("Kitchen runs on its own permissions: the dashboard, cooking status, kitchen PDF and recipes, with no Orders, Menus, Inventory or money access", () => {
    expect(EXPECTED.kitchen.kitchen).toEqual(["view", "updateStatus", "viewPdf"]);
    expect(EXPECTED.kitchen.recipes).toEqual(["view", "create", "edit"]);
    for (const resource of ["orders", "quotations", "customers", "menus", "inventory", "invoices", "payments", "expenses", "reports", "sensitive", "settings"]) {
      expect(EXPECTED.kitchen[resource], `kitchen ${resource}`).toBeUndefined();
    }
  });

  it("Accounts cannot touch menus, quotations or inventory; it sees orders and customers read-only for billing", () => {
    for (const resource of ["menus", "quotations", "inventory", "kitchen", "recipes"]) expect(EXPECTED.accounts[resource], `accounts ${resource}`).toBeUndefined();
    expect(EXPECTED.accounts.orders).toEqual(["view"]);
    expect(EXPECTED.accounts.customers).toEqual(["view"]);
  });

  it("pricing is never implied by a module: only the Admin holds every sensitive key by default", () => {
    for (const role of Object.keys(EXPECTED).filter((r) => r !== "owner")) {
      expect((EXPECTED[role].sensitive ?? []).length, `${role} sensitive keys`).toBeLessThan(ALL_SENSITIVE.length);
    }
    // Roles whose work is operational hold none at all.
    for (const role of ["manager", "staff", "kitchen", "salesEvents"]) expect(EXPECTED[role].sensitive, role).toBeUndefined();
  });

  it("Accounts gets order prices, payment details, financial reports and commercial documents, and not menu prices, supplier or recipe costs or profitability", () => {
    expect(EXPECTED.accounts.sensitive).toEqual(["orderPrices", "paymentDetails", "financialReports", "commercialDocuments"]);
  });

  it("Supplier costs belong to the Store / Inventory team and no other business role by default", () => {
    for (const role of Object.keys(EXPECTED).filter((r) => r !== "owner")) {
      expect(can(role, "sensitive", "supplierCosts"), role).toBe(role === "inventoryTeam");
    }
  });

  it("Store / Inventory does not see customer selling prices or profitability by default", () => {
    for (const key of ["menuPrices", "orderPrices", "paymentDetails", "profitability", "recipeCosts", "financialReports", "commercialDocuments"]) expect(can("inventoryTeam", "sensitive", key), key).toBe(false);
  });

  it("Sales & Event has no inventory, kitchen or accounting access and no prices by default", () => {
    for (const resource of ["inventory", "kitchen", "invoices", "payments", "expenses", "sensitive", "recipes"]) expect(EXPECTED.salesEvents[resource], `salesEvents ${resource}`).toBeUndefined();
  });

  it("stock requests and receiving are reserved identifiers only: nothing in the app enforces them yet", () => {
    expect(statement.stockRequests).toEqual(["request", "fulfil", "receive"]);
  });

  it("every role is denied a resource that does not exist", () => {
    for (const role of Object.keys(roles)) {
      // @ts-expect-error — deliberately unknown resource: deny by default
      expect(roles[role as keyof typeof roles].authorize({ nonexistent: ["view"] }).success).toBe(false);
    }
  });
});
