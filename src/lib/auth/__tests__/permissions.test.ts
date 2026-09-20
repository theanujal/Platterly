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
    expect(roles.sales.authorize({ orders: ["bypass_date_restriction"] }).success).toBe(false);
  });

  it("a Staff-preset user cannot mutate any record across every business module (Group 5.2's explicit verify requirement)", () => {
    const mutatingChecks: { resource: string; actions: string[] }[] = [
      { resource: "users", actions: ["create", "edit", "delete"] },
      { resource: "customers", actions: ["create", "edit", "delete"] },
      { resource: "events", actions: ["create", "edit", "delete", "approve"] },
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
  });
});

describe("PRD §5 department roles (added 2026-09-20)", () => {
  const departmentRoles = ["sales", "kitchen", "inventoryTeam", "accounts", "eventTeam"] as const;

  it("none of the department roles can reach tenant, users, settings, or team management (owner/manager only)", () => {
    for (const role of departmentRoles) {
      expect(roles[role].authorize({ tenant: ["view"] }).success, `${role}:tenant:view`).toBe(false);
      expect(roles[role].authorize({ users: ["view"] }).success, `${role}:users:view`).toBe(false);
      expect(roles[role].authorize({ settings: ["view"] }).success, `${role}:settings:view`).toBe(false);
      expect(roles[role].authorize({ invitation: ["create"] }).success, `${role}:invitation:create`).toBe(false);
      expect(roles[role].authorize({ member: ["create"] }).success, `${role}:member:create`).toBe(false);
    }
  });

  it("Sales Team can work customers/quotations/orders but not approve menus or touch inventory/finance", () => {
    expect(roles.sales.authorize({ customers: ["create", "edit"] }).success).toBe(true);
    expect(roles.sales.authorize({ quotations: ["create", "edit"] }).success).toBe(true);
    expect(roles.sales.authorize({ orders: ["create", "edit"] }).success).toBe(true);
    expect(roles.sales.authorize({ menus: ["view"] }).success).toBe(true);
    expect(roles.sales.authorize({ menus: ["approve"] }).success).toBe(false);
    expect(roles.sales.authorize({ inventory: ["view"] }).success).toBe(false);
    expect(roles.sales.authorize({ invoices: ["view"] }).success).toBe(false);
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

  it("Event Team drives the menu approval workflow end to end, but stays out of customers/quotations/inventory/finance", () => {
    expect(roles.eventTeam.authorize({ events: ["create", "edit"] }).success).toBe(true);
    expect(roles.eventTeam.authorize({ menus: ["view", "approve"] }).success).toBe(true);
    expect(roles.eventTeam.authorize({ menus: ["create", "delete", "edit"] }).success).toBe(false);
    expect(roles.eventTeam.authorize({ customers: ["view"] }).success).toBe(false);
    expect(roles.eventTeam.authorize({ quotations: ["view"] }).success).toBe(false);
    expect(roles.eventTeam.authorize({ inventory: ["view"] }).success).toBe(false);
    expect(roles.eventTeam.authorize({ invoices: ["view"] }).success).toBe(false);
  });
});
