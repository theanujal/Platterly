import { describe, it, expect } from "vitest";
import { roles } from "@/lib/auth/permissions";

describe("Access control (PRD §15 module/action RBAC)", () => {
  it("grants an owner full access to a defined resource/action", () => {
    const result = roles.owner.authorize({ orders: ["create"] });
    expect(result.success).toBe(true);
  });

  it("denies staff an action not granted to their role (deny-by-default)", () => {
    const result = roles.staff.authorize({ orders: ["create"] });
    expect(result.success).toBe(false);
  });

  it("allows staff the read-only actions they are granted", () => {
    const result = roles.staff.authorize({ orders: ["view"] });
    expect(result.success).toBe(true);
  });

  it("denies any role for a resource that isn't in its statement at all", () => {
    // @ts-expect-error — intentionally an unknown resource to prove deny-by-default
    const result = roles.owner.authorize({ nonexistentModule: ["view"] });
    expect(result.success).toBe(false);
  });

  it("manager sits strictly between owner and staff", () => {
    expect(roles.manager.authorize({ orders: ["create"] }).success).toBe(true);
    expect(roles.manager.authorize({ orders: ["delete"] }).success).toBe(false);
  });
});

describe("Owner is the only top-tier role; Staff stays read-only (Team Admin removed, 2026-09-20)", () => {
  it("only owner can purge tenant data (tenant:delete)", () => {
    expect(roles.owner.authorize({ tenant: ["delete"] }).success).toBe(true);
    expect(roles.manager.authorize({ tenant: ["delete"] }).success).toBe(false);
    expect(roles.staff.authorize({ tenant: ["delete"] }).success).toBe(false);
  });

  it("only owner can delete the organization itself (Better Auth's own org grant)", () => {
    expect(roles.owner.authorize({ organization: ["delete"] }).success).toBe(true);
    expect(roles.manager.authorize({ organization: ["delete"] }).success).toBe(false);
  });

  it("only owner can bypass the <2-days-before-event restriction", () => {
    expect(roles.owner.authorize({ orders: ["bypass_date_restriction"] }).success).toBe(true);
    expect(roles.manager.authorize({ orders: ["bypass_date_restriction"] }).success).toBe(false);
    expect(roles.salesEvents.authorize({ orders: ["bypass_date_restriction"] }).success).toBe(false);
  });

  it("a Staff-preset user cannot mutate any record across every business module (Group 5.2's explicit verify requirement)", () => {
    const mutatingChecks: { resource: string; actions: string[] }[] = [
      { resource: "users", actions: ["create", "edit", "delete"] },
      { resource: "customers", actions: ["create", "edit", "delete"] },
      { resource: "eventTypes", actions: ["create", "edit", "delete"] },
      { resource: "orders", actions: ["create", "edit", "delete"] },
      { resource: "menus", actions: ["create", "edit", "delete", "approve"] },
      { resource: "inventory", actions: ["create", "edit", "delete"] },
      { resource: "invoices", actions: ["create", "edit", "delete", "export"] },
      { resource: "payments", actions: ["create", "manage"] },
      { resource: "tenant", actions: ["edit", "delete"] },
      { resource: "settings", actions: ["edit"] },
    ];
    for (const { resource, actions } of mutatingChecks) {
      for (const action of actions) {
        expect(roles.staff.authorize({ [resource]: [action] }).success, `staff:${resource}:${action}`).toBe(false);
      }
    }
    // Staff still gets its granted read-only views.
    expect(roles.staff.authorize({ customers: ["view"] }).success).toBe(true);
    expect(roles.staff.authorize({ orders: ["view"] }).success).toBe(true);
    expect(roles.staff.authorize({ reports: ["view"] }).success).toBe(true);
    // Anyone who can read reports can also download them (Chunk 24, AJ 2026-10-04); the kitchen role has no reports at all.
    for (const role of ["manager", "staff", "inventoryTeam", "salesEvents"] as const) expect(roles[role].authorize({ reports: ["export"] }).success, role).toBe(true);
    expect(roles.kitchen.authorize({ reports: ["export"] }).success).toBe(false);
  });
});

describe("PRD §5 department roles (added 2026-09-20)", () => {
  const departmentRoles = ["salesEvents", "kitchen", "inventoryTeam", "accounts"] as const;

  it("none of the department roles can reach tenant, users, settings, or team management (owner/manager only)", () => {
    for (const role of departmentRoles) {
      expect(roles[role].authorize({ tenant: ["view"] }).success, `${role}:tenant:view`).toBe(false);
      expect(roles[role].authorize({ users: ["view"] }).success, `${role}:users:view`).toBe(false);
      expect(roles[role].authorize({ settings: ["view"] }).success, `${role}:settings:view`).toBe(false);
      expect(roles[role].authorize({ invitation: ["create"] }).success, `${role}:invitation:create`).toBe(false);
      expect(roles[role].authorize({ member: ["create"] }).success, `${role}:member:create`).toBe(false);
    }
  });

  it("Sales & Event Team works customers/quotations/orders/events and owns menu approval, but not menu editing, inventory or finance", () => {
    expect(roles.salesEvents.authorize({ customers: ["create", "edit"] }).success).toBe(true);
    expect(roles.salesEvents.authorize({ quotations: ["create", "edit"] }).success).toBe(true);
    expect(roles.salesEvents.authorize({ orders: ["create", "edit"] }).success).toBe(true);
    expect(roles.salesEvents.authorize({ eventTypes: ["create", "edit"] }).success).toBe(true);
    expect(roles.salesEvents.authorize({ menus: ["view", "approve"] }).success).toBe(true);
    expect(roles.salesEvents.authorize({ menus: ["create", "delete", "edit"] }).success).toBe(false);
    expect(roles.salesEvents.authorize({ orders: ["delete"] }).success).toBe(false);
    expect(roles.salesEvents.authorize({ inventory: ["view"] }).success).toBe(false);
    expect(roles.salesEvents.authorize({ invoices: ["view"] }).success).toBe(false);
  });

  it("Kitchen Team can view/edit menus for production but cannot approve them or reach the sales/finance modules", () => {
    expect(roles.kitchen.authorize({ menus: ["view", "edit"] }).success).toBe(true);
    expect(roles.kitchen.authorize({ menus: ["approve"] }).success).toBe(false);
    expect(roles.kitchen.authorize({ menus: ["create", "delete"] }).success).toBe(false);
    expect(roles.kitchen.authorize({ customers: ["view"] }).success).toBe(false);
    expect(roles.kitchen.authorize({ invoices: ["view"] }).success).toBe(false);
  });

  it("Store/Inventory Team has full control of inventory only", () => {
    expect(roles.inventoryTeam.authorize({ inventory: ["view", "create", "edit", "delete"] }).success).toBe(true);
    expect(roles.inventoryTeam.authorize({ orders: ["view"] }).success).toBe(false);
    expect(roles.inventoryTeam.authorize({ menus: ["view"] }).success).toBe(false);
  });

  it("Accounts Team manages invoices/payments/reports only", () => {
    expect(roles.accounts.authorize({ invoices: ["view", "create", "edit", "export"] }).success).toBe(true);
    expect(roles.accounts.authorize({ payments: ["view", "create", "manage"] }).success).toBe(true);
    expect(roles.accounts.authorize({ reports: ["view", "export"] }).success).toBe(true);
    expect(roles.accounts.authorize({ orders: ["view"] }).success).toBe(false);
    expect(roles.accounts.authorize({ customers: ["view"] }).success).toBe(false);
  });

  it("Accounts can record and correct expenses without opening orders (AJ, 2026-10-03)", () => {
    expect(roles.accounts.authorize({ expenses: ["view", "create", "edit"] }).success).toBe(true);
    expect(roles.accounts.authorize({ expenses: ["delete"] }).success).toBe(false);
  });
});

describe("expenses permission (Chunk 15)", () => {
  const expected: Record<string, string[]> = {
    owner: ["view", "create", "edit", "delete"],
    manager: ["view", "create", "edit"],
    accounts: ["view", "create", "edit"],
    staff: [],
    salesEvents: [],
    kitchen: [],
    inventoryTeam: [],
  };
  for (const [role, granted] of Object.entries(expected)) {
    it(`${role} has exactly ${granted.length ? granted.join("/") : "no"} access to expenses`, () => {
      for (const action of ["view", "create", "edit", "delete"] as const) {
        expect((roles as Record<string, { authorize: (r: object) => { success: boolean } }>)[role].authorize({ expenses: [action] }).success).toBe(granted.includes(action));
      }
    });
  }
});

describe("eventTypes permission (renamed from `events`, 2026-09-30)", () => {
  // The rename must not change who can do what: these are the exact grants
  // the `events` permission had before.
  const expected: Record<string, string[]> = {
    owner: ["view", "create", "edit", "delete"],
    manager: ["view", "create", "edit"],
    staff: ["view"],
    salesEvents: ["view", "create", "edit"],
    kitchen: ["view"],
    inventoryTeam: [],
    accounts: [],
  };

  for (const [role, granted] of Object.entries(expected)) {
    it(`${role} keeps exactly ${granted.length ? granted.join("/") : "no"} access to Event Types`, () => {
      for (const action of ["view", "create", "edit", "delete"] as const) {
        expect(
          (roles as Record<string, { authorize: (r: object) => { success: boolean } }>)[role].authorize({ eventTypes: [action] }).success,
          `${role}:eventTypes:${action}`,
        ).toBe(granted.includes(action));
      }
    });
  }

  it("the order's kitchen / inventory cards (orders:edit) are open to exactly the roles that could edit events before", () => {
    const canEditOrders = Object.keys(expected).filter((r) => (roles as never as Record<string, { authorize: (x: object) => { success: boolean } }>)[r].authorize({ orders: ["edit"] }).success);
    expect(canEditOrders.sort()).toEqual(["manager", "owner", "salesEvents"]);
  });
});
