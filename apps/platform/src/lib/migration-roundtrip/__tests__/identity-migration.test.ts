import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { check, findProblems } from "../../../../../../scripts/check-migrations.mjs";
import { EMAIL_TRIM_CODES, EMAIL_TRIM_SQL } from "../../../modules/users/email";
import { checkDownSql, createdTables } from "../down-sql";
import { checkHistory, migrationChecksum } from "../history";

// These tests read the files as text. They run no SQL and make no connection: what the database does with the CHECKs is Stage 2.
const platformRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const NAME = "20261104190000_identity_tables";
const migrationsDir = `${platformRoot}prisma/migrations`;
const up = readFileSync(`${migrationsDir}/${NAME}/migration.sql`, "utf8");
const down = readFileSync(`${platformRoot}prisma/rollbacks/${NAME}.down.sql`, "utf8");
const schema = readFileSync(`${platformRoot}prisma/schema.prisma`, "utf8");

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const upFlat = squash(up);
const code = up.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

const tableBlock = (table: string) => {
  const match = code.match(new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`));
  expect(match, `table ${table}`).not.toBeNull();
  return (match as RegExpMatchArray)[1];
};
const columnsOf = (table: string) => [...tableBlock(table).matchAll(/^\s+"([a-z_]+)" /gm)].map((m) => m[1]);
const has = (statement: string) => expect(upFlat).toContain(statement);

describe("identity migration (text only)", () => {
  it("creates exactly the three tables, additively", () => {
    expect(createdTables(up)).toEqual(["users", "user_identities", "legacy_mappings"]);
    expect(findProblems(up)).toEqual([]);
    expect(check()).toEqual([]);
    expect(code).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bCREATE\s+(TRIGGER|FUNCTION|EXTENSION|TYPE)\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+"?\w+"?\s+SET\b/i);
  });

  it("has the users columns, defaults and key", () => {
    expect(columnsOf("users")).toEqual(["id", "email", "status", "email_verified_at", "created_at", "updated_at"]);
    has('"id" UUID NOT NULL DEFAULT gen_random_uuid(), "email" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT \'active\', "email_verified_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "users_pkey" PRIMARY KEY ("id")');
    has('CREATE UNIQUE INDEX "users_email_key" ON "users"("email");');
  });

  it("has the email CHECKs: non-empty, trimmed of exactly six characters by chr(), lower-case", () => {
    has('ADD CONSTRAINT "users_email_not_empty" CHECK (length("email") > 0);');
    has(`ADD CONSTRAINT "users_email_trimmed" CHECK ("email" = btrim("email", ${EMAIL_TRIM_SQL}));`);
    has('ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));');
  });

  it("writes the trim set once, by decimal code, with no backslash escape and no E-string anywhere", () => {
    expect(up).not.toContain("\\");
    expect(up).not.toMatch(/\bE'/);
    expect(up.match(/chr\(\d+\)/g)).toEqual(EMAIL_TRIM_CODES.map((c) => `chr(${c})`));
    expect(EMAIL_TRIM_CODES.map((c) => String.fromCharCode(c)).join("")).toBe(" \t\n\u000b\f\r");
  });

  it("limits status to active and disabled, defaulting to active", () => {
    has('ADD CONSTRAINT "users_status_check" CHECK ("status" IN (\'active\', \'disabled\'));');
    expect(upFlat).toContain(`"status" TEXT NOT NULL DEFAULT 'active'`);
  });

  it("has user_identities with non-blank provider and subject and both unique keys", () => {
    expect(columnsOf("user_identities")).toEqual(["id", "user_id", "provider", "subject", "created_at"]);
    has('ADD CONSTRAINT "user_identities_provider_not_blank" CHECK (btrim("provider") <> \'\');');
    has('ADD CONSTRAINT "user_identities_subject_not_blank" CHECK (btrim("subject") <> \'\');');
    has('CREATE UNIQUE INDEX "user_identities_provider_subject_key" ON "user_identities"("provider", "subject");');
    has('CREATE UNIQUE INDEX "user_identities_user_id_provider_key" ON "user_identities"("user_id", "provider");');
  });

  it("has legacy_mappings limited to the user kind, with batch_id NOT NULL and nothing else on it", () => {
    expect(columnsOf("legacy_mappings")).toEqual(["id", "user_id", "source_system", "kind", "legacy_id", "batch_id", "created_at"]);
    has('"batch_id" TEXT NOT NULL,');
    expect(code.match(/batch_id/g)).toHaveLength(1);
    has('ADD CONSTRAINT "legacy_mappings_kind_check" CHECK ("kind" = \'user\');');
    has('ADD CONSTRAINT "legacy_mappings_source_system_not_blank" CHECK (btrim("source_system") <> \'\');');
    has('ADD CONSTRAINT "legacy_mappings_legacy_id_not_blank" CHECK (btrim("legacy_id") <> \'\');');
    has('CREATE UNIQUE INDEX "legacy_mappings_source_system_kind_legacy_id_key" ON "legacy_mappings"("source_system", "kind", "legacy_id");');
    has('CREATE UNIQUE INDEX "legacy_mappings_user_id_source_system_kind_key" ON "legacy_mappings"("user_id", "source_system", "kind");');
  });

  it("restricts both foreign keys on delete and on update, with no cascade or set-null anywhere", () => {
    const fks = [...code.matchAll(/ADD CONSTRAINT "([a-z_]+)" FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE RESTRICT ON UPDATE RESTRICT;/g)].map((m) => m[1]);
    expect(fks).toEqual(["user_identities_user_id_fkey", "legacy_mappings_user_id_fkey"]);
    expect((code.match(/FOREIGN KEY/g) ?? []).length).toBe(2);
    expect(code).not.toMatch(/CASCADE|SET NULL|SET DEFAULT/i);
  });

  it("has no credential, password or provider-specific column, and no email outside users", () => {
    for (const table of ["users", "user_identities", "legacy_mappings"]) {
      for (const column of columnsOf(table)) expect(column, `${table}.${column}`).not.toMatch(/password|secret|token|credential|hash|salt|otp|key$/i);
    }
    expect(columnsOf("user_identities").concat(columnsOf("legacy_mappings"))).not.toContain("email");
  });

  it("uses timestamptz for every time column", () => {
    expect(code.match(/TIMESTAMPTZ\(3\)/g)).toHaveLength(5);
    expect(code).not.toMatch(/\bTIMESTAMP\b/);
  });
});

describe("identity migration against the Prisma schema (text only)", () => {
  it("names the same tables, constraints and indexes", () => {
    for (const table of ["users", "user_identities", "legacy_mappings"]) expect(schema).toContain(`@@map("${table}")`);
    for (const name of [...code.matchAll(/CREATE UNIQUE INDEX "([a-z_]+)"/g)].map((m) => m[1])) expect(schema, name).toContain(`"${name}"`);
    for (const name of [...code.matchAll(/CONSTRAINT "([a-z_]+_pkey)"/g)].map((m) => m[1])) expect(schema, name).toContain(`"${name}"`);
    for (const name of [...code.matchAll(/ADD CONSTRAINT "([a-z_]+_fkey)"/g)].map((m) => m[1])) expect(schema, name).toContain(`"${name}"`);
  });

  it("maps the columns, types and defaults the migration uses", () => {
    expect(schema).toContain('@default(dbgenerated("gen_random_uuid()")) @db.Uuid');
    expect(schema).toContain('status          String    @default("active")');
    expect(schema).toContain("@default(now()) @updatedAt @map(\"updated_at\") @db.Timestamptz(3)");
    expect(schema.match(/@db\.Timestamptz\(3\)/g)).toHaveLength(5);
    expect(schema).not.toMatch(/@db\.Timestamp\(/);
    expect(schema.match(/onDelete: Restrict, onUpdate: Restrict/g)).toHaveLength(2);
    expect(schema).not.toMatch(/Cascade|SetNull/);
    for (const column of ["email_verified_at", "created_at", "updated_at", "user_id", "source_system", "legacy_id", "batch_id"]) expect(schema).toContain(`@map("${column}")`);
  });

  it("keeps batch_id a plain required string and kind a plain string (their checks live in the SQL)", () => {
    expect(schema).toMatch(/batchId\s+String\s+@map\("batch_id"\)\n/);
    expect(schema).toMatch(/kind\s+String\n/);
  });
});

describe("identity rollback (text only)", () => {
  it("is exactly three plain DROP TABLEs, children first", () => {
    expect(down.split("\n").filter((line) => !line.startsWith("--") && line.trim() !== "")).toEqual([
      'DROP TABLE "legacy_mappings";',
      'DROP TABLE "user_identities";',
      'DROP TABLE "users";',
    ]);
  });

  it("passes the static rollback check against the forward migration", () => {
    expect(checkDownSql(down, up)).toEqual({ ok: true, tables: ["legacy_mappings", "user_identities", "users"] });
  });
});

describe("migration folders (text only)", () => {
  const names = readdirSync(migrationsDir).filter((n) => n !== "migration_lock.toml").sort();

  it("sorts the identity migration after the baseline", () => {
    expect(names).toEqual(["20261101000000_baseline", NAME]);
  });

  it("fits the history check when the history is built from these exact files", () => {
    const folders = names.map((name) => ({ name, sql: readFileSync(`${migrationsDir}/${name}/migration.sql`, "utf8") }));
    const rows = folders.map((f) => ({ migration_name: f.name, checksum: migrationChecksum(f.sql), finished_at: new Date(), rolled_back_at: null }));
    expect(checkHistory(rows, folders)).toEqual({ ok: true });
  });
});
