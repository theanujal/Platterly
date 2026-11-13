// Test support for the F3.1.1 Stage 2 database checks. Unlike the pure helpers one level up, this file reads credential files, connects with pg
// and starts the Prisma CLI, so it lives under __tests__ and is used only by the *.db.test.ts files and db.test.ts.
// Every destructive statement is reachable only through a GuardedTarget, which openGuarded() returns only after every check below has passed.
// No environment variable, flag or run id can authorise a recovery: an unsettled run always stops the caller.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, type Stats } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { checkDownSql } from "../down-sql";
import type { HistoryRow, MigrationFolder } from "../history";
import { classifyInventory, type Inventory, type InventoryPolicy } from "../inventory";
import { TEST_DATABASE_NAME, TEST_ROLE_NAME, validateTestTarget } from "../target";

export type Row = Record<string, unknown>;

export interface Queryable {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  on?(event: "notice", listener: (message: { message?: string; detail?: string }) => void): unknown;
  end(): Promise<void>;
}

export class GuardRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GuardRefusal";
  }
}

export const STAGE2_ALLOWED_PORTS: readonly number[] = [55433];
export const BASELINE_MIGRATION = "20261101000000_baseline";
export const IDENTITY_MIGRATION = "20261104190000_identity_tables";
export const IDENTITY_TABLES = ["legacy_mappings", "user_identities", "users"] as const;
// F3.2.1 organisation schema (third migration). Tables and the functions its triggers call; the objects the guard inventory must allow.
export const ORG_MIGRATION = "20261106150000_organisation_schema";
export const ORG_TABLES = ["audit_logs", "membership_product_slots", "organisation_creation_requests", "organisation_members", "organisation_product_unlinks", "organisation_products", "organisations", "outbox_events"] as const;
// The read-only Caterly team list (fifth migration): one new table, no functions. The guard inventory must allow it, and only once the migration is applied.
export const TEAM_MIGRATION = "20261107170000_organisation_team_members";
export const TEAM_TABLES = ["organisation_team_members"] as const;
// The product registry (migration 20261108120000, one table) and the Admin transfer (20261113120000, one table; 20261110120500 only adds a column). Allowed only once each is applied.
export const INTEGRATIONS_MIGRATION = "20261108120000_product_integrations";
export const INTEGRATIONS_TABLES = ["product_integrations"] as const;
export const TRANSFER_MIGRATION = "20261113120000_ownership_transfer";
export const TRANSFER_TABLES = ["ownership_transfers"] as const;
export const ORG_FUNCTIONS = [
  "audit_logs_append_only",
  "membership_product_slots_event_required",
  "membership_product_slots_immutable",
  "organisation_admin_floor_check",
  "organisation_members_before_delete",
  "organisation_members_before_update",
  "organisation_members_establish",
  "organisation_members_floor_trigger",
  "organisation_products_established",
  "organisation_products_last_link",
  "organisations_before_insert",
  "organisations_before_update",
  "organisations_floor_trigger",
] as const;
export const STAGE2_DIR = path.join(homedir(), ".platterly", "stage2");
export const PLATFORM_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const REPO_ROOT = path.resolve(PLATFORM_ROOT, "..", "..");

const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Credentials. Secrets are read from files by this process only; the environment carries a directory path and nothing secret.

export class Credentials {
  readonly host = "127.0.0.1";
  readonly port: number;
  readonly database: string;
  readonly role: string;
  readonly systemIdentifier: string;
  readonly dir: string;
  readonly #password: string;
  readonly #token: string;

  constructor(init: { port: number; database: string; role: string; systemIdentifier: string; dir: string; password: string; token: string }) {
    this.port = init.port;
    this.database = init.database;
    this.role = init.role;
    this.systemIdentifier = init.systemIdentifier;
    this.dir = init.dir;
    this.#password = init.password;
    this.#token = init.token;
  }

  withChanges(patch: Partial<{ port: number; database: string; role: string; systemIdentifier: string; token: string }>): Credentials {
    return new Credentials({
      port: patch.port ?? this.port,
      database: patch.database ?? this.database,
      role: patch.role ?? this.role,
      systemIdentifier: patch.systemIdentifier ?? this.systemIdentifier,
      dir: this.dir,
      password: this.#password,
      token: patch.token ?? this.#token,
    });
  }

  url(): string {
    return `postgresql://${encodeURIComponent(this.role)}:${encodeURIComponent(this.#password)}@${this.host}:${this.port}/${encodeURIComponent(this.database)}`;
  }

  connectConfig(applicationName: string) {
    return { host: this.host, port: this.port, database: this.database, user: this.role, password: this.#password, application_name: applicationName, connectionTimeoutMillis: 5000 };
  }

  tokenSha256(): string {
    return sha256(this.#token);
  }

  secrets(): string[] {
    return [this.#password, this.#token];
  }

  toJSON() {
    return { host: this.host, port: this.port, database: this.database, role: this.role };
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "Credentials(redacted)";
  }
}

export function redact(text: string, creds: Credentials): string {
  let out = text;
  for (const secret of creds.secrets()) if (secret !== "") out = out.split(secret).join("[redacted]");
  return out;
}

function lstatOrRefuse(target: string, code: string) {
  try {
    return lstatSync(target);
  } catch {
    throw new GuardRefusal(code, `cannot inspect ${path.basename(target)}`);
  }
}

function assertPrivate(target: string, kind: "dir" | "file", modes: readonly number[], code: string): void {
  const stat = lstatOrRefuse(target, code);
  const name = path.basename(target);
  if (stat.isSymbolicLink()) throw new GuardRefusal(code, `${name} is a symlink`);
  if (kind === "dir" ? !stat.isDirectory() : !stat.isFile()) throw new GuardRefusal(code, `${name} is not a ${kind === "dir" ? "directory" : "file"}`);
  if (stat.uid !== process.getuid?.()) throw new GuardRefusal(code, `${name} is not owned by the current user`);
  if (!modes.includes(stat.mode & 0o777)) throw new GuardRefusal(code, `${name} has mode ${(stat.mode & 0o777).toString(8)}`);
}

// Returns null when no credentials directory is configured (the db tests then skip). Any other problem refuses loudly.
export function loadCredentials(dirFromEnv: string | undefined): Credentials | null {
  if (dirFromEnv === undefined || dirFromEnv === "") return null;
  if (path.resolve(dirFromEnv) !== STAGE2_DIR) throw new GuardRefusal("credentials-dir", "the credentials directory is not the approved Stage 2 directory");
  if (STAGE2_DIR.startsWith(REPO_ROOT + path.sep)) throw new GuardRefusal("credentials-dir", "the credentials directory is inside the repository");
  assertPrivate(STAGE2_DIR, "dir", [0o700], "credentials-dir");
  if (realpathSync(STAGE2_DIR) !== STAGE2_DIR) throw new GuardRefusal("credentials-dir", "the credentials directory resolves elsewhere");
  for (const file of ["testrole.pw", "sentinel.token"]) assertPrivate(path.join(STAGE2_DIR, file), "file", [0o600], "credentials-file");
  assertPrivate(path.join(STAGE2_DIR, "target.json"), "file", [0o600, 0o400], "credentials-file");
  let target: Row;
  try {
    target = JSON.parse(readFileSync(path.join(STAGE2_DIR, "target.json"), "utf8")) as Row;
  } catch {
    throw new GuardRefusal("credentials-file", "target.json is not valid JSON");
  }
  if (typeof target.port !== "number" || typeof target.database !== "string" || typeof target.role !== "string" || typeof target.systemIdentifier !== "string") {
    throw new GuardRefusal("credentials-file", "target.json is missing a field");
  }
  return new Credentials({
    port: target.port,
    database: target.database,
    role: target.role,
    systemIdentifier: target.systemIdentifier,
    dir: STAGE2_DIR,
    password: readFileSync(path.join(STAGE2_DIR, "testrole.pw"), "utf8").trim(),
    token: readFileSync(path.join(STAGE2_DIR, "sentinel.token"), "utf8").trim(),
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The expected guard fingerprint lives outside PostgreSQL, in a read-only, immutable file that only pgadmin's setup procedure may create.

export type FileFacts = { exists: boolean; isFile: boolean; isSymlink: boolean; uid: number; expectedUid: number; mode: number; flags: string | null };

export function checkFingerprintFileFacts(facts: FileFacts): void {
  if (!facts.exists || !facts.isFile || facts.isSymlink) throw new GuardRefusal("fingerprint-file", "the expected fingerprint file is missing, not a regular file, or a symlink");
  if (facts.uid !== facts.expectedUid) throw new GuardRefusal("fingerprint-file", "the expected fingerprint file is not owned by the current user");
  if (facts.mode !== 0o400) throw new GuardRefusal("fingerprint-file", `the expected fingerprint file has mode ${facts.mode.toString(8)}, not 400`);
  if (facts.flags === null) throw new GuardRefusal("fingerprint-immutable", "the immutable flag cannot be read: stop and ask AJ");
  if (!facts.flags.split(",").includes("uchg")) throw new GuardRefusal("fingerprint-immutable", "the immutable flag is missing: stop and ask AJ");
}

export const fingerprintSha = (lines: readonly string[]): string => sha256(lines.join("\n"));

export function readFingerprintFile(dir: string = STAGE2_DIR): { lines: string[]; sha256: string; fileSha256: string } {
  const file = path.join(dir, "expected-fingerprint.json");
  let exists = true;
  let stat: Stats | null = null;
  try {
    stat = lstatSync(file);
  } catch {
    exists = false;
  }
  const flagsResult = exists ? spawnSync("/usr/bin/stat", ["-f", "%Sf", file], { encoding: "utf8" }) : null;
  const flags = flagsResult && flagsResult.status === 0 ? flagsResult.stdout.trim() : null;
  checkFingerprintFileFacts({
    exists,
    isFile: stat?.isFile() ?? false,
    isSymlink: stat?.isSymbolicLink() ?? false,
    uid: stat?.uid ?? -1,
    expectedUid: process.getuid?.() ?? -2,
    mode: stat ? stat.mode & 0o777 : 0,
    flags,
  });
  const raw = readFileSync(file, "utf8");
  let parsed: { version?: unknown; lines?: unknown; sha256?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GuardRefusal("fingerprint-file", "the expected fingerprint file is not valid JSON");
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.lines) || parsed.lines.length === 0 || !parsed.lines.every((l) => typeof l === "string")) {
    throw new GuardRefusal("fingerprint-file", "the expected fingerprint file has an unexpected shape");
  }
  const lines = parsed.lines as string[];
  if (parsed.sha256 !== fingerprintSha(lines)) throw new GuardRefusal("fingerprint-file", "the expected fingerprint file does not match its own checksum");
  return { lines, sha256: parsed.sha256 as string, fileSha256: sha256(raw) };
}

export function diffLines(expected: readonly string[], actual: readonly string[]): { missing: string[]; extra: string[] } {
  return { missing: expected.filter((l) => !actual.includes(l)), extra: actual.filter((l) => !expected.includes(l)) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// SQL. Everything the guard runs before it trusts a target is a SELECT. The static fingerprint is extracted verbatim by pgadmin at setup.

/* STATIC_FINGERPRINT_SQL_BEGIN */
const STATIC_FINGERPRINT_SQL = `
with rg as (select oid from pg_namespace where nspname = 'runner_guard'),
objs as (
  select 'pg_class'::regclass::oid as classid, c.oid as objid, n.nspname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  union all select 'pg_proc'::regclass::oid, p.oid, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  union all select 'pg_type'::regclass::oid, t.oid, n.nspname from pg_type t join pg_namespace n on n.oid = t.typnamespace
  union all select 'pg_namespace'::regclass::oid, n.oid, n.nspname from pg_namespace n
  union all select 'pg_constraint'::regclass::oid, k.oid, n.nspname from pg_constraint k join pg_namespace n on n.oid = k.connamespace
  union all select 'pg_trigger'::regclass::oid, g.oid, n.nspname from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
  union all select 'pg_attrdef'::regclass::oid, d.oid, n.nspname from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
  union all select 'pg_rewrite'::regclass::oid, r.oid, n.nspname from pg_rewrite r join pg_class c on c.oid = r.ev_class join pg_namespace n on n.oid = c.relnamespace
)
select line from (
  select 'schema|' || n.oid::text || '|' || n.nspname::text || '|' || pg_get_userbyid(n.nspowner)::text || '|' || coalesce(n.nspacl::text, 'null') as line
    from pg_namespace n where n.nspname = 'runner_guard'
  union all
  select 'rel|' || c.relname::text || '|' || c.relkind::text || '|' || c.oid::text || '|' || pg_get_userbyid(c.relowner)::text || '|' || coalesce(c.relacl::text, 'null') || '|' || c.relrowsecurity::text
    from pg_class c where c.relnamespace in (select oid from rg)
  union all
  select 'col|' || c.relname::text || '|' || a.attnum::text || '|' || a.attname::text || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), 'null')
    from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where c.relnamespace in (select oid from rg) and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
  union all
  select 'con|' || c.relname::text || '|' || k.conname::text || '|' || k.contype::text || '|' || pg_get_constraintdef(k.oid)
    from pg_constraint k join pg_class c on c.oid = k.conrelid where c.relnamespace in (select oid from rg)
  union all
  select 'idx|' || indexname::text || '|' || indexdef from pg_indexes where schemaname = 'runner_guard'
  union all
  select 'trg|' || c.relname::text || '|' || t.tgname::text || '|' || t.tgenabled::text || '|' || pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace in (select oid from rg) and not t.tgisinternal
  union all
  select 'fn|' || p.proname::text || '|' || p.oid::text || '|' || pg_get_userbyid(p.proowner)::text || '|' || coalesce(p.proacl::text, 'null') || '|' || md5(p.prosrc) || '|' || p.prosecdef::text || '|' || coalesce(p.proconfig::text, 'null')
    from pg_proc p where p.pronamespace in (select oid from rg)
  union all
  select 'view|' || c.relname::text || '|' || md5(pg_get_viewdef(c.oid)) from pg_class c where c.relnamespace in (select oid from rg) and c.relkind = 'v'
  union all
  select 'sentinel|' || md5(concat_ws('|', s.id, s.token_sha256, s.database_name, s.system_identifier)) from runner_guard.sentinel s
  union all
  select 'dep_out|' || count(*)::text from pg_depend d
    join objs a on a.classid = d.classid and a.objid = d.objid
    join objs b on b.classid = d.refclassid and b.objid = d.refobjid
    where a.nspname = 'runner_guard' and b.nspname not in ('runner_guard', 'pg_catalog')
) l order by line
`;
/* STATIC_FINGERPRINT_SQL_END */

// The condition under which DROP SCHEMA public CASCADE could reach outside public: some object outside public depends on one inside it.
// The query lists every such edge, over the same eight catalogue classes as the fingerprint, with the facts needed to judge it.
// The one exception, applied by isInternalToastEdge() below, is a TOAST relation that belongs to a public table.
/* DEP_ESCAPE_SQL_BEGIN */
const DEP_ESCAPE_SQL = `
with objs as (
  select 'pg_class'::regclass::oid as classid, c.oid as objid, n.nspname::text as nspname, c.relname::text as name, c.relkind::text as kind from pg_class c join pg_namespace n on n.oid = c.relnamespace
  union all select 'pg_proc'::regclass::oid, p.oid, n.nspname::text, p.proname::text, 'function' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  union all select 'pg_type'::regclass::oid, t.oid, n.nspname::text, t.typname::text, 'type' from pg_type t join pg_namespace n on n.oid = t.typnamespace
  union all select 'pg_namespace'::regclass::oid, n.oid, n.nspname::text, n.nspname::text, 'schema' from pg_namespace n
  union all select 'pg_constraint'::regclass::oid, k.oid, n.nspname::text, k.conname::text, 'constraint' from pg_constraint k join pg_namespace n on n.oid = k.connamespace
  union all select 'pg_trigger'::regclass::oid, g.oid, n.nspname::text, g.tgname::text, 'trigger' from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
  union all select 'pg_attrdef'::regclass::oid, d.oid, n.nspname::text, c.relname::text || '.col' || d.adnum::text, 'column default' from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
  union all select 'pg_rewrite'::regclass::oid, r.oid, n.nspname::text, r.rulename::text, 'rule' from pg_rewrite r join pg_class c on c.oid = r.ev_class join pg_namespace n on n.oid = c.relnamespace
)
select a.nspname as dep_schema, a.name as dep_name, a.kind as dep_kind,
       b.nspname as ref_schema, b.name as ref_name, b.kind as ref_kind,
       d.deptype::text as deptype,
       (d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass) as both_relations,
       exists (
         select 1 from pg_class t join pg_class p on p.reltoastrelid = t.oid
         where t.oid = d.objid and t.relkind = 't' and t.relnamespace = 'pg_toast'::regnamespace
           and p.oid = d.refobjid and p.relnamespace = 'public'::regnamespace
       ) as owned_toast
from pg_depend d
  join objs a on a.classid = d.classid and a.objid = d.objid
  join objs b on b.classid = d.refclassid and b.objid = d.refobjid
where a.nspname <> 'public' and b.nspname = 'public'
order by 1, 2, 4, 5
`;
/* DEP_ESCAPE_SQL_END */

const CONTENT_FINGERPRINT_SQL = `
select 'content|run_log|' || coalesce(md5(string_agg(concat_ws('~', l.run_id, l.step_no, l.status, l.step_name, coalesce(l.detail, ''), coalesce(l.previous_run_id::text, ''), l.at), ';' order by l.run_id, l.step_no)), 'empty') as line from runner_guard.run_log l
union all
select 'content|recovery_log|' || coalesce(md5(string_agg(concat_ws('~', r.id, r.recovered_run_id, r.approved_by, r.approval_reference, r.action, r.state_before, r.state_after, r.at, r.recorded_by), ';' order by r.id)), 'empty') from runner_guard.recovery_log r
order by line
`;

const SNAPSHOT_SQL = `
select line from (
  select 'tbl|' || c.relname::text || '|' || c.relkind::text as line from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
  union all
  select 'col|' || c.relname::text || '|' || a.attnum::text || '|' || a.attname::text || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), 'null')
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  union all
  select 'con|' || c.relname::text || '|' || k.conname::text || '|' || k.contype::text || '|' || pg_get_constraintdef(k.oid)
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
  union all
  select 'idx|' || indexname::text || '|' || indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'trg|' || c.relname::text || '|' || t.tgname::text || '|' || pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal
) s order by line
`;

export const Q = {
  identity: "select current_database() as database, current_user as role, inet_server_port() as port, current_setting('server_version_num')::int as version",
  databases: "select datname from pg_database order by datname",
  systemId: "select system_identifier::text as id from pg_control_system()",
  sentinel: "select token_sha256, database_name, system_identifier from runner_guard.sentinel",
  sessions: "select count(*)::int as n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend'",
  lock: "select pg_try_advisory_lock(hashtextextended('platform-stage2-guard', 0)) as locked",
  unlock: "select pg_advisory_unlock(hashtextextended('platform-stage2-guard', 0)) as unlocked",
  runState: "select run_id, outcome, last_step_no, last_step_name, started_at, recovered, settled, previous_run_id from runner_guard.run_state order by started_at",
  publicOwner: "select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'public'",
  schemas: "select nspname from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema' order by nspname",
  extensions: "select extname from pg_extension order by extname",
  objects: `
    select n.nspname as schema,
      case when c.relkind in ('r', 'p') then 'table' when c.relkind = 'v' then 'view' when c.relkind = 'm' then 'matview' when c.relkind = 'S' then 'sequence' else 'other' end as kind,
      c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'runner_guard') and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    union all select n.nspname, 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'runner_guard')
    union all select n.nspname, 'type', t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname in ('public', 'runner_guard') and t.typtype in ('e', 'd', 'r', 'm')
    order by 1, 2, 3`,
  publicRelations: "select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S') order by 1",
  migrations: "select migration_name, checksum, finished_at, rolled_back_at from public._prisma_migrations order by migration_name",
  staticFingerprint: STATIC_FINGERPRINT_SQL,
  contentFingerprint: CONTENT_FINGERPRINT_SQL,
  depEscape: DEP_ESCAPE_SQL,
  snapshot: SNAPSHOT_SQL,
} as const;

export const INVENTORY_POLICY: InventoryPolicy = {
  allowedSchemas: ["public", "runner_guard"],
  allowedExtensions: ["plpgsql"],
  allowedObjects: [
    "table:runner_guard.sentinel",
    "table:runner_guard.run_log",
    "table:runner_guard.recovery_log",
    "view:runner_guard.run_state",
    "function:runner_guard.run_log_before_insert",
    "function:runner_guard.recovery_log_before_insert",
    "function:runner_guard.reject_change",
    "table:public._prisma_migrations",
    "table:public.users",
    "table:public.user_identities",
    "table:public.legacy_mappings",
    ...["audit_logs", "membership_product_slots", "organisation_creation_requests", "organisation_members", "organisation_product_unlinks", "organisation_products", "organisations", "outbox_events"].map((t) => `table:public.${t}`),
    ...TEAM_TABLES.map((t) => `table:public.${t}`),
    ...INTEGRATIONS_TABLES.map((t) => `table:public.${t}`),
    ...TRANSFER_TABLES.map((t) => `table:public.${t}`),
    ...[
      "audit_logs_append_only",
      "membership_product_slots_event_required",
      "membership_product_slots_immutable",
      "organisation_admin_floor_check",
      "organisation_members_before_delete",
      "organisation_members_before_update",
      "organisation_members_establish",
      "organisation_members_floor_trigger",
      "organisation_products_established",
      "organisation_products_last_link",
      "organisations_before_insert",
      "organisations_before_update",
      "organisations_floor_trigger",
    ].map((f) => `function:public.${f}`),
  ],
};

// What the identity tables should be, given the migrations applied to a database.
export function expectedPublicTables(appliedMigrations: readonly string[]): string[] {
  return [...(appliedMigrations.includes(IDENTITY_MIGRATION) ? IDENTITY_TABLES : []), ...(appliedMigrations.includes(ORG_MIGRATION) ? ORG_TABLES : []), ...(appliedMigrations.includes(TEAM_MIGRATION) ? TEAM_TABLES : []), ...(appliedMigrations.includes(INTEGRATIONS_MIGRATION) ? INTEGRATIONS_TABLES : []), ...(appliedMigrations.includes(TRANSFER_MIGRATION) ? TRANSFER_TABLES : [])];
}

export function findUnsettled(runs: readonly Row[]): Row[] {
  return runs.filter((r) => r.settled !== true);
}

// The single dependency from outside public into public that is not an escape: PostgreSQL's own TOAST relation of a public table. All of these
// must hold, each established by the catalogue query: the dependent is in pg_toast and is a TOAST relation whose owner, found through
// reltoastrelid, is exactly the referenced public table; both ends are relations; the dependency type is internal (i).
// Nothing else is ignored: every other kind of edge, in pg_toast or anywhere, still stops the reset.
export function isInternalToastEdge(edge: Row): boolean {
  return (
    str(edge.dep_schema) === "pg_toast" &&
    str(edge.ref_schema) === "public" &&
    str(edge.deptype) === "i" &&
    edge.both_relations === true &&
    edge.owned_toast === true
  );
}

export function escapingEdges(edges: readonly Row[]): Row[] {
  return edges.filter((edge) => !isInternalToastEdge(edge));
}

const describeEdge = (e: Row): string => `${str(e.dep_schema)}.${str(e.dep_name)} (${str(e.dep_kind)}) -> ${str(e.ref_schema)}.${str(e.ref_name)} (${str(e.ref_kind)}), type ${str(e.deptype)}`;

// ---------------------------------------------------------------------------------------------------------------------------------
// The guard.

export interface GuardOptions {
  connect?: (creds: Credentials, applicationName: string) => Promise<Queryable>;
  // Tests of the guard logic with a fake client pass the expected lines directly. Real runs never do: they read the immutable file.
  fingerprintLines?: readonly string[];
  applicationName?: string;
}

export async function defaultConnect(creds: Credentials, applicationName: string): Promise<Queryable> {
  const client = new Client(creds.connectConfig(applicationName));
  await client.connect();
  return client as unknown as Queryable;
}

async function rowsOf(client: Queryable, sql: string, values?: readonly unknown[]): Promise<Row[]> {
  return (await client.query(sql, values)).rows;
}

async function describeState(client: Queryable): Promise<string> {
  const parts: string[] = [];
  try {
    const runs = await rowsOf(client, Q.runState);
    parts.push(`runs: ${runs.map((r) => `${str(r.run_id)} outcome=${str(r.outcome)} last=${str(r.last_step_no)}:${str(r.last_step_name)} recovered=${str(r.recovered)} settled=${str(r.settled)}`).join("; ") || "none"}`);
    const objects = await rowsOf(client, Q.objects);
    parts.push(`objects: ${objects.map((o) => `${str(o.schema)}.${str(o.name)}`).join(", ")}`);
    const migrations = await rowsOf(client, Q.migrations).catch(() => []);
    parts.push(`migrations: ${migrations.map((m) => str(m.migration_name)).join(", ") || "none"}`);
  } catch (error) {
    parts.push(`state could not be read: ${(error as Error).message}`);
  }
  return parts.join(" | ");
}

async function collectInventory(client: Queryable, otherSessions: number): Promise<Inventory> {
  const schemas = (await rowsOf(client, Q.schemas)).map((r) => str(r.nspname));
  const extensions = (await rowsOf(client, Q.extensions)).map((r) => str(r.extname));
  const objects = (await rowsOf(client, Q.objects)).map((r) => ({ schema: str(r.schema), kind: str(r.kind), name: str(r.name) }));
  const rowCounts: Record<string, number> = {};
  for (const object of objects) {
    // Only the fixed identity table names are interpolated, so no catalogue value ever reaches SQL text. _prisma_migrations rows are expected.
    if (object.schema === "public" && object.kind === "table" && (IDENTITY_TABLES as readonly string[]).includes(object.name)) {
      rowCounts[`public.${object.name}`] = Number((await rowsOf(client, `select count(*)::int as n from public."${object.name}"`))[0]?.n ?? 0);
    }
  }
  return { schemas, extensions, objects, rowCounts, otherSessions, runLog: [] };
}

export async function openGuarded(creds: Credentials, options: GuardOptions = {}): Promise<GuardedTarget> {
  const application = options.applicationName ?? "platform-stage2-guard";
  // 1. The expected fingerprint file: owner, mode, immutable flag. Missing flag stops and asks AJ.
  let expectedLines: readonly string[];
  if (options.fingerprintLines) expectedLines = options.fingerprintLines;
  else expectedLines = readFingerprintFile(creds.dir).lines;
  // 2. Values that need no connection.
  if (!STAGE2_ALLOWED_PORTS.includes(creds.port)) throw new GuardRefusal("port", `port ${creds.port} is not an allowed Stage 2 port`);
  if (creds.database !== TEST_DATABASE_NAME) throw new GuardRefusal("database", "the database is not the approved test database");
  if (creds.role !== TEST_ROLE_NAME) throw new GuardRefusal("role", "the role is not the approved test role");
  const target = validateTestTarget(creds.url(), STAGE2_ALLOWED_PORTS);
  if (!target.ok) throw new GuardRefusal("target", target.reason);
  // 3. Connect, then only SELECTs until every check has passed.
  let client: Queryable;
  try {
    client = await (options.connect ?? defaultConnect)(creds, application);
  } catch (error) {
    throw new GuardRefusal("connect", `cannot connect: ${redact((error as Error).message, creds)}`);
  }
  try {
    const identity = (await rowsOf(client, Q.identity))[0] ?? {};
    if (str(identity.database) !== TEST_DATABASE_NAME) throw new GuardRefusal("database", "connected database is not the approved test database");
    if (str(identity.role) !== TEST_ROLE_NAME) throw new GuardRefusal("role", "connected role is not the approved test role");
    if (Number(identity.port) !== creds.port) throw new GuardRefusal("port", "server port does not match");
    const version = Number(identity.version);
    if (!(version >= 160000 && version < 170000)) throw new GuardRefusal("version", `server version ${version} is not PostgreSQL 16`);
    const databases = (await rowsOf(client, Q.databases)).map((r) => str(r.datname));
    if (databases.join(",") !== [TEST_DATABASE_NAME, "postgres", "template0", "template1"].sort().join(",")) {
      throw new GuardRefusal("cluster-databases", `the cluster does not hold exactly the expected databases: ${databases.join(", ")}`);
    }
    let live: string;
    try {
      live = str((await rowsOf(client, Q.systemId))[0]?.id);
    } catch (error) {
      throw new GuardRefusal("system-id-privilege", `the system identifier cannot be read (${(error as Error).message}): stop and ask AJ; no privilege is added automatically`);
    }
    if (!safeEqual(live, creds.systemIdentifier)) throw new GuardRefusal("system-id", "the cluster system identifier does not match");
    const sentinel = await rowsOf(client, Q.sentinel);
    if (sentinel.length !== 1) throw new GuardRefusal("sentinel", `expected exactly one sentinel row, found ${sentinel.length}`);
    if (!safeEqual(str(sentinel[0].token_sha256), creds.tokenSha256())) throw new GuardRefusal("sentinel-token", "the sentinel token does not match");
    if (str(sentinel[0].database_name) !== TEST_DATABASE_NAME || !safeEqual(str(sentinel[0].system_identifier), live)) {
      throw new GuardRefusal("sentinel", "the sentinel database or cluster identifier does not match");
    }
    const actualLines = (await rowsOf(client, Q.staticFingerprint)).map((r) => str(r.line));
    const diff = diffLines(expectedLines, actualLines);
    if (diff.missing.length > 0 || diff.extra.length > 0 || actualLines.length !== expectedLines.length) {
      throw new GuardRefusal("fingerprint", `the guard fingerprint differs from the protected file; missing: ${diff.missing.slice(0, 5).join(" ## ")}; extra: ${diff.extra.slice(0, 5).join(" ## ")}`);
    }
    const escapes = escapingEdges(await rowsOf(client, Q.depEscape));
    if (escapes.length !== 0) {
      throw new GuardRefusal("dependency", `${escapes.length} dependency edge(s) lead from outside public into public: ${escapes.slice(0, 5).map(describeEdge).join("; ")}`);
    }
    const runs = await rowsOf(client, Q.runState);
    const unsettled = findUnsettled(runs);
    if (unsettled.length > 0) {
      throw new GuardRefusal(
        "unsettled-run",
        `STOP for manual inspection. Unsettled run(s): ${unsettled.map((r) => `${str(r.run_id)} (outcome ${str(r.outcome)}, last completed step ${str(r.last_step_no)} ${str(r.last_step_name)})`).join("; ")}. ` +
          `Database state: ${await describeState(client)}. Nothing was reset, recovered or continued. A recovery needs AJ's explicit approval naming the exact run id and exact action.`,
      );
    }
    const sessions = Number((await rowsOf(client, Q.sessions))[0]?.n);
    if (sessions !== 0) throw new GuardRefusal("other-sessions", `${sessions} other session(s) are connected to the test database`);
    if ((await rowsOf(client, Q.lock))[0]?.locked !== true) throw new GuardRefusal("lock", "another guarded run holds the advisory lock");
    const verdict = classifyInventory(await collectInventory(client, sessions), INVENTORY_POLICY);
    if (!verdict.ok) throw new GuardRefusal("inventory", verdict.reasons.join("; "));
    return new GuardedTarget(client, creds, expectedLines);
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}

export type ResetEvidence = { notices: string[]; staticEqual: boolean; contentEqual: boolean; noticesOnlyPublic: boolean; ownerBefore: string; ownerAfter: string };

export type ScenarioQuery = {
  run(sql: string, values?: readonly unknown[]): Promise<Row[]>;
  attempt(sql: string, values?: readonly unknown[]): Promise<{ ok: true; rows: Row[] } | { ok: false; code: string; constraint: string; message: string }>;
};

const DML_ONLY = /^\s*(insert|update|delete|select|with)\b/i;

export class GuardedTarget {
  readonly notices: string[] = [];
  #closed = false;

  constructor(
    private readonly client: Queryable,
    readonly creds: Credentials,
    private readonly expectedLines: readonly string[],
  ) {
    client.on?.("notice", (message) => this.notices.push(`${message.message ?? ""}\n${message.detail ?? ""}`));
  }

  async readQuery(sql: string, values?: readonly unknown[]): Promise<Row[]> {
    if (!/^\s*(select|with|show)\b/i.test(sql)) throw new Error("readQuery only runs SELECT, WITH or SHOW");
    return rowsOf(this.client, sql, values);
  }

  async publicRelations(): Promise<string[]> {
    return (await rowsOf(this.client, Q.publicRelations)).map((r) => str(r.name));
  }

  async migrationRows(): Promise<HistoryRow[]> {
    return (await rowsOf(this.client, Q.migrations)).map((r) => ({
      migration_name: str(r.migration_name),
      checksum: str(r.checksum),
      finished_at: (r.finished_at as Date | null) ?? null,
      rolled_back_at: (r.rolled_back_at as Date | null) ?? null,
    }));
  }

  async snapshot(): Promise<string[]> {
    return (await rowsOf(this.client, Q.snapshot)).map((r) => str(r.line));
  }

  async identityCounts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const table of IDENTITY_TABLES) out[table] = Number((await rowsOf(this.client, `select count(*)::int as n from public."${table}"`))[0]?.n ?? 0);
    return out;
  }

  async runStates(): Promise<Row[]> {
    return rowsOf(this.client, Q.runState);
  }

  async staticFingerprint(): Promise<string[]> {
    return (await rowsOf(this.client, Q.staticFingerprint)).map((r) => str(r.line));
  }

  async contentFingerprint(): Promise<string[]> {
    return (await rowsOf(this.client, Q.contentFingerprint)).map((r) => str(r.line));
  }

  // ---- run log (append only; the triggers decide what is allowed) ----
  async beginRun(name: string): Promise<RunSequence> {
    const previous = (await rowsOf(this.client, "select run_id from runner_guard.run_log where status = 'started' order by at desc limit 1"))[0]?.run_id;
    const runId = randomUUID();
    await this.logRow(runId, 1, "started", `start:${name}`, null, previous === undefined ? null : str(previous));
    return new RunSequence(this, runId, name);
  }

  async logRow(runId: string, stepNo: number, status: string, stepName: string, detail: string | null = null, previousRunId: string | null = null): Promise<void> {
    await this.client.query("insert into runner_guard.run_log (run_id, step_no, status, step_name, detail, previous_run_id) values ($1, $2, $3, $4, $5, $6)", [runId, stepNo, status, stepName, detail, previousRunId]);
  }

  // ---- the only destructive operations, all inside the test database's public schema ----
  private async fingerprints() {
    return {
      staticLines: await this.staticFingerprint(),
      contentLines: await this.contentFingerprint(),
      escapes: escapingEdges(await rowsOf(this.client, Q.depEscape)),
      owner: str((await rowsOf(this.client, Q.publicOwner))[0]?.owner),
    };
  }

  private async resetTransaction(commit: boolean): Promise<ResetEvidence> {
    const c = this.client;
    this.notices.length = 0;
    await c.query("BEGIN");
    let ended = false;
    try {
      const before = await this.fingerprints();
      if (before.escapes.length !== 0) throw new GuardRefusal("dependency", `an object outside public depends on an object inside it: no reset (${before.escapes.slice(0, 5).map(describeEdge).join("; ")})`);
      if (!["pg_database_owner", TEST_ROLE_NAME].includes(before.owner)) throw new GuardRefusal("public-owner", `public is owned by ${before.owner}`);
      const drift = diffLines(this.expectedLines, before.staticLines);
      if (drift.missing.length > 0 || drift.extra.length > 0) throw new GuardRefusal("fingerprint", "the guard fingerprint changed before the reset");
      await c.query("DROP SCHEMA public CASCADE");
      await c.query("CREATE SCHEMA public");
      const after = await this.fingerprints();
      const staticEqual = before.staticLines.join("\n") === after.staticLines.join("\n") && after.escapes.length === 0;
      const contentEqual = before.contentLines.join("\n") === after.contentLines.join("\n");
      const noticesOnlyPublic = this.notices.every((n) => !n.includes("runner_guard"));
      const evidence = { notices: [...this.notices], staticEqual, contentEqual, noticesOnlyPublic, ownerBefore: before.owner, ownerAfter: after.owner };
      if (!staticEqual || !contentEqual || !noticesOnlyPublic || after.owner !== TEST_ROLE_NAME) {
        throw new GuardRefusal("reset-check", `the reset touched the guard or changed an unexpected owner: ${JSON.stringify({ staticEqual, contentEqual, noticesOnlyPublic, ownerAfter: after.owner })}`);
      }
      await c.query(commit ? "COMMIT" : "ROLLBACK");
      ended = true;
      return evidence;
    } finally {
      if (!ended) await c.query("ROLLBACK").catch(() => undefined);
    }
  }

  reset(): Promise<ResetEvidence> {
    return this.resetTransaction(true);
  }

  // Runs the whole reset including its before and after checks, then rolls it back.
  rehearseReset(): Promise<ResetEvidence> {
    return this.resetTransaction(false);
  }

  // Runs the reviewed rollback file and removes that migration's history row in one transaction, after the static check of the file.
  async downTransaction(downSql: string, upSql: string, migrationName: string, commit: boolean): Promise<void> {
    const check = checkDownSql(downSql, upSql);
    if (!check.ok) throw new Error(`down.sql failed its static check: ${check.problems.join("; ")}`);
    const c = this.client;
    await c.query("BEGIN");
    let ended = false;
    try {
      await c.query(downSql);
      const deleted = await c.query("DELETE FROM public._prisma_migrations WHERE migration_name = $1", [migrationName]);
      if (deleted.rowCount !== 1) throw new Error(`expected to remove exactly one history row, removed ${deleted.rowCount}`);
      await c.query(commit ? "COMMIT" : "ROLLBACK");
      ended = true;
    } finally {
      if (!ended) await c.query("ROLLBACK").catch(() => undefined);
    }
  }

  // Row-level scenarios for constraint tests: DML only, always rolled back, so the tables stay empty.
  async rollbackScenario<T>(fn: (q: ScenarioQuery) => Promise<T>): Promise<T> {
    const c = this.client;
    await c.query("BEGIN");
    let counter = 0;
    const query: ScenarioQuery = {
      run: async (sql, values) => {
        if (!DML_ONLY.test(sql)) throw new Error("scenarios run DML only");
        return rowsOf(c, sql, values);
      },
      attempt: async (sql, values) => {
        if (!DML_ONLY.test(sql)) throw new Error("scenarios run DML only");
        const name = `sp_${counter++}`;
        await c.query(`SAVEPOINT ${name}`);
        try {
          const result = await c.query(sql, values);
          await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
          return { ok: true, rows: result.rows };
        } catch (error) {
          const e = error as { code?: string; constraint?: string; message?: string };
          await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
          return { ok: false, code: e.code ?? "", constraint: e.constraint ?? "", message: e.message ?? "" };
        }
      },
    };
    try {
      return await fn(query);
    } finally {
      await c.query("ROLLBACK").catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.client.query(Q.unlock).catch(() => undefined);
    await this.client.end().catch(() => undefined);
  }
}

// One guarded run: started, then completed steps, then finished. A failed step records `failed`, and every later step fails visibly.
// Nothing here resets or recovers anything.
export class RunSequence {
  private nextStep = 2;
  failedAt: string | null = null;
  done = false;

  constructor(
    private readonly target: GuardedTarget,
    readonly runId: string,
    readonly name: string,
  ) {}

  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (this.failedAt !== null) throw new Error(`earlier step failed: ${this.failedAt}`);
    if (this.done) throw new Error("the run is already finished");
    let result: T;
    try {
      result = await fn();
    } catch (error) {
      this.failedAt = name;
      await this.target.logRow(this.runId, this.nextStep++, "failed", name, redact(String((error as Error).message ?? error), this.target.creds).slice(0, 300)).catch(() => undefined);
      throw error;
    }
    await this.target.logRow(this.runId, this.nextStep++, "step", name);
    return result;
  }

  async finish(): Promise<void> {
    if (this.failedAt !== null) throw new Error(`earlier step failed: ${this.failedAt}`);
    if (this.done) throw new Error("the run is already finished");
    await this.target.logRow(this.runId, this.nextStep++, "finished", "complete");
    this.done = true;
  }

  // Cleanup hooks call this: it records `failed` for a run that neither finished nor failed. It never resets or recovers.
  async abandonIfOpen(): Promise<void> {
    if (this.done || this.failedAt !== null) return;
    this.failedAt = "incomplete";
    await this.target.logRow(this.runId, this.nextStep++, "failed", "incomplete", "run ended before it finished").catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Prisma CLI: its own process, an empty working directory, a minimal environment, and the update-check opt-outs.

export type PrismaResult = { status: number | null; stdout: string; stderr: string; leaked: boolean };

export function runPrisma(creds: Credentials, args: readonly string[]): PrismaResult {
  const bin = path.join(PLATFORM_ROOT, "node_modules", "prisma", "build", "index.js");
  const config = path.join(PLATFORM_ROOT, "prisma.test.config.mjs");
  const cwd = path.join(STAGE2_DIR, "empty-cwd");
  assertPrivate(cwd, "dir", [0o700], "empty-cwd");
  if (readdirSync(cwd).length !== 0) throw new GuardRefusal("empty-cwd", "the empty working directory is not empty");
  const result = spawnSync(process.execPath, [bin, ...args, "--config", config], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: homedir(),
      PLATFORM_TEST_CREDENTIALS_DIR: creds.dir,
      CHECKPOINT_DISABLE: "1",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
      NO_COLOR: "1",
      NODE_ENV: "test",
    },
  });
  const raw = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    status: result.status,
    stdout: redact(result.stdout ?? "", creds),
    stderr: redact(result.stderr ?? "", creds),
    leaked: creds.secrets().some((s) => s !== "" && raw.includes(s)),
  };
}

export function migrationFolders(): MigrationFolder[] {
  const dir = path.join(PLATFORM_ROOT, "prisma", "migrations");
  return readdirSync(dir)
    .filter((name) => name !== "migration_lock.toml")
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name, "migration.sql"), "utf8") }));
}

export const identityUpSql = (): string => readFileSync(path.join(PLATFORM_ROOT, "prisma", "migrations", IDENTITY_MIGRATION, "migration.sql"), "utf8");
export const identityDownSql = (): string => readFileSync(path.join(PLATFORM_ROOT, "prisma", "rollbacks", `${IDENTITY_MIGRATION}.down.sql`), "utf8");
export const schemaPath = (): string => path.join(PLATFORM_ROOT, "prisma", "schema.prisma");

// Evidence files for the final comparison. The only file write in the Stage 2 code, and only into the snapshots folder.
export function writeSnapshotFile(name: "snapshot-A.json" | "snapshot-B.json", lines: readonly string[]): void {
  mkdirSync(path.join(STAGE2_DIR, "snapshots"), { recursive: true, mode: 0o700 });
  writeFileSync(path.join(STAGE2_DIR, "snapshots", name), JSON.stringify({ version: 1, lines, sha256: fingerprintSha(lines) }, null, 1), { flag: "wx", mode: 0o600 });
}

export function readSnapshotFile(name: "snapshot-A.json" | "snapshot-B.json"): string[] {
  const parsed = JSON.parse(readFileSync(path.join(STAGE2_DIR, "snapshots", name), "utf8")) as { lines: string[]; sha256: string };
  if (parsed.sha256 !== fingerprintSha(parsed.lines)) throw new Error(`${name} does not match its own checksum`);
  return parsed.lines;
}
