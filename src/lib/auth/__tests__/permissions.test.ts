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

describe("Chunk 5 Group 5.2 — 'Team Admin' role and the Danger Zone purge gate", () => {
  it("only owner can purge tenant data (tenant:delete) — admin, despite being owner-level everywhere else, cannot", () => {
    expect(roles.owner.authorize({ tenant: ["delete"] }).success).toBe(true);
    expect(roles.admin.authorize({ tenant: ["delete"] }).success).toBe(false);
    expect(roles.manager.authorize({ tenant: ["delete"] }).success).toBe(false);
    expect(roles.staff.authorize({ tenant: ["delete"] }).success).toBe(false);
  });

  it("admin is owner-level on every business module except tenant:delete", () => {
    const ownerLevelChecks: { resource: string; actions: string[] }[] = [
      { resource: "users", actions: ["create", "edit", "delete"] },
      { resource: "customers", actions: ["create", "edit", "delete"] },
      { resource: "events", actions: ["create", "edit", "delete", "approve"] },
      { resource: "orders", actions: ["create", "edit", "delete"] },
      { resource: "menus", actions: ["create", "edit", "delete", "approve"] },
      { resource: "inventory", actions: ["create", "edit", "delete"] },
      { resource: "invoices", actions: ["create", "edit", "delete", "export"] },
      { resource: "settings", actions: ["edit"] },
    ];
    for (const { resource, actions } of ownerLevelChecks) {
      for (const action of actions) {
        expect(roles.owner.authorize({ [resource]: [action] }).success, `owner:${resource}:${action}`).toBe(true);
        expect(roles.admin.authorize({ [resource]: [action] }).success, `admin:${resource}:${action}`).toBe(true);
      }
    }
    expect(roles.admin.authorize({ tenant: ["view", "edit"] }).success).toBe(true);
  });

  it("admin can invite/manage teammates (Better Auth's own invitation/member grants), but cannot delete the organization itself", () => {
    expect(roles.admin.authorize({ invitation: ["create"] }).success).toBe(true);
    expect(roles.admin.authorize({ member: ["create"] }).success).toBe(true);
    expect(roles.admin.authorize({ organization: ["delete"] }).success).toBe(false);
    expect(roles.owner.authorize({ organization: ["delete"] }).success).toBe(true);
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
