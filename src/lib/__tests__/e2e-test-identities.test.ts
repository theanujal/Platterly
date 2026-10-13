import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Specs run in parallel workers that start in the same millisecond, so two specs that build a sign-up email (or a
 * public link) from the same prefix + Date.now() collide: the second sign-up fails with "Failed to create user" and
 * the spec stalls on the sign-up page (the "sign-up flake" of 2026-10-13, ISSUE-LOG.md). Every spec needs its own prefix.
 */
describe("e2e specs use their own sign-up email prefix", () => {
  const dir = path.join(process.cwd(), "e2e");
  const prefixes = new Map<string, Set<string>>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".spec.ts"))) {
    const source = readFileSync(path.join(dir, file), "utf8");
    for (const match of source.matchAll(/`(e2e-[a-z0-9-]+)-\$\{Date\.now\(\)\}@/g)) {
      if (!prefixes.has(match[1])) prefixes.set(match[1], new Set());
      prefixes.get(match[1])!.add(file);
    }
  }

  it("finds the prefixes at all (so the check below cannot pass by matching nothing)", () => {
    expect(prefixes.size).toBeGreaterThan(10);
  });

  it("no two spec files share an email prefix", () => {
    const shared = [...prefixes].filter(([, files]) => files.size > 1).map(([prefix, files]) => `${prefix}: ${[...files].join(", ")}`);
    expect(shared).toEqual([]);
  });
});
