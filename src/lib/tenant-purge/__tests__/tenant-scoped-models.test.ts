import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TENANT_SCOPED_DELEGATES, PURGE_EXEMPT_MODELS } from "../tenant-scoped-models";

function pascalToCamel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Guardrail for `tenant-scoped-models.ts`'s hand-maintained arrays (see that
 * file's own comment for why Prisma 7.10.0 offers no runtime alternative).
 * Parses `prisma/schema.prisma` as text — the actual source of truth — and
 * fails the moment a new `organizationId`-bearing model is added without
 * being classified into one of the two arrays, in either direction.
 */
describe("tenant-scoped-models guardrail", () => {
  it("every organizationId-bearing model in schema.prisma is classified as purged or exempt, with none left out", () => {
    const schema = readFileSync(resolve(__dirname, "../../../../prisma/schema.prisma"), "utf-8");
    const modelBlocks = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)];

    const organizationScopedModels = modelBlocks
      .filter(([, , body]) => /^\s*organizationId\s+String/m.test(body))
      .map(([, name]) => name);

    expect(organizationScopedModels.length).toBeGreaterThan(0);

    const classified = new Set([
      ...TENANT_SCOPED_DELEGATES.map((delegate) => delegate.charAt(0).toUpperCase() + delegate.slice(1)),
      ...PURGE_EXEMPT_MODELS,
    ]);

    for (const modelName of organizationScopedModels) {
      expect(classified.has(modelName), `${modelName} has organizationId but isn't in TENANT_SCOPED_DELEGATES or PURGE_EXEMPT_MODELS`).toBe(true);
    }

    // And the reverse: nothing classified should reference a model that no longer exists.
    const schemaModelNames = new Set(modelBlocks.map(([, name]) => name));
    for (const delegate of TENANT_SCOPED_DELEGATES) {
      const modelName = delegate.charAt(0).toUpperCase() + delegate.slice(1);
      expect(schemaModelNames.has(modelName), `TENANT_SCOPED_DELEGATES references "${modelName}", which no longer exists in schema.prisma`).toBe(true);
    }
    for (const modelName of PURGE_EXEMPT_MODELS) {
      expect(schemaModelNames.has(modelName), `PURGE_EXEMPT_MODELS references "${modelName}", which no longer exists in schema.prisma`).toBe(true);
    }
  });

  it("pascalToCamel sanity check matches Prisma's actual delegate naming for the multi-capital model", () => {
    // WhatsAppMessage -> whatsAppMessage (Prisma lowercases only the first
    // letter, not a full camelCase re-derivation) — the one name in this
    // list where a naive "lowercase everything before the first cap run"
    // approach would get it wrong.
    expect(pascalToCamel("WhatsAppMessage")).toBe("whatsAppMessage");
    expect(TENANT_SCOPED_DELEGATES).toContain("whatsAppMessage");
  });
});
