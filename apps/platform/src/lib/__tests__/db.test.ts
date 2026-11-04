import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { check, findProblems } from "../../../../../scripts/check-migrations.mjs";
import { Credentials, GuardedTarget, RunSequence, expectedPublicTables, loadCredentials, openGuarded } from "../migration-roundtrip/__tests__/db-target";

// Two modes. Development (the default): the original checks against DATABASE_URL, which is loaded from .env.
// Isolated test database: when PLATFORM_TEST_CREDENTIALS_DIR is set, the same checks run read-only through the guard against
// platterly_platform_test, and no .env file is read at all.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);
if (credentials === null) await import("dotenv/config");

describe.skipIf(credentials !== null)("platform database", () => {
  let pool: Pool;
  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(() => pool?.end());

  it("is its own database with its own role", async () => {
    const { rows } = await pool.query("select current_user as u, current_database() as d");
    expect(rows[0]).toEqual({ u: "platterly_platform_app", d: "platterly_platform" });
  });

  it("has the baseline migration applied and exactly the tables of the migrations applied so far", async () => {
    const migrations = await pool.query("select migration_name from _prisma_migrations where finished_at is not null");
    const names = migrations.rows.map((r) => r.migration_name as string);
    expect(names).toContain("20261101000000_baseline");
    const tables = await pool.query("select table_name from information_schema.tables where table_schema = 'public' and table_name <> '_prisma_migrations'");
    expect(tables.rows.map((r) => r.table_name as string).sort()).toEqual([...expectedPublicTables(names)].sort());
  });

  it("cannot read the catering or Ops databases' tables", async () => {
    for (const db of ["platterly_dev", "platterly_ops"]) {
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = `/${db}`;
      const other = new Pool({ connectionString: url.toString() });
      try {
        await expect(other.query('select 1 from "user" limit 1')).rejects.toThrow(/permission denied|does not exist/);
      } finally {
        await other.end();
      }
    }
  });
});

// Run 3 of 4 (db.test.ts): read-only, against the migrated isolated test database, as its own guarded run.
describe.skipIf(credentials === null)("platform database (isolated test database)", () => {
  const creds = credentials as Credentials;
  let target: GuardedTarget;
  let run: RunSequence;

  beforeAll(async () => {
    target = await openGuarded(creds, { applicationName: "platform-stage2-guard:db-test" });
    run = await target.beginRun("db-test");
    console.log(`R3 run id: ${run.runId}`);
  });

  afterAll(async () => {
    try {
      await run?.abandonIfOpen();
    } finally {
      await target?.close();
    }
  });

  it("preconditions: is its own database with its own role", () =>
    run.step("preconditions", async () => {
      const rows = await target.readQuery("select current_user as u, current_database() as d");
      expect(rows[0]).toEqual({ u: "platterly_platform_test_app", d: "platterly_platform_test" });
    }));

  it("tables-and-history: the baseline is applied and the tables are exactly those of the migrations applied", () =>
    run.step("tables-and-history", async () => {
      const names = (await target.migrationRows()).filter((r) => r.finished_at !== null).map((r) => r.migration_name);
      expect(names).toContain("20261101000000_baseline");
      const tables = (await target.publicRelations()).filter((name) => name !== "_prisma_migrations").sort();
      expect(tables).toEqual([...expectedPublicTables(names)].sort());
      expect(tables).toHaveLength(3);
    }));

  it("db-test-checks: cannot read the catering or Ops databases' tables", () =>
    run.step("db-test-checks", async () => {
      for (const db of ["platterly_dev", "platterly_ops"]) {
        const url = new URL(creds.url());
        url.pathname = `/${db}`;
        const other = new Pool({ connectionString: url.toString() });
        try {
          await expect(other.query('select 1 from "user" limit 1')).rejects.toThrow(/permission denied|does not exist/);
        } finally {
          await other.end();
        }
      }
    }));

  it("finish: the db.test.ts run completes", () => run.finish());
});

describe("migration guard covers Platform", () => {
  it("passes the real migration folders", () => {
    expect(check()).toEqual([]);
  });

  it("blocks risky SQL in a Platform migration folder and accepts an approved or additive one", () => {
    const dir = mkdtempSync(join(tmpdir(), "platform-migrations-"));
    const add = (name: string, sql: string) => {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, "migration.sql"), sql);
    };
    add("20270101000000_additive", 'CREATE TABLE "account" ("id" TEXT NOT NULL);');
    add("20270101000001_drop", 'DROP TABLE "account";');
    add("20270101000002_delete", 'DELETE FROM "account";');
    add("20270101000003_approved", '-- data-safe-approved: table is empty in every environment\nDROP TABLE "account";');
    const failures = check([dir]);
    expect(failures.map((f: { name: string }) => f.name).sort()).toEqual(["20270101000001_drop", "20270101000002_delete"]);
    expect(findProblems('ALTER TABLE "a" DROP COLUMN "b";')).toEqual(["drops a column"]);
  });
});
