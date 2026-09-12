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
