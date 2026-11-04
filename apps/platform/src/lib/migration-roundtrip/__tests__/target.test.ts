import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEST_DATABASE_NAME, TEST_ROLE_NAME, validateTestTarget } from "../target";

const PORTS = [55432];
const good = `postgresql://${TEST_ROLE_NAME}:secret-pw@127.0.0.1:55432/${TEST_DATABASE_NAME}`;

describe("validateTestTarget", () => {
  it("accepts the approved role and database on an allowed loopback port", () => {
    expect(validateTestTarget(good, PORTS)).toEqual({ ok: true, host: "127.0.0.1", port: 55432, database: TEST_DATABASE_NAME, role: TEST_ROLE_NAME });
    expect(validateTestTarget(good.replace("127.0.0.1", "localhost"), PORTS).ok).toBe(true);
    expect(validateTestTarget(good.replace("127.0.0.1", "[::1]"), PORTS).ok).toBe(true);
    expect(validateTestTarget(good.replace(":secret-pw", ""), PORTS).ok).toBe(true);
  });

  it("has the approved names", () => {
    expect(TEST_DATABASE_NAME).toBe("platterly_platform_test");
    expect(TEST_ROLE_NAME).toBe("platterly_platform_test_app");
  });

  it("requires the allowed ports as an argument: none, empty or invalid refuses", () => {
    expect(validateTestTarget(good, [])).toMatchObject({ ok: false });
    expect(validateTestTarget(good, undefined as unknown as number[])).toMatchObject({ ok: false });
    for (const bad of [[0], [-1], [70000], [1.5], [Number.NaN]]) expect(validateTestTarget(good, bad)).toMatchObject({ ok: false });
  });

  it("refuses a port that is not allowed, and a URL with no explicit port", () => {
    expect(validateTestTarget(good, [5432])).toMatchObject({ ok: false });
    expect(validateTestTarget(good.replace(":55432", ""), [5432, 55432])).toMatchObject({ ok: false });
  });

  it("refuses the wrong database, including look-alikes", () => {
    for (const db of ["platterly_platform", "platterly_dev", "platterly_ops", "platterly_member_lock_test", "platterly_platform_test2", "xplatterly_platform_test", "PLATTERLY_PLATFORM_TEST", "postgres", ""]) {
      expect(validateTestTarget(good.replace(TEST_DATABASE_NAME, db), PORTS)).toMatchObject({ ok: false });
    }
    expect(validateTestTarget(`${good}/`, PORTS)).toMatchObject({ ok: false });
    expect(validateTestTarget(good.replace(TEST_DATABASE_NAME, "platterly_platform_test%20"), PORTS)).toMatchObject({ ok: false });
  });

  it("refuses the wrong role", () => {
    for (const role of ["platterly_platform_app", "platterly_app", "postgres", "pgadmin", "platterly_platform_test_app2"]) {
      expect(validateTestTarget(good.replace(TEST_ROLE_NAME, role), PORTS)).toMatchObject({ ok: false });
    }
    expect(validateTestTarget(`postgresql://127.0.0.1:55432/${TEST_DATABASE_NAME}`, PORTS)).toMatchObject({ ok: false });
  });

  it("refuses any host that is not loopback", () => {
    for (const host of ["example.com", "10.0.0.5", "192.168.1.9", "0.0.0.0", "localhost.evil.test", "127.0.0.1.evil.test", "[::2]", "db.internal"]) {
      expect(validateTestTarget(good.replace("127.0.0.1", host), PORTS)).toMatchObject({ ok: false });
    }
  });

  it("refuses query parameters, fragments and the wrong scheme", () => {
    for (const suffix of ["?host=elsewhere", "?sslmode=require", "?", "#x", "?host=/tmp&port=5432"]) {
      expect(validateTestTarget(good + suffix, PORTS)).toMatchObject({ ok: false });
    }
    expect(validateTestTarget(good.replace("postgresql:", "postgres:"), PORTS)).toMatchObject({ ok: false });
    expect(validateTestTarget(good.replace("postgresql:", "http:"), PORTS)).toMatchObject({ ok: false });
  });

  it("refuses empty, missing, malformed and whitespace input", () => {
    for (const bad of ["", " ", "not a url", `${good} `, ` ${good}`, `${good}\n`, "postgresql://", undefined, null, 5]) {
      expect(validateTestTarget(bad as unknown as string, PORTS)).toMatchObject({ ok: false });
    }
  });

  it("never repeats the URL or its password in a refusal", () => {
    for (const url of [good.replace("127.0.0.1", "example.com"), `${good}?host=x`, good.replace(TEST_DATABASE_NAME, "platterly_dev")]) {
      const result = validateTestTarget(url, PORTS);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("secret-pw");
    }
  });
});

// The four helpers must stay pure: no connection, process, file, network or environment access, and no reset statement.
describe("migration-roundtrip purity", () => {
  const ALLOWED_IMPORTS: Record<string, string[]> = {
    "target.ts": [],
    "down-sql.ts": [],
    "history.ts": ["node:crypto"],
    "inventory.ts": [],
  };

  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");

  for (const [file, allowed] of Object.entries(ALLOWED_IMPORTS)) {
    it(`${file} imports only ${allowed.length ? allowed.join(", ") : "nothing"} and touches no environment, process, network or reset`, () => {
      const code = stripComments(readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8"));
      const specifiers = [...code.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(specifiers).toEqual(allowed);
      expect(code).not.toMatch(/\bimport\s*\(/);
      expect(code).not.toMatch(/\brequire\s*\(/);
      expect(code).not.toMatch(/\bprocess\b/);
      expect(code).not.toMatch(/\bglobalThis\b/);
      expect(code).not.toMatch(/\bfetch\b/);
      expect(code).not.toMatch(/\bnew\s+(Pool|Client|PrismaClient)\b/);
      expect(code).not.toMatch(/\bspawn|\bexec(Sync|File)?\s*\(/);
      expect(code).not.toMatch(/DROP\s+SCHEMA|DROP\s+DATABASE|CREATE\s+DATABASE|pg_advisory/i);
    });
  }
});
