import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { roles } from "@/lib/auth/permissions";
import { SENSITIVE_KEYS } from "@/lib/auth/role-matrix";

/**
 * Kitchen Team (AJ, 2026-10-17): moves the cooking stage and downloads the kitchen sheet through its own `kitchen` module,
 * with no general Orders access, no way to change approved order or menu content, and no commercial documents or prices.
 */
describe("Kitchen Team permissions", () => {
  const kitchen = roles.kitchen;

  it("can open the Kitchen Dashboard, move the cooking stage and download the kitchen PDF", () => {
    expect(kitchen.authorize({ kitchen: ["view", "updateStatus", "viewPdf"] }).success).toBe(true);
  });

  it("has no Orders, Quotations or Menus access, so it cannot edit or approve any order or menu content", () => {
    for (const resource of ["orders", "quotations", "menus"] as const) {
      for (const action of ["view", "create", "edit", "delete", ...(resource === "menus" ? ["approve"] : [])]) {
        expect(kitchen.authorize({ [resource]: [action] } as never).success, `${resource}:${action}`).toBe(false);
      }
    }
  });

  it("has no invoices, payments, expenses, reports or customers", () => {
    for (const resource of ["invoices", "payments", "expenses", "reports", "customers", "users", "tenant"] as const) {
      expect(kitchen.authorize({ [resource]: ["view"] } as never).success, resource).toBe(false);
    }
  });

  it("holds none of the sensitive keys, so no commercial PDF, price or cost", () => {
    for (const key of SENSITIVE_KEYS) expect(kitchen.authorize({ sensitive: [key] } as never).success, key).toBe(false);
  });

  it("only the Kitchen Dashboard's own action file uses the kitchen module as its permission", () => {
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(full);
        } else if (name === "actions.ts" && /kitchen: \[/.test(readFileSync(full, "utf8"))) {
          users.push(path.relative(process.cwd(), full).split(path.sep).join("/"));
        }
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(users).toEqual(["src/app/(app)/kitchen-dashboard/actions.ts"]);
  });
});
