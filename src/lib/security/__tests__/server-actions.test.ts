import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Chunk 17.3 — every Server Action is a public HTTP endpoint, so a missing check is an open door. This test reads the
 * source of every "use server" file and fails when an exported action
 *   1. does not call a sign-in / permission check (unless its file is one of the public-link files below), or
 *   2. takes a caller-supplied `organizationId` / `tenantId` (anyone could pass another kitchen's) unless it is a
 *      Super Admin action.
 * The first version of this check found three settings actions that did exactly that; they now read the kitchen from
 * the session.
 */

/** Files whose actions are reached through a no-login link; each checks its signed token / link id instead. */
const PUBLIC_LINK_FILES = [
  "src/app/[tenantSlug]/actions.ts",
  "src/app/menu-approval/[token]/actions.ts",
  "src/app/pay/[token]/actions.ts",
  "src/app/quote/[token]/actions.ts",
  "src/app/unsubscribe/[token]/actions.ts",
];

const AUTH_CALL = /require(ActiveOrganization|Permission|SuperAdmin|Session|Org)\b|guard\(\)|guarded\(|requireSuperAdminOrRedirect|getSession\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "generated" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

interface Action {
  file: string;
  name: string;
  signature: string;
  body: string;
}

function actions(): Action[] {
  const found: Action[] = [];
  for (const abs of walk(path.join(process.cwd(), "src"))) {
    const text = readFileSync(abs, "utf8");
    if (!/^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(text)) continue;
    const file = path.relative(process.cwd(), abs).split(path.sep).join("/");
    const parts = text.split(/\n(?=export (?:async )?function |export const \w+ = async)/).slice(1);
    for (const part of parts) {
      const m = /^export (?:async )?function (\w+)\(([^)]*)\)|^export const (\w+) = async/.exec(part);
      if (!m) continue;
      found.push({ file, name: m[1] ?? m[3], signature: m[2] ?? "", body: part.slice(0, 4000) });
    }
  }
  return found;
}

describe("server actions", () => {
  const all = actions();

  it("finds the actions (sanity check on the scanner)", () => {
    expect(all.length).toBeGreaterThan(60);
    expect(all.some((a) => a.name === "markNotificationReadAction")).toBe(true);
  });

  it("every action outside the public-link files checks who is calling", () => {
    const open = all.filter((a) => !PUBLIC_LINK_FILES.includes(a.file) && !AUTH_CALL.test(a.body)).map((a) => `${a.file}: ${a.name}`);
    expect(open).toEqual([]);
  });

  it("no action trusts a caller-supplied kitchen id (unless it is a Super Admin action)", () => {
    const risky = all
      .filter((a) => /\b(organizationId|tenantId|orgId)\b/.test(a.signature) && !/requireSuperAdmin/.test(a.body))
      .map((a) => `${a.file}: ${a.name}(${a.signature.trim()})`);
    expect(risky).toEqual([]);
  });

  it("the public-link files only contain the actions we expect to be public", () => {
    for (const file of PUBLIC_LINK_FILES) {
      const names = all.filter((a) => a.file === file);
      expect(names.length, file).toBeGreaterThan(0);
      for (const a of names) {
        // A public action must take a token / link id / draft id (never a kitchen id) as its identifier.
        expect(a.signature, `${file}: ${a.name}`).not.toMatch(/\borganizationId\b/);
      }
    }
  });
});

describe("signed-in pages and route handlers", () => {
  /** Pages every signed-in person may open: their own account, and the home screen. */
  const FOR_EVERYONE = [
    "src/app/(app)/dashboard/page.tsx",
    "src/app/(app)/settings/page.tsx",
    "src/app/(app)/settings/(sections)/account/user-profile/page.tsx",
    "src/app/(app)/settings/(sections)/account/change-password/page.tsx",
    "src/app/(app)/settings/(sections)/communication/push-notifications/page.tsx",
  ];

  function entryFiles(): string[] {
    return walk(path.join(process.cwd(), "src/app/(app)"))
      .map((abs) => path.relative(process.cwd(), abs).split(path.sep).join("/"))
      .filter((f) => /\/(page\.tsx|route\.ts)$/.test(f));
  }

  function guardedByLayout(file: string): boolean {
    let dir = path.dirname(file);
    while (dir.startsWith("src/app/(app)")) {
      const layout = path.join(process.cwd(), dir, "layout.tsx");
      try {
        if (/requirePermission/.test(readFileSync(layout, "utf8"))) return true;
      } catch {
        /* no layout in this folder */
      }
      dir = path.dirname(dir);
    }
    return false;
  }

  it("every page and route handler checks a permission itself or through a layout (except the pages for everyone)", () => {
    const open = entryFiles().filter((f) => {
      if (FOR_EVERYONE.includes(f)) return false;
      if (guardedByLayout(f)) return false;
      return !/requirePermission|hasPermission/.test(readFileSync(path.join(process.cwd(), f), "utf8"));
    });
    expect(open).toEqual([]);
  });
});
