import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkHistory } from "../../../lib/migration-roundtrip/history";
import { Credentials, GuardedTarget, IDENTITY_TABLES, ORG_TABLES, RunSequence, loadCredentials, migrationFolders, openGuarded, type ScenarioQuery } from "../../../lib/migration-roundtrip/__tests__/db-target";
import { EMAIL_TRIM_CODES, normaliseEmail } from "../email";

// Run 2 of 4 (constraint tests): real PostgreSQL behaviour of the identity tables. Every case runs inside a transaction that is rolled back,
// so the tables stay empty and nothing here changes the database or the guard. The database is expected to be migrated already (run 1).
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);

type Placement = "lead" | "trail" | "both" | "inner";
const PLACEMENTS: Placement[] = ["lead", "trail", "both", "inner"];
const build = (ch: string, placement: Placement): string => (placement === "lead" ? `${ch}a@x.in` : placement === "trail" ? `a@x.in${ch}` : placement === "both" ? `${ch}a@x.in${ch}` : `a${ch}b@x.in`);

type Outcome = "ok" | "trim" | "lower" | "nul" | string;
async function raw(q: ScenarioQuery, email: string): Promise<Outcome> {
  const result = await q.attempt("insert into public.users (email) values ($1)", [email]);
  if (result.ok) return "ok";
  if (result.constraint === "users_email_trimmed") return "trim";
  if (result.constraint === "users_email_lowercase") return "lower";
  if (result.code === "22021") return "nul";
  return `other:${result.code}:${result.constraint}`;
}

const SIX = new Set<number>(EMAIL_TRIM_CODES);
function expectedOutcome(code: number, placement: Placement): Outcome {
  if (code === 0) return "nul";
  const ch = String.fromCharCode(code);
  if (SIX.has(code) && placement !== "inner") return "trim";
  if (ch !== ch.toLowerCase()) return "lower";
  return "ok";
}

const hex = (s: string) => [...s].map((c) => "U+" + (c.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")).join(" ");

// Characters JavaScript and PostgreSQL may lower-case differently, plus Unicode whitespace the database CHECK does not trim.
// U+0085 is a control character that JavaScript does not treat as whitespace, so it belongs to the case corpus, not the whitespace list.
const CASE_CORPUS = ["\u0085", "é", "É", "ß", "ẞ", "İ", "ı", "I", "Σ", "σ", "ς", "Ǆ", "ǅ", "ǆ", "Ꭰ", "ꭰ", "Ⴀ", "ⴀ", "Ａ", "ａ", "\u00c5", "\u212b", "\u212a", "\u2126", "ﬃ", "ŉ", "i\u0307", "\u{1f600}", "Ǉ", "ǈ"];
const UNICODE_SPACE = ["\u00a0", "\u1680", "\u2000", "\u2001", "\u2002", "\u2003", "\u2004", "\u2005", "\u2006", "\u2007", "\u2008", "\u2009", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff"];

describe.skipIf(credentials === null)("R2 identity constraints on a real PostgreSQL (isolated test database)", () => {
  const creds = credentials as Credentials;
  let target: GuardedTarget;
  let run: RunSequence;

  beforeAll(async () => {
    target = await openGuarded(creds, { applicationName: "platform-stage2-guard:constraints" });
    run = await target.beginRun("constraints");
    console.log(`R2 run id: ${run.runId}`);
  });

  afterAll(async () => {
    try {
      await run?.abandonIfOpen();
    } finally {
      await target?.close();
    }
  });

  it("preconditions: both migrations applied, the identity tables exist and are empty", () =>
    run.step("preconditions", async () => {
      const verdict = checkHistory(await target.migrationRows(), migrationFolders());
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
      expect(await target.publicRelations()).toEqual(["_prisma_migrations", ...IDENTITY_TABLES, ...ORG_TABLES].sort());
      expect(await target.identityCounts()).toEqual({ legacy_mappings: 0, user_identities: 0, users: 0 });
    }));

  it("ascii-matrix: code points 0 to 127 at the start, end, both ends and inside an address", () =>
    run.step("ascii-matrix", async () => {
      const mismatches: string[] = [];
      const helperViolations: string[] = [];
      const tally: Record<string, number> = {};
      await target.rollbackScenario(async (q) => {
        for (let code = 0; code < 128; code++) {
          const ch = String.fromCharCode(code);
          for (const placement of PLACEMENTS) {
            const email = build(ch, placement);
            const got = await raw(q, email);
            tally[got] = (tally[got] ?? 0) + 1;
            const want = expectedOutcome(code, placement);
            if (got !== want) mismatches.push(`code ${code} ${placement}: database ${got}, expected ${want}`);
            // Whatever the helper returns must be accepted by the database.
            if (code !== 0) {
              const normalised = normaliseEmail(email);
              if (normalised !== null && (await raw(q, normalised)) !== "ok") helperViolations.push(`code ${code} ${placement}: helper output ${JSON.stringify(normalised)} refused`);
            }
          }
        }
      });
      console.log(`ascii matrix (512 raw inserts): ${JSON.stringify(tally)}`);
      expect(mismatches).toEqual([]);
      expect(helperViolations).toEqual([]);
    }));

  it("ascii-v-and-ends: the letter v is never trimmed, and each of the six characters is trimmed only at the ends", () =>
    run.step("ascii-v-and-ends", async () => {
      await target.rollbackScenario(async (q) => {
        for (const email of ["v@x.in", "vv@x.in", "vikram@x.in", "a@xv", "v"]) expect(await raw(q, email), email).toBe("ok");
        for (const code of EMAIL_TRIM_CODES) {
          const ch = String.fromCharCode(code);
          expect(await raw(q, build(ch, "lead")), `lead ${code}`).toBe("trim");
          expect(await raw(q, build(ch, "trail")), `trail ${code}`).toBe("trim");
          expect(await raw(q, build(ch, "inner")), `inner ${code}`).toBe("ok");
        }
        expect(await raw(q, ""), "empty").not.toBe("ok");
      });
    }));

  it("unicode-corpus: JavaScript and PostgreSQL lower-casing, and Unicode whitespace the database does not trim", () =>
    run.step("unicode-corpus", async () => {
      const lowerDifferences: string[] = [];
      const helperViolations: string[] = [];
      const gap: string[] = [];
      const rows: string[] = [];
      await target.rollbackScenario(async (q) => {
        for (const s of CASE_CORPUS) {
          const email = `${s}@x.in`;
          const js = email.toLowerCase();
          const pg = String((await q.run("select lower($1::text) as v", [email]))[0].v);
          const dbRaw = await raw(q, email);
          rows.push(`${hex(s)} js==pg ${js === pg} | raw insert ${dbRaw}`);
          if (js !== pg) lowerDifferences.push(`${hex(s)}: js ${hex(js)} / pg ${hex(pg)}`);
          const normalised = normaliseEmail(email);
          if (normalised !== null && (await raw(q, normalised)) !== "ok") helperViolations.push(`${hex(s)}: helper output refused`);
        }
        for (const ws of UNICODE_SPACE) {
          for (const placement of ["lead", "trail"] as const) {
            const email = build(ws, placement);
            const dbRaw = await raw(q, email);
            rows.push(`${hex(ws)} ${placement} | raw insert ${dbRaw}`);
            if (dbRaw !== "ok") gap.push(`${hex(ws)} ${placement}: ${dbRaw}`);
            expect(normaliseEmail(email), `${hex(ws)} ${placement}`).toBe("a@x.in");
          }
          const inner = normaliseEmail(build(ws, "inner"));
          expect(inner, `${hex(ws)} inner`).toBeNull();
        }
      });
      console.log(`unicode corpus on database locale: ${rows.join("\n")}`);
      console.log(`lower-casing differences between JavaScript and PostgreSQL: ${lowerDifferences.length === 0 ? "none" : lowerDifferences.join(" ; ")}`);
      console.log(`unicode whitespace the database check refuses at the ends: ${gap.length === 0 ? "none (documented gap: the database trims only the six ASCII characters)" : gap.join(" ; ")}`);
      expect(helperViolations).toEqual([]);
      expect(gap).toEqual([]);
    }));

  it("constraints-other: defaults, status, uniqueness, blank checks, kind, batch_id and foreign keys", () =>
    run.step("constraints-other", async () => {
      await target.rollbackScenario(async (q) => {
        const insertUser = async (email: string) => String((await q.run("insert into public.users (email) values ($1) returning id", [email]))[0].id);
        const rejected = (result: Awaited<ReturnType<ScenarioQuery["attempt"]>>, constraint: string, label: string) => {
          expect(result.ok, `${label}: expected a refusal`).toBe(false);
          if (!result.ok) expect(result.constraint, label).toBe(constraint);
        };

        // defaults
        const created = (await q.run("insert into public.users (email) values ('d@x.in') returning id, status, email_verified_at, created_at, updated_at"))[0];
        expect(created.status).toBe("active");
        expect(created.email_verified_at).toBeNull();
        expect(String(created.id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        for (const column of ["created_at", "updated_at"] as const) expect(Math.abs(Date.now() - (created[column] as Date).getTime())).toBeLessThan(60_000);

        // status
        for (const status of ["Active", "DISABLED", " active", "active ", "pending", ""]) {
          rejected(await q.attempt("insert into public.users (email, status) values ('s@x.in', $1)", [status]), "users_status_check", `status ${JSON.stringify(status)}`);
        }
        const nullStatus = await q.attempt("insert into public.users (email, status) values ('s@x.in', NULL)");
        expect(nullStatus.ok ? "accepted" : nullStatus.code).toBe("23502");
        const flip = await insertUser("flip@x.in");
        await q.run("update public.users set status = 'disabled' where id = $1", [flip]);
        expect((await q.run("select status from public.users where id = $1", [flip]))[0].status).toBe("disabled");
        await q.run("update public.users set status = 'active' where id = $1", [flip]);
        expect((await q.run("select status from public.users where id = $1", [flip]))[0].status).toBe("active");
        rejected(await q.attempt("update public.users set status = 'gone' where id = $1", [flip]), "users_status_check", "status update");

        // email uniqueness
        await insertUser("dup@x.in");
        rejected(await q.attempt("insert into public.users (email) values ('dup@x.in')"), "users_email_key", "duplicate email");
        rejected(await q.attempt("insert into public.users (email) values ('Dup@x.in')"), "users_email_lowercase", "case variant of an existing email");

        // user_identities
        const a = await insertUser("a@x.in");
        const b = await insertUser("b@x.in");
        await q.run("insert into public.user_identities (user_id, provider, subject) values ($1, 'prov', 'sub1')", [a]);
        rejected(await q.attempt("insert into public.user_identities (user_id, provider, subject) values ($1, 'prov', 'sub1')", [b]), "user_identities_provider_subject_key", "same provider and subject, other user");
        rejected(await q.attempt("insert into public.user_identities (user_id, provider, subject) values ($1, 'prov', 'sub2')", [a]), "user_identities_user_id_provider_key", "second identity for the same provider");
        expect((await q.attempt("insert into public.user_identities (user_id, provider, subject) values ($1, 'other', 'sub1')", [a])).ok).toBe(true);
        for (const blank of ["", " ", "   "]) {
          rejected(await q.attempt("insert into public.user_identities (user_id, provider, subject) values ($1, $2, 'x')", [b, blank]), "user_identities_provider_not_blank", `blank provider ${JSON.stringify(blank)}`);
          rejected(await q.attempt("insert into public.user_identities (user_id, provider, subject) values ($1, 'p2', $2)", [b, blank]), "user_identities_subject_not_blank", `blank subject ${JSON.stringify(blank)}`);
        }
        const orphan = await q.attempt("insert into public.user_identities (user_id, provider, subject) values (gen_random_uuid(), 'p3', 's3')");
        rejected(orphan, "user_identities_user_id_fkey", "identity for a missing user");

        // legacy_mappings
        await q.run("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, 'sys', 'user', 'L1', 'batch-1')", [a]);
        rejected(await q.attempt("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, 'sys', 'organisation', 'L9', 'b')", [b]), "legacy_mappings_kind_check", "kind other than user");
        const nullBatch = await q.attempt("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, 'sys', 'user', 'L8', NULL)", [b]);
        expect(nullBatch.ok ? "accepted" : nullBatch.code).toBe("23502");
        expect((await q.attempt("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, 'sys', 'user', 'L7', '')", [b])).ok, "empty batch_id is allowed: only NOT NULL was approved").toBe(true);
        for (const blank of ["", " ", "   "]) {
          rejected(await q.attempt("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, $2, 'user', 'L6', 'b')", [b, blank]), "legacy_mappings_source_system_not_blank", `blank source_system ${JSON.stringify(blank)}`);
          rejected(await q.attempt("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, 'sys', 'user', $2, 'b')", [b, blank]), "legacy_mappings_legacy_id_not_blank", `blank legacy_id ${JSON.stringify(blank)}`);
        }
        rejected(await q.attempt("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, 'sys', 'user', 'L1', 'b')", [b]), "legacy_mappings_source_system_kind_legacy_id_key", "same legacy id, other user");
        rejected(await q.attempt("insert into public.legacy_mappings (user_id, source_system, kind, legacy_id, batch_id) values ($1, 'sys', 'user', 'L2', 'b')", [a]), "legacy_mappings_user_id_source_system_kind_key", "second mapping for the same user and source");

        // foreign keys restrict both deleting and re-keying a user that has children
        const del = await q.attempt("delete from public.users where id = $1", [a]);
        const upd = await q.attempt("update public.users set id = gen_random_uuid() where id = $1", [a]);
        expect(del.ok).toBe(false);
        expect(upd.ok).toBe(false);
        const codes = [del, upd].map((r) => (r.ok ? "accepted" : `${r.code}/${r.constraint}`));
        console.log(`foreign key restrict: delete -> ${codes[0]}; update of id -> ${codes[1]}`);
        for (const r of [del, upd]) if (!r.ok) expect(["23001", "23503"]).toContain(r.code);
        expect((await q.run("select count(*)::int as n from public.users where id = $1", [a]))[0].n).toBe(1);
      });
    }));

  it("column-types: column types, precision, defaults and the absence of credential columns", () =>
    run.step("column-types", async () => {
      const columns = await target.readQuery(
        "select table_name, column_name, data_type, datetime_precision, column_default, is_nullable from information_schema.columns where table_schema = 'public' and table_name in ('users', 'user_identities', 'legacy_mappings') order by table_name, ordinal_position",
      );
      expect(columns).toHaveLength(6 + 5 + 7);
      const timeColumns = columns.filter((c) => /_at$/.test(String(c.column_name)));
      expect(timeColumns.map((c) => `${c.table_name}.${c.column_name}`)).toEqual(["legacy_mappings.created_at", "user_identities.created_at", "users.email_verified_at", "users.created_at", "users.updated_at"]);
      for (const c of timeColumns) {
        expect(c.data_type, `${c.table_name}.${c.column_name}`).toBe("timestamp with time zone");
        expect(Number(c.datetime_precision)).toBe(3);
      }
      for (const c of columns.filter((x) => x.column_name === "id")) {
        expect(c.data_type).toBe("uuid");
        expect(c.column_default).toBe("gen_random_uuid()");
      }
      const users = (name: string) => columns.find((c) => c.table_name === "users" && c.column_name === name);
      expect(users("status")?.column_default).toBe("'active'::text");
      expect(users("created_at")?.column_default).toBe("CURRENT_TIMESTAMP");
      expect(users("updated_at")?.column_default).toBe("CURRENT_TIMESTAMP");
      expect(users("email_verified_at")?.is_nullable).toBe("YES");
      for (const c of columns) expect(String(c.column_name), `${c.table_name}.${c.column_name}`).not.toMatch(/password|secret|token|credential|hash|salt|otp/i);
      expect(columns.filter((c) => c.column_name === "email").map((c) => c.table_name)).toEqual(["users"]);
    }));

  it("tables-still-empty: nothing from the scenarios persisted", () =>
    run.step("tables-still-empty", async () => {
      expect(await target.identityCounts()).toEqual({ legacy_mappings: 0, user_identities: 0, users: 0 });
    }));

  it("finish: the constraint run completes", () => run.finish());
});
