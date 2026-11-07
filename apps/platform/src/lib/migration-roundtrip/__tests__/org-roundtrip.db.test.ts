import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkDownSql } from "../down-sql";
import { checkHistory, checkHistoryAfterDown, migrationChecksum } from "../history";
import { diffSnapshots } from "../inventory";
import {
  BASELINE_MIGRATION,
  Credentials,
  GuardedTarget,
  IDENTITY_MIGRATION,
  IDENTITY_TABLES,
  ORG_FUNCTIONS,
  ORG_MIGRATION,
  ORG_TABLES,
  PLATFORM_ROOT,
  RunSequence,
  loadCredentials,
  migrationFolders,
  openGuarded,
  runPrisma,
  schemaPath,
} from "./db-target";

// F3.2.1 migration round trip on the isolated Stage 2 database: apply the organisation migration (if it is not applied yet), check the history
// and checksum, compare the catalogue with Prisma, prove the rollback is atomic and removes only what this migration created, apply it again
// and compare the two catalogues. Only the organisation migration is rolled back; the baseline and identity migrations stay applied.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);

const upSql = () => readFileSync(path.join(PLATFORM_ROOT, "prisma", "migrations", ORG_MIGRATION, "migration.sql"), "utf8");
const downSql = () => readFileSync(path.join(PLATFORM_ROOT, "prisma", "rollbacks", `${ORG_MIGRATION}.down.sql`), "utf8");
const publicFunctions = async (target: GuardedTarget) =>
  (await target.readQuery("select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1")).map((r) => String(r.name));

// Like R1 and R4, this round trip belongs to the point where its migration is the last one: a later migration (the Caterly team list has a foreign key to
// organisations) makes rolling the organisation migration back unsafe, so it stands down once there are more than three (baseline, identity, organisation).
const throughOrganisationOnly = migrationFolders().length <= 3;

describe.skipIf(credentials === null || !throughOrganisationOnly)("F3.2.1 organisation migration round trip (isolated test database)", () => {
  const creds = credentials as Credentials;
  let target: GuardedTarget;
  let run: RunSequence;
  let snapshotA: string[] = [];
  let firstChecksum = "";
  const identityOnly = ["_prisma_migrations", ...IDENTITY_TABLES].sort();
  const everything = ["_prisma_migrations", ...IDENTITY_TABLES, ...ORG_TABLES].sort();

  beforeAll(async () => {
    target = await openGuarded(creds, { applicationName: "platform-f321-guard:roundtrip" });
    run = await target.beginRun("org-roundtrip");
    console.log(`F3.2.1 round trip run id: ${run.runId}`);
  });

  afterAll(async () => {
    try {
      await run?.abandonIfOpen();
    } finally {
      await target?.close();
    }
  });

  const deploy = (label: string) => {
    const result = runPrisma(creds, ["migrate", "deploy"]);
    expect(result.leaked, `${label}: a secret appeared in Prisma output`).toBe(false);
    expect(result.status, `${label}: ${result.stdout}\n${result.stderr}`).toBe(0);
    return result;
  };

  it("static: the rollback file drops exactly the tables and functions the migration creates, in a safe order", () => {
    const check = checkDownSql(downSql(), upSql());
    expect(check.ok ? [] : check.problems).toEqual([]);
    if (check.ok) {
      expect([...check.tables].sort()).toEqual([...ORG_TABLES].sort());
      expect([...check.functions].sort()).toEqual([...ORG_FUNCTIONS].sort());
    }
  });

  it("precondition: the baseline and identity migrations are applied and nothing of the organisation schema is half there", () =>
    run.step("precondition", async () => {
      const rows = await target.migrationRows();
      const names = rows.map((r) => r.migration_name);
      expect(names).toContain(BASELINE_MIGRATION);
      expect(names).toContain(IDENTITY_MIGRATION);
      const relations = await target.publicRelations();
      expect(relations).toEqual(names.includes(ORG_MIGRATION) ? everything : identityOnly);
      expect(await target.identityCounts()).toEqual({ legacy_mappings: 0, user_identities: 0, users: 0 });
    }));

  it("deploy-1: prisma validate, then migrate deploy applies the organisation migration (a no-op when it is already applied)", () =>
    run.step("deploy-1", async () => {
      const validate = runPrisma(creds, ["validate"]);
      expect(validate.leaked).toBe(false);
      expect(validate.status, `${validate.stdout}\n${validate.stderr}`).toBe(0);
      const before = (await target.migrationRows()).map((r) => r.migration_name);
      const result = deploy("deploy-1");
      if (!before.includes(ORG_MIGRATION)) expect(result.stdout).toContain(ORG_MIGRATION);
      expect(await target.publicRelations()).toEqual(everything);
      expect(await publicFunctions(target)).toEqual([...ORG_FUNCTIONS].sort());
    }));

  it("history-checksum: the history rows match the folders and each checksum is the SHA-256 of its file", () =>
    run.step("history-checksum", async () => {
      const rows = await target.migrationRows();
      const folders = migrationFolders();
      expect(folders.map((f) => f.name)).toEqual([BASELINE_MIGRATION, IDENTITY_MIGRATION, ORG_MIGRATION]);
      const verdict = checkHistory(rows, folders);
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
      firstChecksum = rows.find((r) => r.migration_name === ORG_MIGRATION)?.checksum ?? "";
      expect(firstChecksum).toBe(migrationChecksum(folders[2].sql));
      console.log(`organisation migration checksum ${firstChecksum}`);
    }));

  it("snapshot-A-diff: snapshot A of the catalogue, and Prisma sees no difference from the schema", () =>
    run.step("snapshot-A-diff", async () => {
      snapshotA = await target.snapshot();
      expect(snapshotA.length).toBeGreaterThan(100);
      const diff = runPrisma(creds, ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath(), "--exit-code"]);
      expect(diff.leaked).toBe(false);
      console.log(`migrate diff exit ${diff.status}\n${diff.stdout.trim()}`);
      expect(diff.status, `${diff.stdout}\n${diff.stderr}`).toBe(0);
    }));

  it("atomicity-check: the rollback and the history-row delete are rolled back together", () =>
    run.step("atomicity-check", async () => {
      await target.downTransaction(downSql(), upSql(), ORG_MIGRATION, false);
      expect(await target.snapshot()).toEqual(snapshotA);
      expect(await publicFunctions(target)).toEqual([...ORG_FUNCTIONS].sort());
      const verdict = checkHistory(await target.migrationRows(), migrationFolders());
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
    }));

  it("down: the rollback removes the eight tables, the thirteen functions and exactly the organisation history row, and nothing else", () =>
    run.step("down", async () => {
      await target.downTransaction(downSql(), upSql(), ORG_MIGRATION, true);
      expect(await target.publicRelations()).toEqual(identityOnly);
      expect(await publicFunctions(target)).toEqual([]);
      const rows = await target.migrationRows();
      expect(rows.map((r) => r.migration_name)).toEqual([BASELINE_MIGRATION, IDENTITY_MIGRATION]);
      const verdict = checkHistoryAfterDown(rows, migrationFolders(), ORG_MIGRATION);
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
      expect(await target.identityCounts()).toEqual({ legacy_mappings: 0, user_identities: 0, users: 0 });
    }));

  it("deploy-2: migrate deploy applies the organisation migration again with the same checksum", () =>
    run.step("deploy-2", async () => {
      const result = deploy("deploy-2");
      expect(result.stdout).toContain(ORG_MIGRATION);
      const rows = await target.migrationRows();
      const verdict = checkHistory(rows, migrationFolders());
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
      expect(rows.find((r) => r.migration_name === ORG_MIGRATION)?.checksum).toBe(firstChecksum);
      expect(await publicFunctions(target)).toEqual([...ORG_FUNCTIONS].sort());
    }));

  it("snapshot-B-compare: snapshot B equals snapshot A and the tables are empty", () =>
    run.step("snapshot-B-compare", async () => {
      const snapshotB = await target.snapshot();
      expect(diffSnapshots(snapshotA, snapshotB)).toEqual({ equal: true, onlyInA: [], onlyInB: [] });
      for (const table of ORG_TABLES) {
        expect(Number((await target.readQuery(`select count(*)::int as n from public.${table}`))[0].n), table).toBe(0);
      }
      console.log(`snapshots A and B: ${snapshotB.length} lines each, identical`);
    }));

  it("finish: the round trip run completes", () => run.finish());
});
