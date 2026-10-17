import { describe, expect, it } from "vitest";
import { describeRolePermissions } from "../role-permissions";
import { INVITABLE_ROLE_DEFINITIONS } from "../role-metadata";
import { INVITATION_EXPIRES_IN_SECONDS, INVITATION_EXPIRY_HOURS } from "@/modules/team/invitation-config";

describe("describeRolePermissions (derived from the real grants)", () => {
  it("staff is read-only on Orders and Quotations only, with no prices", () => {
    const { included, excluded, data } = describeRolePermissions("staff");
    expect(included).toEqual(["View quotations", "View orders"]);
    expect(included.every((line) => line.startsWith("View "))).toBe(true);
    expect(excluded).toEqual(expect.arrayContaining(["Customers", "Inventory", "Invoices", "Payments", "Team members", "Settings"]));
    expect(data).toBe("No prices or costs");
  });

  it("manager can create/edit but never delete, and has no team or settings write access", () => {
    const { included } = describeRolePermissions("manager");
    expect(included).toContain("View, create and edit customers");
    expect(included).toContain("View and create invoices");
    // The one delete a manager has is the Staff page's (floor staff records); every other line is delete-free.
    expect(included.filter((line) => /delete/i.test(line))).toEqual(["View, create, edit and delete staff scheduling"]);
    expect(included).toContain("View settings");
    expect(describeRolePermissions("manager").data).toBe("No prices or costs");
  });

  it("salesEvents owns menu approval; kitchen does not", () => {
    expect(describeRolePermissions("salesEvents").included).toContain("View and approve menus");
    expect(describeRolePermissions("kitchen").included).toContain("Work the kitchen dashboard, update cooking status, download the kitchen order PDF");
    expect(describeRolePermissions("kitchen").included.join(" ")).not.toMatch(/approve/);
  });

  it("accounts gets invoices and payments, reads customers and orders to bill them, and sees the prices that needs", () => {
    const { included } = describeRolePermissions("accounts");
    expect(included).toContain("View, create, edit and export invoices");
    expect(included).toContain("View, create and manage payments");
    expect(describeRolePermissions("accounts").data).toBe("See order and quotation prices, payment details, financial reports and customer-facing documents");
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
