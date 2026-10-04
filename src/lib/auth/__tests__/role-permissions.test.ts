import { describe, expect, it } from "vitest";
import { describeRolePermissions } from "../role-permissions";
import { INVITABLE_ROLE_DEFINITIONS } from "../role-metadata";
import { INVITATION_EXPIRES_IN_SECONDS, INVITATION_EXPIRY_HOURS } from "@/modules/team/invitation-config";

describe("describeRolePermissions (derived from the real grants)", () => {
  it("staff is read-only: every included line is view-only", () => {
    const { included, excluded } = describeRolePermissions("staff");
    expect(included).toContain("View customers");
    expect(included).toContain("View orders");
    expect(included.every((line) => line.startsWith("View "))).toBe(true);
    expect(excluded).toEqual(expect.arrayContaining(["Invoices", "Payments", "Team members", "Settings"]));
  });

  it("manager can create/edit but never delete, and has no team or settings write access", () => {
    const { included } = describeRolePermissions("manager");
    expect(included).toContain("View, create and edit customers");
    expect(included).toContain("View and create invoices");
    expect(included.some((line) => /delete/i.test(line))).toBe(false); // staff scheduling is view, create and edit only
    expect(included).toContain("View settings");
  });

  it("salesEvents owns menu approval; kitchen does not", () => {
    expect(describeRolePermissions("salesEvents").included).toContain("View and approve menus");
    expect(describeRolePermissions("kitchen").included).toContain("View and edit menus");
    expect(describeRolePermissions("kitchen").included.join(" ")).not.toMatch(/approve/);
  });

  it("accounts gets invoices and payments, no customers", () => {
    const { included, excluded } = describeRolePermissions("accounts");
    expect(included).toContain("View, create, edit and export invoices");
    expect(included).toContain("View, create and manage payments");
    expect(excluded).toContain("Customers");
  });

  it("every invitable role has a description and at least one included permission", () => {
    for (const role of INVITABLE_ROLE_DEFINITIONS) {
      expect(role.description.length).toBeGreaterThan(0);
      expect(describeRolePermissions(role.id).included.length).toBeGreaterThan(0);
    }
  });
});

describe("invitation expiry", () => {
  it("is 48 hours", () => {
    expect(INVITATION_EXPIRY_HOURS).toBe(48);
    expect(INVITATION_EXPIRES_IN_SECONDS).toBe(172_800);
  });
});
