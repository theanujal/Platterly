import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// F3.1.2 Chunk A: static guards. They read source text only; no database, no network.
//
// Guard 1: only the users module (and the database client and the migration round-trip tooling) may touch the identity tables.
//          Every other module must go through findOrCreateBySubject.
// Guard 2: only the allowed files may import the assertion minting function. It does not verify provider tokens; it may be called
//          only after trusted provider-token validation (the future F4.2.2 code).

const SRC = fileURLToPath(new URL("../../../", import.meta.url));

/** Paths (relative to `src/`, forward slashes) that may use the identity tables directly. */
const TABLE_ACCESS_ALLOWED = ["modules/users/", "lib/db.ts", "lib/migration-roundtrip/"];

/**
 * Production code that may import `mintProviderEmailAssertion`: ONLY the code that validates the provider's tokens. The Foundation Plan names no
 * path for it (the F4.2.2 row gives no file); it was placed at `modules/auth/oidc-client.ts` on 2026-11-06 when AJ told the F4 work to start.
 * That location is NOT separately confirmed by AJ: moving it means changing this one line. A path is added here only for code that has already
 * verified signature, issuer, audience, expiry, nonce and the provider's own email_verified claim.
 * Second importer, approved by AJ on 2026-11-10: `modules/organisations/business-created.ts`. A person who first signed in through a product reaches the Platform
 * by that product's signed "business created" message. It checks the product's signature, then reads the identity provider's OWN record for that person and
 * refuses unless that record says the email is verified (the 6-digit code at sign-up). It never takes the email, or the verified flag, from the product.
 * Tests under modules/users/__tests__/ are always allowed.
 */
export const PRODUCTION_MINT_IMPORTERS: string[] = ["modules/auth/oidc-client.ts", "modules/organisations/business-created.ts"];

const MINT = "mintProviderEmailAssertion";
const ASSERTION_MODULE_FILE = "modules/users/provider-assertion.ts";
const ASSERTION_VERIFIER_FILE = "modules/users/identity-link.ts";
const USERS_TESTS = "modules/users/__tests__/";

const DELEGATE_CALL =
  /\b(user|userIdentity|legacyMapping)\s*\.\s*(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany|count|aggregate|groupBy)\b/;
const RAW_TABLE = /\b(from|into|update|join)\s+(public\.)?"?(users|user_identities|legacy_mappings)"?(?![\w])/i;
const ASSERTION_IMPORT = /from\s+["'][^"']*provider-assertion["']/;

export type Violation = { file: string; rule: string };

export function findViolations(files: Record<string, string>): Violation[] {
  const found: Violation[] = [];
  for (const [file, text] of Object.entries(files)) {
    const tableOk = TABLE_ACCESS_ALLOWED.some((p) => file === p || file.startsWith(p));
    if (!tableOk && (DELEGATE_CALL.test(text) || RAW_TABLE.test(text))) found.push({ file, rule: "direct access to the identity tables outside the users module" });

    const mintOk = file === ASSERTION_MODULE_FILE || file.startsWith(USERS_TESTS) || PRODUCTION_MINT_IMPORTERS.includes(file);
    if (!mintOk && text.includes(MINT)) found.push({ file, rule: "uses mintProviderEmailAssertion without being an allowed importer" });

    const importOk = mintOk || file === ASSERTION_VERIFIER_FILE;
    if (!importOk && ASSERTION_IMPORT.test(text)) found.push({ file, rule: "imports the provider-assertion module without being an allowed importer" });
  }
  return found;
}

function readTree(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SRC, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (rel === "generated" || entry.name === "node_modules") continue;
      readTree(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out[rel] = readFileSync(full, "utf8");
    }
  }
  return out;
}

describe("identity-link static guards", () => {
  const tree = readTree(SRC);

  it("scans the real source tree and finds a sensible number of files (the guard is not vacuous)", () => {
    expect(Object.keys(tree).length).toBeGreaterThan(20);
    expect(tree["modules/users/identity-link.ts"]).toBeDefined();
    expect(tree["modules/users/provider-assertion.ts"]).toBeDefined();
  });

  it("no module outside the users module touches the identity tables, and only allowed files import the minting function", () => {
    expect(findViolations(tree)).toEqual([]);
  });

  it("exactly two production importers of mintProviderEmailAssertion are allowed: the OIDC client that validates the provider's tokens, and the business-created receiver that reads the provider's own verified record", () => {
    expect(PRODUCTION_MINT_IMPORTERS).toEqual(["modules/auth/oidc-client.ts", "modules/organisations/business-created.ts"]);
    const client = tree["modules/auth/oidc-client.ts"];
    expect(client).toBeDefined();
    // The assertion is minted only after the token checks: the mint call comes after signature, issuer, audience, nonce and email_verified.
    const at = (needle: string) => client.indexOf(needle);
    for (const check of ["jwtVerify", "issuer:", "audience:", "equal(claims.nonce", "email_verified !== true"]) expect(at(check), check).toBeGreaterThan(-1);
    const mintAt = client.lastIndexOf(MINT);
    for (const check of ["jwtVerify", "equal(claims.nonce", "email_verified !== true"]) expect(at(check), `${check} must precede the mint`).toBeLessThan(mintAt);

    // The receiver mints only after the product's signature checked out and the provider's own record said the email is verified; the email comes from that record.
    const receiver = tree["modules/organisations/business-created.ts"];
    expect(receiver).toBeDefined();
    const rAt = (needle: string) => receiver.indexOf(needle);
    for (const check of ["verifyPlatformRequest", "deps.readPerson(", "!person.emailVerified"]) expect(rAt(check), check).toBeGreaterThan(-1);
    const rMint = receiver.lastIndexOf(MINT);
    for (const check of ["verifyPlatformRequest", "!person.emailVerified"]) expect(rAt(check), `${check} must precede the mint`).toBeLessThan(rMint);
    expect(receiver).toContain("email: person.email");
  });

  it("the service imports only the verifier from provider-assertion, never the minting function", () => {
    const service = tree["modules/users/identity-link.ts"];
    expect(service).toContain('from "./provider-assertion"');
    expect(service).toContain("assertionMatches");
    expect(service.includes(MINT)).toBe(false);
  });

  it("the service makes no update or delete call and no separate identity write", () => {
    const code = tree["modules/users/identity-link.ts"].split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(/\.(update|updateMany|upsert|delete|deleteMany|createMany)\s*\(/.test(code)).toBe(false);
    expect(/userIdentity\s*\.\s*(create|update|delete|upsert)/.test(code)).toBe(false);
  });

  it("detects violations (so the guard can fail)", () => {
    const bad = findViolations({
      "modules/orders/order.ts": "const u = await prisma.user.findUnique({ where: { id } });",
      "modules/orders/other.ts": "await tx.userIdentity.create({ data })",
      "modules/orders/mapping.ts": "legacyMapping.upsert(x)",
      "modules/orders/raw.ts": 'await db.$queryRaw`select id from public.users where email = ${e}`',
      "modules/orders/raw2.ts": 'await client.query("insert into user_identities (user_id) values ($1)")',
      "app/api/auth/route.ts": `import { ${MINT} } from "@/modules/users/provider-assertion";`,
      "lib/helper.ts": `const a = ${MINT}({});`,
      "modules/other/uses.ts": 'import { assertionMatches } from "@/modules/users/provider-assertion";',
    });
    expect(bad.map((v) => v.file).sort()).toEqual(
      ["app/api/auth/route.ts", "app/api/auth/route.ts", "lib/helper.ts", "modules/orders/mapping.ts", "modules/orders/order.ts", "modules/orders/other.ts", "modules/orders/raw.ts", "modules/orders/raw2.ts", "modules/other/uses.ts"].sort(),
    );
  });

  it("allows the intended files (so the guard does not over-block)", () => {
    expect(
      findViolations({
        "modules/users/identity-link.ts": 'import { assertionMatches } from "./provider-assertion"; db.user.create(x); db.userIdentity.findUnique(y);',
        "modules/users/provider-assertion.ts": `export function ${MINT}() {}`,
        "modules/users/__tests__/identity-link.test.ts": `import { ${MINT} } from "../provider-assertion"; db.user.findUnique(x);`,
        "lib/db.ts": "export const prisma = x;",
        "lib/migration-roundtrip/__tests__/db-target.ts": "select * from public.users",
        "components/account/views.tsx": "const user = account.profile;",
      }),
    ).toEqual([]);
  });

  it("a production file is allowed to import the minting function only once it is added to the allowlist", () => {
    const files = { "modules/auth/validate-token.ts": `import { ${MINT} } from "@/modules/users/provider-assertion";` };
    expect(findViolations(files).length).toBeGreaterThan(0);
    const before = [...PRODUCTION_MINT_IMPORTERS];
    PRODUCTION_MINT_IMPORTERS.push("modules/auth/validate-token.ts");
    try {
      expect(findViolations(files)).toEqual([]);
    } finally {
      PRODUCTION_MINT_IMPORTERS.pop();
    }
    expect(PRODUCTION_MINT_IMPORTERS).toEqual(before);
  });
});
