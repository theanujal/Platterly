import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { TEST_DATABASE_NAME, TEST_ROLE_NAME } from "../target";
import {
  Credentials,
  GuardRefusal,
  GuardedTarget,
  INVENTORY_POLICY,
  PLATFORM_ROOT,
  Q,
  RunSequence,
  STAGE2_ALLOWED_PORTS,
  STAGE2_DIR,
  checkFingerprintFileFacts,
  diffLines,
  escapingEdges,
  expectedPublicTables,
  isInternalToastEdge,
  findUnsettled,
  fingerprintSha,
  loadCredentials,
  openGuarded,
  redact,
  type FileFacts,
  type Queryable,
  type Row,
} from "./db-target";

// Everything here runs without a database: the guard is driven through a fake client that records every statement it is given.

const PASSWORD = "pw-" + "a".repeat(45);
const TOKEN = "tok-" + "b".repeat(60);
const SYSTEM_ID = "7000000000000000001";
const LINES = ["schema|1|runner_guard|pgadmin|null", "rel|sentinel|r|2|pgadmin|null|false", "dep_out|0"];

const creds = () => new Credentials({ port: 55433, database: TEST_DATABASE_NAME, role: TEST_ROLE_NAME, systemIdentifier: SYSTEM_ID, dir: STAGE2_DIR, password: PASSWORD, token: TOKEN });
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const OBJECTS: Row[] = INVENTORY_POLICY.allowedObjects.map((key) => {
  const [kind, rest] = key.split(":");
  const [schema, name] = rest.split(".");
  return { schema, kind, name };
});

// The four edges found in the isolated test database after the migration (internal TOAST relations of public tables), and edges that must still refuse.
const toastEdge = (toast: string, owner: string): Row => ({ dep_schema: "pg_toast", dep_name: toast, dep_kind: "t", ref_schema: "public", ref_name: owner, ref_kind: "r", deptype: "i", both_relations: true, owned_toast: true });
const CONFIRMED_TOAST_EDGES: Row[] = [toastEdge("pg_toast_16453", "_prisma_migrations"), toastEdge("pg_toast_16462", "users"), toastEdge("pg_toast_16473", "user_identities"), toastEdge("pg_toast_16482", "legacy_mappings")];
const GENUINE_EDGE: Row = { dep_schema: "app", dep_name: "v_users", dep_kind: "v", ref_schema: "public", ref_name: "users", ref_kind: "r", deptype: "n", both_relations: true, owned_toast: false };

class FakeClient implements Queryable {
  statements: string[] = [];
  ended = false;
  answers = new Map<string, Row[] | Error>();

  constructor(patch: Array<[string, Row[] | Error]> = []) {
    const base: Array<[string, Row[]]> = [
      [Q.identity, [{ database: TEST_DATABASE_NAME, role: TEST_ROLE_NAME, port: 55433, version: 160015 }]],
      [Q.databases, [{ datname: TEST_DATABASE_NAME }, { datname: "postgres" }, { datname: "template0" }, { datname: "template1" }]],
      [Q.systemId, [{ id: SYSTEM_ID }]],
      [Q.sentinel, [{ token_sha256: sha(TOKEN), database_name: TEST_DATABASE_NAME, system_identifier: SYSTEM_ID }]],
      [Q.staticFingerprint, LINES.map((line) => ({ line }))],
      [Q.depEscape, []],
      [Q.runState, []],
      [Q.sessions, [{ n: 0 }]],
      [Q.lock, [{ locked: true }]],
      [Q.schemas, [{ nspname: "public" }, { nspname: "runner_guard" }]],
      [Q.extensions, [{ extname: "plpgsql" }]],
      [Q.objects, OBJECTS],
    ];
    for (const [text, rows] of base) this.answers.set(text, rows);
    for (const [text, rows] of patch) this.answers.set(text, rows);
  }

  async query(text: string): Promise<{ rows: Row[]; rowCount: number | null }> {
    this.statements.push(text);
    const answer = this.answers.get(text);
    if (answer instanceof Error) throw answer;
    if (answer) return { rows: answer, rowCount: answer.length };
    if (/^select count\(\*\)::int as n from public\./.test(text)) return { rows: [{ n: 0 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

async function attempt(credentials: Credentials, client: FakeClient, lines: readonly string[] = LINES) {
  let connects = 0;
  const outcome = await openGuarded(credentials, { connect: async () => (connects++, client), fingerprintLines: lines }).then(
    (target) => ({ target, error: null as GuardRefusal | null }),
    (error: GuardRefusal) => ({ target: null, error }),
  );
  return { ...outcome, connects };
}

const firstWord = (statement: string) => statement.trim().split(/\s+/)[0].toLowerCase();
const readOnly = (client: FakeClient) => client.statements.every((s) => ["select", "with", "show"].includes(firstWord(s)));

describe("guard: the correct target opens, with only SELECTs", () => {
  it("returns a guarded target and has issued nothing but SELECTs", async () => {
    const client = new FakeClient();
    const { target, error, connects } = await attempt(creds(), client);
    expect(error).toBeNull();
    expect(target).toBeInstanceOf(GuardedTarget);
    expect(connects).toBe(1);
    expect(client.statements.length).toBeGreaterThan(10);
    expect(readOnly(client)).toBe(true);
  });
});

describe("guard: a wrong value stops before any destructive statement", () => {
  it("refuses wrong ports without connecting, including the old cluster and 5432", async () => {
    for (const port of [55432, 5432, 55434, 0]) {
      const client = new FakeClient();
      const { error, connects } = await attempt(creds().withChanges({ port }), client);
      expect(error?.code, String(port)).toBe("port");
      expect(connects).toBe(0);
      expect(client.statements).toEqual([]);
    }
  });

  it("refuses a wrong database or role without connecting", async () => {
    for (const database of ["platterly_platform", "platterly_dev", "platterly_ops", "postgres", "platterly_platform_test2"]) {
      const client = new FakeClient();
      const { error, connects } = await attempt(creds().withChanges({ database }), client);
      expect(error?.code, database).toBe("database");
      expect(connects).toBe(0);
    }
    for (const role of ["platterly_platform_app", "pgadmin", "platterly_app"]) {
      const client = new FakeClient();
      const { error, connects } = await attempt(creds().withChanges({ role }), client);
      expect(error?.code, role).toBe("role");
      expect(connects).toBe(0);
    }
  });

  it("refuses a wrong sentinel token after SELECTs only, and closes the connection", async () => {
    const client = new FakeClient();
    const { error, connects } = await attempt(creds().withChanges({ token: "not-the-token" }), client);
    expect(error?.code).toBe("sentinel-token");
    expect(connects).toBe(1);
    expect(client.ended).toBe(true);
    expect(readOnly(client)).toBe(true);
  });

  it("refuses a wrong cluster identifier after SELECTs only", async () => {
    const client = new FakeClient();
    const { error } = await attempt(creds().withChanges({ systemIdentifier: "7000000000000000002" }), client);
    expect(error?.code).toBe("system-id");
    expect(client.ended).toBe(true);
    expect(readOnly(client)).toBe(true);
  });

  const cases: Array<[string, string, Array<[string, Row[] | Error]>]> = [
    ["connected to another database", "database", [[Q.identity, [{ database: "platterly_dev", role: TEST_ROLE_NAME, port: 55433, version: 160015 }]]]],
    ["connected as another role", "role", [[Q.identity, [{ database: TEST_DATABASE_NAME, role: "pgadmin", port: 55433, version: 160015 }]]]],
    ["server on another port", "port", [[Q.identity, [{ database: TEST_DATABASE_NAME, role: TEST_ROLE_NAME, port: 5432, version: 160015 }]]]],
    ["another major version", "version", [[Q.identity, [{ database: TEST_DATABASE_NAME, role: TEST_ROLE_NAME, port: 55433, version: 150010 }]]]],
    ["an extra database in the cluster", "cluster-databases", [[Q.databases, [{ datname: TEST_DATABASE_NAME }, { datname: "platterly_dev" }, { datname: "postgres" }, { datname: "template0" }, { datname: "template1" }]]]],
    ["the system identifier cannot be read", "system-id-privilege", [[Q.systemId, new Error("permission denied for function pg_control_system")]]],
    ["no sentinel row", "sentinel", [[Q.sentinel, []]]],
    ["two sentinel rows", "sentinel", [[Q.sentinel, [{}, {}]]]],
    ["sentinel names another database", "sentinel", [[Q.sentinel, [{ token_sha256: sha(TOKEN), database_name: "other", system_identifier: SYSTEM_ID }]]]],
    ["the guard fingerprint differs from the protected file", "fingerprint", [[Q.staticFingerprint, [...LINES.slice(1), "schema|1|runner_guard|someone_else|null"].map((line) => ({ line }))]]],
    ["a dependency leads from outside public into public", "dependency", [[Q.depEscape, [GENUINE_EDGE]]]],
    ["another session is connected", "other-sessions", [[Q.sessions, [{ n: 1 }]]]],
    ["the advisory lock is held elsewhere", "lock", [[Q.lock, [{ locked: false }]]]],
    ["an unexpected schema", "inventory", [[Q.schemas, [{ nspname: "public" }, { nspname: "runner_guard" }, { nspname: "extra" }]]]],
    ["an unexpected extension", "inventory", [[Q.extensions, [{ extname: "plpgsql" }, { extname: "pgcrypto" }]]]],
    ["an unexpected table", "inventory", [[Q.objects, [...OBJECTS, { schema: "public", kind: "table", name: "customers" }]]]],
    ["rows in an identity table", "inventory", [["select count(*)::int as n from public.\"users\"", [{ n: 2 }]]]],
  ];
  for (const [label, code, patch] of cases) {
    it(`refuses: ${label}`, async () => {
      const client = new FakeClient(patch);
      const { error, target } = await attempt(creds(), client);
      expect(target).toBeNull();
      expect(error).toBeInstanceOf(GuardRefusal);
      expect(error?.code).toBe(code);
      expect(readOnly(client)).toBe(true);
      expect(client.ended).toBe(true);
    });
  }
});

describe("guard: an unsettled run is a hard stop with no way to authorise recovery in code", () => {
  const unsettled: Row = { run_id: "11111111-1111-4111-8111-111111111111", outcome: "interrupted", last_step_no: 4, last_step_name: "history-checksum", recovered: false, settled: false };

  it("stops for manual inspection and reports the run, the last step and the database state", async () => {
    const client = new FakeClient([[Q.runState, [unsettled]]]);
    const { error } = await attempt(creds(), client);
    expect(error?.code).toBe("unsettled-run");
    const message = error?.message ?? "";
    expect(message).toContain("STOP for manual inspection");
    expect(message).toContain("11111111-1111-4111-8111-111111111111");
    expect(message).toContain("last completed step 4 history-checksum");
    expect(message).toContain("Database state:");
    expect(message).toContain("Nothing was reset, recovered or continued");
    expect(message).toContain("AJ's explicit approval naming the exact run id and exact action");
    expect(readOnly(client)).toBe(true);
  });

  it("treats failed and interrupted runs as unsettled until a recovery row exists, and finished runs as settled", () => {
    expect(findUnsettled([{ settled: false }, { settled: true }, { settled: false }])).toHaveLength(2);
    expect(findUnsettled([{ settled: true }])).toEqual([]);
  });

  it("offers no environment variable, flag or option that would authorise a recovery", async () => {
    const guardSource = readFileSync(path.join(PLATFORM_ROOT, "src/lib/migration-roundtrip/__tests__/db-target.ts"), "utf8");
    expect(guardSource).not.toMatch(/ACK_UNFINISHED|ALLOW_RECOVERY|RECOVER_RUN|acknowledg/i);
    const client = new FakeClient([[Q.runState, [unsettled]]]);
    const options = { connect: async () => client, fingerprintLines: LINES, ackRunId: unsettled.run_id, recover: true } as never;
    const error = await openGuarded(creds(), options).catch((e: GuardRefusal) => e);
    expect((error as GuardRefusal).code).toBe("unsettled-run");
  });
});

describe("run sequence: failures are visible and nothing resets", () => {
  function sequence() {
    const rows: Array<{ step: number; status: string; name: string }> = [];
    const target = {
      creds: creds(),
      logRow: async (_run: string, step: number, status: string, name: string) => void rows.push({ step, status, name }),
    } as unknown as GuardedTarget;
    return { rows, run: new RunSequence(target, "run-id", "test") };
  }

  it("numbers completed steps from 2 and finishes with the next number", async () => {
    const { rows, run } = sequence();
    await run.step("a", async () => 1);
    await run.step("b", async () => 2);
    await run.finish();
    expect(rows).toEqual([
      { step: 2, status: "step", name: "a" },
      { step: 3, status: "step", name: "b" },
      { step: 4, status: "finished", name: "complete" },
    ]);
  });

  it("records failed on a failing step and makes every later step and the finish fail without running", async () => {
    const { rows, run } = sequence();
    await run.step("a", async () => 1);
    await expect(run.step("b", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    let ran = false;
    await expect(run.step("c", async () => void (ran = true))).rejects.toThrow("earlier step failed: b");
    await expect(run.finish()).rejects.toThrow("earlier step failed: b");
    expect(ran).toBe(false);
    expect(rows.map((r) => r.status)).toEqual(["step", "failed"]);
    expect(rows.map((r) => r.status)).not.toContain("finished");
  });

  it("failed details never carry a secret", async () => {
    const details: string[] = [];
    const target = { creds: creds(), logRow: async (_r: string, _s: number, status: string, _n: string, detail?: string | null) => void (status === "failed" && details.push(detail ?? "")) } as unknown as GuardedTarget;
    const run = new RunSequence(target, "run-id", "test");
    await expect(run.step("x", async () => Promise.reject(new Error(`connection with ${PASSWORD} and ${TOKEN} failed`)))).rejects.toThrow();
    expect(details).toHaveLength(1);
    expect(details[0]).not.toContain(PASSWORD);
    expect(details[0]).not.toContain(TOKEN);
    expect(details[0]).toContain("[redacted]");
  });

  it("abandonIfOpen records failed once for an open run, and nothing for a finished or failed one", async () => {
    const open = sequence();
    await open.run.abandonIfOpen();
    await open.run.abandonIfOpen();
    expect(open.rows).toEqual([{ step: 2, status: "failed", name: "incomplete" }]);
    const finished = sequence();
    await finished.run.finish();
    await finished.run.abandonIfOpen();
    expect(finished.rows.map((r) => r.status)).toEqual(["finished"]);
    await expect(finished.run.step("late", async () => 1)).rejects.toThrow("already finished");
  });
});

describe("protected fingerprint file", () => {
  const good: FileFacts = { exists: true, isFile: true, isSymlink: false, uid: 501, expectedUid: 501, mode: 0o400, flags: "uchg" };
  const codeOf = (facts: FileFacts) => {
    try {
      checkFingerprintFileFacts(facts);
      return "ok";
    } catch (error) {
      return (error as GuardRefusal).code;
    }
  };

  it("accepts the expected owner, mode and immutable flag", () => {
    expect(codeOf(good)).toBe("ok");
    expect(codeOf({ ...good, flags: "hidden,uchg" })).toBe("ok");
  });

  it("refuses a missing file, a symlink, another owner and any other mode", () => {
    expect(codeOf({ ...good, exists: false })).toBe("fingerprint-file");
    expect(codeOf({ ...good, isSymlink: true })).toBe("fingerprint-file");
    expect(codeOf({ ...good, isFile: false })).toBe("fingerprint-file");
    expect(codeOf({ ...good, uid: 0 })).toBe("fingerprint-file");
    for (const mode of [0o600, 0o440, 0o444, 0o200, 0o000]) expect(codeOf({ ...good, mode })).toBe("fingerprint-file");
  });

  it("stops and asks when the immutable flag is missing or cannot be read", () => {
    expect(codeOf({ ...good, flags: "" })).toBe("fingerprint-immutable");
    expect(codeOf({ ...good, flags: "hidden" })).toBe("fingerprint-immutable");
    expect(codeOf({ ...good, flags: "nouchg" })).toBe("fingerprint-immutable");
    expect(codeOf({ ...good, flags: null })).toBe("fingerprint-immutable");
    try {
      checkFingerprintFileFacts({ ...good, flags: "-" });
    } catch (error) {
      expect((error as Error).message).toContain("stop and ask AJ");
    }
  });

  it("compares lines and checksums", () => {
    expect(fingerprintSha(["a", "b"])).toBe(sha("a\nb"));
    expect(diffLines(["a", "b"], ["b", "c"])).toEqual({ missing: ["a"], extra: ["c"] });
  });
});

describe("credentials", () => {
  it("are absent when no directory is configured, and refused for any directory but the approved one", () => {
    expect(loadCredentials(undefined)).toBeNull();
    expect(loadCredentials("")).toBeNull();
    for (const dir of ["/tmp/stage2", path.join(PLATFORM_ROOT, "stage2"), path.join(STAGE2_DIR, ".."), `${STAGE2_DIR}/x`]) {
      expect(() => loadCredentials(dir), dir).toThrow(GuardRefusal);
    }
  });

  it("keep their secrets out of JSON, inspection, string conversion and redacted text", () => {
    const c = creds();
    for (const text of [JSON.stringify(c), inspect(c), String(c), `${JSON.stringify(c.toJSON())}`]) {
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(TOKEN);
    }
    expect(redact(`x ${PASSWORD} y ${TOKEN} z`, c)).toBe("x [redacted] y [redacted] z");
    expect(c.url()).toContain(encodeURIComponent(PASSWORD));
    expect(c.tokenSha256()).toBe(sha(TOKEN));
  });

  it("allow only port 55433", () => {
    expect([...STAGE2_ALLOWED_PORTS]).toEqual([55433]);
  });
});

describe("expected tables by applied migration", () => {
  it("is empty for the baseline alone and the three identity tables once that migration is applied", () => {
    expect(expectedPublicTables(["20261101000000_baseline"])).toEqual([]);
    expect(expectedPublicTables([])).toEqual([]);
    expect(expectedPublicTables(["20261101000000_baseline", "20261104190000_identity_tables"])).toEqual(["legacy_mappings", "user_identities", "users"]);
  });
});

describe("dependency check: the TOAST exception is narrow", () => {
  it("does not count the four confirmed internal TOAST edges, and the guard opens with them present", async () => {
    expect(CONFIRMED_TOAST_EDGES.every(isInternalToastEdge)).toBe(true);
    expect(escapingEdges(CONFIRMED_TOAST_EDGES)).toEqual([]);
    const client = new FakeClient([[Q.depEscape, CONFIRMED_TOAST_EDGES]]);
    const { error, target } = await attempt(creds(), client);
    expect(error).toBeNull();
    expect(target).toBeInstanceOf(GuardedTarget);
    expect(readOnly(client)).toBe(true);
  });

  it("still refuses a genuine external dependency, with or without the TOAST edges, and names it", async () => {
    expect(escapingEdges([GENUINE_EDGE])).toEqual([GENUINE_EDGE]);
    for (const edges of [[GENUINE_EDGE], [...CONFIRMED_TOAST_EDGES, GENUINE_EDGE]]) {
      const client = new FakeClient([[Q.depEscape, edges]]);
      const { error, target } = await attempt(creds(), client);
      expect(target).toBeNull();
      expect(error?.code).toBe("dependency");
      expect(error?.message).toContain("1 dependency edge(s)");
      expect(error?.message).toContain("app.v_users");
      expect(error?.message).not.toContain("pg_toast_16462");
      expect(readOnly(client)).toBe(true);
    }
  });

  it("does not ignore an unrelated TOAST object: a TOAST relation that does not belong to the referenced table", async () => {
    const unrelated: Row = { ...toastEdge("pg_toast_99999", "users"), owned_toast: false };
    expect(isInternalToastEdge(unrelated)).toBe(false);
    const client = new FakeClient([[Q.depEscape, [...CONFIRMED_TOAST_EDGES, unrelated]]]);
    const { error } = await attempt(creds(), client);
    expect(error?.code).toBe("dependency");
    expect(error?.message).toContain("pg_toast_99999");
  });

  it("does not ignore an internal dependency that lacks the matching TOAST-parent relationship", async () => {
    const internalNoParent: Row = { dep_schema: "pg_toast", dep_name: "pg_toast_1", dep_kind: "i", ref_schema: "public", ref_name: "users", ref_kind: "r", deptype: "i", both_relations: true, owned_toast: false };
    const internalOutsideToast: Row = { ...toastEdge("pg_toast_16462", "users"), dep_schema: "app", dep_name: "shadow_toast" };
    for (const edge of [internalNoParent, internalOutsideToast]) {
      expect(isInternalToastEdge(edge)).toBe(false);
      const client = new FakeClient([[Q.depEscape, [edge]]]);
      expect((await attempt(creds(), client)).error?.code).toBe("dependency");
    }
  });

  it("needs every condition: changing any one fact of a valid TOAST edge makes it an escape", () => {
    const valid = toastEdge("pg_toast_16462", "users");
    expect(isInternalToastEdge(valid)).toBe(true);
    const mutations: Array<[string, Row]> = [
      ["dependent not in pg_toast", { ...valid, dep_schema: "public_copy" }],
      ["dependent in pg_catalog", { ...valid, dep_schema: "pg_catalog" }],
      ["referenced not in public", { ...valid, ref_schema: "runner_guard" }],
      ["automatic dependency", { ...valid, deptype: "a" }],
      ["normal dependency", { ...valid, deptype: "n" }],
      ["extension dependency", { ...valid, deptype: "e" }],
      ["unknown dependency type", { ...valid, deptype: "x" }],
      ["not both relations", { ...valid, both_relations: false }],
      ["owner not verified through reltoastrelid", { ...valid, owned_toast: false }],
      ["owner flag is a string", { ...valid, owned_toast: "true" }],
      ["owner flag missing", { ...valid, owned_toast: undefined }],
      ["relations flag missing", { ...valid, both_relations: undefined }],
      ["dependent schema missing", { ...valid, dep_schema: undefined }],
    ];
    for (const [label, edge] of mutations) expect(isInternalToastEdge(edge), label).toBe(false);
  });

  it("keeps the query's scope: the same eight catalogue classes as the fingerprint, and no blanket pg_toast filter", () => {
    const classes = (sql: string) => [...sql.matchAll(/'(pg_\w+)'::regclass::oid/g)].map((m) => m[1]).sort();
    const eight = ["pg_attrdef", "pg_class", "pg_constraint", "pg_namespace", "pg_proc", "pg_rewrite", "pg_trigger", "pg_type"];
    expect(classes(Q.depEscape)).toEqual(eight);
    expect(classes(Q.staticFingerprint)).toEqual(eight);
    const mainWhere = Q.depEscape.slice(Q.depEscape.lastIndexOf("where a.nspname"));
    expect(mainWhere.trim()).toBe("where a.nspname <> 'public' and b.nspname = 'public'\norder by 1, 2, 4, 5");
    for (const fact of ["reltoastrelid", "t.relkind = 't'", "'pg_toast'::regnamespace", "'public'::regnamespace", "p.oid = d.refobjid", "t.oid = d.objid"]) expect(Q.depEscape).toContain(fact);
  });
});

// Static scans of the Stage 2 files: where destructive statements, file writes, environment reads and recovery writes may appear.
describe("Stage 2 code stays inside its limits", () => {
  const files = [
    "src/lib/migration-roundtrip/__tests__/db-target.ts",
    "src/lib/migration-roundtrip/__tests__/identity-roundtrip.db.test.ts",
    "src/lib/migration-roundtrip/__tests__/final-verification.db.test.ts",
    "src/modules/users/__tests__/users-constraints.db.test.ts",
    "src/lib/__tests__/db.test.ts",
    "prisma.test.config.mjs",
  ];
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const code = Object.fromEntries(files.map((f) => [f, strip(readFileSync(path.join(PLATFORM_ROOT, f), "utf8"))]));
  const everything = Object.values(code).join("\n");

  it("has exactly one schema drop, in the guarded target, aimed at public", () => {
    const hits = Object.entries(code).flatMap(([f, c]) => [...c.matchAll(/DROP\s+SCHEMA[^"'`;]*/gi)].map((m) => `${f}: ${m[0].trim()}`));
    expect(hits).toEqual(["src/lib/migration-roundtrip/__tests__/db-target.ts: DROP SCHEMA public CASCADE"]);
  });

  it("has no other destructive or administrative statements anywhere", () => {
    expect(everything).not.toMatch(/DROP\s+DATABASE|CREATE\s+DATABASE|ALTER\s+SYSTEM|pg_terminate_backend|COPY\s+[^;]*PROGRAM|\bTRUNCATE\b|CREATE\s+ROLE|ALTER\s+ROLE|DROP\s+ROLE|\bGRANT\b|\bREVOKE\b/i);
  });

  it("deletes only the migration history row in the guard, plus row-level deletes of identity rows in the constraint tests and one old fixture string", () => {
    const hits = Object.entries(code).flatMap(([f, c]) => [...c.matchAll(/DELETE\s+FROM\s+[\w."]+/gi)].map((m) => ({ f, target: m[0].replace(/DELETE\s+FROM\s+/i, "") })));
    const allowed = (h: { f: string; target: string }) =>
      (h.f === files[0] && h.target === "public._prisma_migrations") ||
      (h.f === "src/lib/__tests__/db.test.ts" && h.target === '"account"') ||
      (h.f === "src/modules/users/__tests__/users-constraints.db.test.ts" && /^public\.(users|user_identities|legacy_mappings)$/.test(h.target));
    expect(hits.filter((h) => !allowed(h))).toEqual([]);
    expect(hits.filter((h) => h.f === files[0])).toHaveLength(1);
  });

  it("writes one file, only into the snapshots folder, and never touches the fingerprint file", () => {
    const others = Object.entries(code).filter(([f]) => f !== "src/lib/__tests__/db.test.ts").map(([, c]) => c).join("\n");
    expect([...others.matchAll(/writeFileSync/g)]).toHaveLength(2); // the import and the single call
    // db.test.ts keeps its original fixture: it writes migration files into its own temporary directory, nowhere else.
    expect([...code["src/lib/__tests__/db.test.ts"].matchAll(/writeFileSync\(([^;]*)\);/g)].map((m) => m[1])).toEqual(['join(dir, name, "migration.sql"), sql']);
    expect(code[files[0]]).toMatch(/writeFileSync\(path\.join\(STAGE2_DIR, "snapshots", name\)/);
    expect(everything).not.toMatch(/unlinkSync|rmSync|rmdirSync|renameSync|chmodSync|chownSync|copyFileSync|truncateSync|appendFileSync|createWriteStream|chflags/);
    expect([...everything.matchAll(/expected-fingerprint\.json/g)]).toHaveLength(1);
  });

  it("never writes to the recovery log and has no recovery switch", () => {
    expect(everything).not.toMatch(/insert\s+into\s+runner_guard\.recovery_log/i);
    expect(everything).not.toMatch(/ACK_UNFINISHED|ALLOW_RECOVERY|RECOVER_RUN/i);
    expect(everything).not.toMatch(/update\s+runner_guard|delete\s+from\s+runner_guard/i);
  });

  it("keeps the fingerprint override out of every database test", () => {
    for (const f of files.filter((name) => name !== files[0])) expect(code[f], f).not.toContain("fingerprintLines");
  });

  it("reads only the permitted environment variables", () => {
    const allowed: Record<string, string[]> = {
      "src/lib/migration-roundtrip/__tests__/db-target.ts": ["PATH"],
      "src/lib/migration-roundtrip/__tests__/identity-roundtrip.db.test.ts": ["PLATFORM_TEST_CREDENTIALS_DIR"],
      "src/lib/migration-roundtrip/__tests__/final-verification.db.test.ts": ["PLATFORM_TEST_CREDENTIALS_DIR"],
      "src/modules/users/__tests__/users-constraints.db.test.ts": ["PLATFORM_TEST_CREDENTIALS_DIR"],
      "src/lib/__tests__/db.test.ts": ["DATABASE_URL", "PLATFORM_TEST_CREDENTIALS_DIR"],
      "prisma.test.config.mjs": ["PLATFORM_TEST_CREDENTIALS_DIR"],
    };
    for (const f of files) {
      const used = [...new Set([...code[f].matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]))].sort();
      expect(used.every((name) => allowed[f].includes(name)), `${f}: ${used.join(",")}`).toBe(true);
    }
  });

  it("keeps the constraint tests to row-level statements", () => {
    expect(code["src/modules/users/__tests__/users-constraints.db.test.ts"]).not.toMatch(/\b(CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\b/);
  });

  it("agrees with the pure target validator on the approved names and port", () => {
    const config = code["prisma.test.config.mjs"];
    expect(config).toContain(`const DATABASE = "${TEST_DATABASE_NAME}"`);
    expect(config).toContain(`const ROLE = "${TEST_ROLE_NAME}"`);
    expect(config).toContain(`const PORT = ${STAGE2_ALLOWED_PORTS[0]}`);
    expect(config).not.toMatch(/dotenv|["'`]\.env|DATABASE_URL/);
  });

  it("starts every database test file through the guard and only when credentials are configured", () => {
    for (const f of files.filter((name) => name.endsWith(".db.test.ts"))) {
      expect(code[f], f).toContain("describe.skipIf(");
      expect(code[f], f).toContain("openGuarded(");
    }
  });
});
